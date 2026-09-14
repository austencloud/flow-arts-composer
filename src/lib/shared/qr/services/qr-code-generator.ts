/**
 * QR Code Generator Implementation
 *
 * Generates styled QR codes using qr-code-styling library.
 * Features modern styling options including rounded dots,
 * custom corner styles, and TKA branding.
 *
 * Domain: QR - Code Generation
 */

import QRCodeStyling from "qr-code-styling";
import {
  MODERN_QR_STYLE,
  applyDarkQrStyle,
  createStyledQrOptions,
} from "@tka/render-composition";

// The style owner lives in the shared package so the MCP card paints the same QR.
export { PLAY_GREEN, playIconDataUrl } from "@tka/render-composition";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ShortCodeManager } from "./short-code-manager";
import type {
  QRCodeOptions,
  QRCodeResult,
  QRCodeStyle,
  QRStylePreset,
} from "./types";
import {
  getQrImageCache,
  QR_IMAGE_CACHE_SCHEMA,
  type QrImageCache,
} from "./qr-image-cache";
import {
  warmSequenceCells,
  type WarmOptions,
  type WarmSequenceCellsResult,
} from "$lib/shared/render/services/warm-sequence-cells";
import { resolveScanPropConfig } from "./scan-prop-resolver";
import { PreparedQrCache, type PreparedQrStore } from "./prepared-qr-cache";

type CellWarmer = (
  sequence: SequenceData,
  options: WarmOptions
) => Promise<WarmSequenceCellsResult>;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Aborted", "AbortError");
}

/**
 * Style presets for quick styling
 */
const STYLE_PRESETS: Record<QRStylePreset, QRCodeStyle> = {
  modern: MODERN_QR_STYLE as QRCodeStyle,
  classic: {
    dotsType: "square",
    cornersSquareType: "square",
    cornersDotType: "square",
    color: "#000000",
    backgroundColor: "#ffffff",
    errorCorrectionLevel: "M",
  },
  minimal: {
    dotsType: "dots",
    cornersSquareType: "dot",
    cornersDotType: "dot",
    color: "#333333",
    backgroundColor: "#ffffff",
    errorCorrectionLevel: "L",
  },
};

export class QRCodeGenerator {
  /** Memory-only map of decoded QR images, keyed by dataUrl. The SVG render
   *  is cached persistently (`imageCache`); this avoids re-decoding the same
   *  dataURL into an `HTMLImageElement` within a session (e.g. every card in a
   *  deck that shares a payload). Bounded with insertion-order LRU eviction so a
   *  long-lived tab generating QR codes for many distinct sequences can't
   *  accumulate decoded images indefinitely. */
  private readonly decodedImages = new Map<string, HTMLImageElement>();

  /** Cap on `decodedImages` entries. Comfortably above a single deck render's
   *  distinct-payload count; evicts the oldest entry past the cap. */
  private static readonly MAX_DECODED_IMAGES = 256;

  /**
   * The short-code manager is only needed for sequence QRs (they mint
   * tka.run codes). URL-only consumers — e.g. the festival signup card,
   * rendered from a bare harness with no app-shell wiring — may omit it.
   */
  constructor(
    private readonly shortCodeManager?: ShortCodeManager,
    private readonly imageCache: QrImageCache = getQrImageCache(),
    private readonly cellWarmer: CellWarmer = warmSequenceCells,
    private readonly preparedCache: PreparedQrStore = new PreparedQrCache(
      imageCache
    ),
    // The admin baker supplies a Node SVG runtime; styling stays owned here.
    private readonly createQr: (
      options: ConstructorParameters<typeof QRCodeStyling>[0]
    ) => Pick<QRCodeStyling, "getRawData"> = (options) =>
      new QRCodeStyling(options)
  ) {}

  /**
   * Resolve style from preset name or object
   */
  private resolveStyle(styleInput?: QRCodeStyle | QRStylePreset): QRCodeStyle {
    if (!styleInput) {
      return STYLE_PRESETS.modern;
    }

    if (typeof styleInput === "string") {
      return STYLE_PRESETS[styleInput] || STYLE_PRESETS.modern;
    }

    // Merge with defaults
    return {
      ...STYLE_PRESETS.modern,
      ...styleInput,
    };
  }

  /**
   * Create QRCodeStyling options from our style interface
   */
  private createQROptions(
    url: string,
    size: number,
    margin: number,
    style: QRCodeStyle,
    centerIcon: "play" | "none"
  ): ConstructorParameters<typeof QRCodeStyling>[0] {
    return createStyledQrOptions(
      url,
      size,
      margin,
      style,
      centerIcon
    ) as ConstructorParameters<typeof QRCodeStyling>[0];
  }

  /**
   * Generate QR code and return SVG + data URL
   */
  private async generateQR(
    url: string,
    options?: QRCodeOptions
  ): Promise<{ svg: string; dataUrl: string }> {
    const size = options?.size || 200;
    const margin = options?.margin || 1;
    const centerIcon = options?.centerIcon ?? "play";
    let style = this.resolveStyle(options?.style);

    // Dark mode: white modules on transparent background
    if (options?.darkMode) {
      style = applyDarkQrStyle(style) as QRCodeStyle;
    }

    // Persistent image cache: the qr-code-styling render + getRawData is the
    // expensive bit (the QR=93% bottleneck). Key on everything that changes the
    // pixels — url + size + margin + resolved style — so a repeat payload is a
    // pure cache read, no render.
    const cacheKey = `${QR_IMAGE_CACHE_SCHEMA}:${size}:${margin}:${centerIcon}:${JSON.stringify(style)}:${url}`;
    const cachedImage = await this.imageCache.get(cacheKey);
    if (cachedImage) {
      return cachedImage;
    }

    const qrCode = this.createQr(
      this.createQROptions(url, size, margin, style, centerIcon)
    );

    // Get SVG blob
    const svgBlob = await qrCode.getRawData("svg");
    if (!svgBlob) {
      throw new Error("Failed to generate QR code SVG");
    }

    // Convert blob/buffer to text for SVG string
    let svgText: string;
    if (svgBlob instanceof Blob) {
      svgText = await svgBlob.text();
    } else {
      // Node.js Buffer case
      svgText = svgBlob.toString("utf-8");
    }

    // Create data URL
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgText)}`;

    const result = { svg: svgText, dataUrl };
    void this.imageCache.set(cacheKey, result);
    return result;
  }

  async generateForSequence(
    sequence: SequenceData,
    options?: QRCodeOptions
  ): Promise<QRCodeResult> {
    throwIfAborted(options?.signal);
    const explicitCatDogMode =
      options?.leftPropType && options.rightPropType
        ? options.leftPropType !== options.rightPropType
        : undefined;
    const propConfig = resolveScanPropConfig(sequence, {
      leftPropType: options?.leftPropType,
      rightPropType: options?.rightPropType,
      catDogMode: explicitCatDogMode,
    });
    const propOptions = {
      leftPropType: propConfig.leftPropType,
      rightPropType: propConfig.rightPropType,
      catDogMode: propConfig.catDogMode,
      viewMode: options?.viewMode,
      deckId: options?.deckId,
      deckName: options?.deckName,
    };

    const preparedKey = await this.preparedCache.keyFor(
      sequence,
      propConfig,
      options
    );
    const ready = await this.preparedCache.get(preparedKey);
    throwIfAborted(options?.signal);
    if (ready) return ready;

    // A printable QR is a promise that its landing page is ready. Confirm the
    // exact prop pair in both supported card themes before minting or returning
    // the code; scanners should download these cells, never discover that the
    // publisher's background warm silently failed and rasterize on a phone.
    for (const isDark of [true, false]) {
      await this.cellWarmer(sequence, {
        isDark,
        leftPropType: propConfig.leftPropType,
        rightPropType: propConfig.rightPropType,
        catDogMode: propConfig.catDogMode,
        requireComplete: true,
        signal: options?.signal,
        onActivity: options?.onActivity,
      });
      options?.onActivity?.();
      throwIfAborted(options?.signal);
    }

    // Every QR is the Firebase short code (tka.run/<code>). The dense "offline"
    // s~ path that baked the whole sequence into the URL is gone — those QRs
    // were unscannable and varied in module density. Callers gate guests out
    // before they ever reach here (guests get no QR at all).
    if (!this.shortCodeManager) {
      throw new Error(
        "QRCodeGenerator: sequence QRs require a ShortCodeManager; this instance was constructed URL-only"
      );
    }
    const { code, url: shortUrl } = await this.shortCodeManager.createShortCode(
      sequence,
      propOptions
    );
    options?.onActivity?.();
    throwIfAborted(options?.signal);

    // Generate QR code
    const { svg, dataUrl } = await this.generateQR(shortUrl, options);

    const result = {
      svg,
      dataUrl,
      encodedUrl: shortUrl,
      shortCode: code,
    };
    // Only successful preparation may publish this reusable readiness proof.
    // Uploading it never delays displaying or saving the QR that is ready now.
    void this.preparedCache.set(preparedKey, result).catch(() => {});
    return result;
  }

  /**
   * Returns previously prepared QR artwork without warming cells, allocating a
   * short code, or rendering a new SVG. Gallery cards use this while scrolling:
   * a missing preparation is ordinary and leaves the card without a QR.
   *
   * Prepared records are baked at the canonical 200px size. SVG is vector
   * artwork, so callers can draw that same record at their own display size.
   */
  async findPreparedForSequence(
    sequence: SequenceData,
    options?: QRCodeOptions
  ): Promise<QRCodeResult | null> {
    throwIfAborted(options?.signal);
    const explicitCatDogMode =
      options?.leftPropType && options.rightPropType
        ? options.leftPropType !== options.rightPropType
        : undefined;
    const propConfig = resolveScanPropConfig(sequence, {
      leftPropType: options?.leftPropType,
      rightPropType: options?.rightPropType,
      catDogMode: explicitCatDogMode,
    });
    const preparedKey = await this.preparedCache.keyFor(sequence, propConfig, {
      ...options,
      // The prepared population is intentionally canonicalized at 200px.
      size: 200,
    });
    throwIfAborted(options?.signal);
    const prepared = await this.preparedCache.get(preparedKey);
    throwIfAborted(options?.signal);
    return prepared;
  }

  /** Decode already-prepared SVG artwork for a canvas caller without taking
   * the generation path. */
  async loadPreparedAsImage(
    sequence: SequenceData,
    options?: QRCodeOptions
  ): Promise<HTMLImageElement | null> {
    const prepared = await this.findPreparedForSequence(sequence, options);
    return prepared ? this.loadDecodedImage(prepared.dataUrl) : null;
  }

  async generateForUrl(
    url: string,
    options?: QRCodeOptions
  ): Promise<QRCodeResult> {
    const { svg, dataUrl } = await this.generateQR(url, options);

    return {
      svg,
      dataUrl,
      encodedUrl: url,
    };
  }

  getPresetStyle(preset: QRStylePreset): QRCodeStyle {
    return { ...STYLE_PRESETS[preset] };
  }

  async generateAsImage(
    sequence: SequenceData,
    size: number,
    options?: QRCodeOptions
  ): Promise<HTMLImageElement> {
    // Generate QR code with the specified size (SVG render is cached upstream)
    const result = await this.generateForSequence(sequence, {
      ...options,
      size,
    });

    return this.loadDecodedImage(result.dataUrl);
  }

  /**
   * Generate an image for an already-resolved URL.
   *
   * Serialized print exports use this after the server has minted a
   * physical-card ID. The sequence's short code is already known at that
   * point, so rerunning sequence warmup and short-code allocation for every
   * physical copy would be wasteful.
   */
  async generateUrlAsImage(
    url: string,
    size: number,
    options?: QRCodeOptions
  ): Promise<HTMLImageElement> {
    const result = await this.generateForUrl(url, {
      ...options,
      size,
    });

    return this.loadDecodedImage(result.dataUrl);
  }

  private loadDecodedImage(dataUrl: string): Promise<HTMLImageElement> {
    // Reuse an already-decoded image for the same dataURL (deck cards sharing a
    // payload decode once). Re-insert on hit so the entry is treated as most
    // recently used by the insertion-order eviction below.
    const existing = this.decodedImages.get(dataUrl);
    if (existing) {
      this.decodedImages.delete(dataUrl);
      this.decodedImages.set(dataUrl, existing);
      return Promise.resolve(existing);
    }

    // Convert data URL to HTMLImageElement
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.decodedImages.set(dataUrl, img);
        // Evict the oldest entry once over the cap (Map iterates in insertion
        // order, so the first key is the least recently used).
        if (this.decodedImages.size > QRCodeGenerator.MAX_DECODED_IMAGES) {
          const oldest = this.decodedImages.keys().next().value;
          if (oldest !== undefined) this.decodedImages.delete(oldest);
        }
        resolve(img);
      };
      img.onerror = () => reject(new Error("Failed to load QR code as image"));
      img.src = dataUrl;
    });
  }
}
