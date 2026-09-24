/**
 * PrintCardRenderer
 *
 * Orchestrates rendering print-ready card faces (front + back) at MPC
 * specifications (822x1122px at 300 DPI with 36px bleed).
 *
 * Fronts: delegates to ImageComposer, then wraps in bleed canvas.
 * Backs: builds and paints the shared BackJob.
 * Info cards: delegates to InfoCardCanvasRenderer.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ImageComposer } from "../../../shared/render/services/image-composer";
import type { PrintRenderOptions } from "./types";
import {
  renderInfoCardFront,
  renderInfoCardBack,
} from "./info-card-canvas-renderer";
import {
  renderSignupCardFront,
  renderSignupCardBack,
} from "./signup-card-canvas-renderer";
import { buildBackJob } from "./card-back/card-back-job-builder";
import { resolveCardBackAppearance } from "./card-back/card-back-appearance";
import { paintBackJob } from "./card-back/card-back-raster";
import { buildFrontComposeOptions } from "./build-front-compose-options";
import { wrapContentInCardFrame } from "./card-front-frame";
import { CompositionDispatcher } from "$lib/shared/render/services/composition-dispatcher";
import { getCompositionDispatcher } from "$lib/shared/render/get-composition-dispatcher";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { CompositionProgressCallback } from "$lib/shared/render/services/types";
import { CARD_SIZES, type CardSizeId } from "../domain/card-sizes";

// MPC poker card defaults
const MPC_WIDTH = 822;
const MPC_HEIGHT = 1122;
const MPC_BLEED = 36;

export class PrintCardRenderer {
  constructor(
    private readonly imageComposer: ImageComposer,
    private readonly theme: string = "cosmic"
  ) {}

  async renderFront(
    sequence: SequenceData,
    options: PrintRenderOptions,
    onProgress?: CompositionProgressCallback
  ): Promise<HTMLCanvasElement> {
    // Single shared builder — same options the worker/parity path consumes, so
    // the two renders stay identical by construction (no hand-mirrored copy).
    const { composeOptions, frame } = buildFrontComposeOptions(
      sequence,
      options
    );

    const htmlFactory = (w: number, h: number): HTMLCanvasElement => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };

    // Worker path: render the inner composite off-thread, keep the cheap,
    // deterministic stripe/bleed frame wrap on the main thread. The QR is
    // generated on the main thread (the worker has no Firebase / new Image())
    // and composited inside the worker from the supplied bitmap.
    if (CompositionDispatcher.canUseWorker()) {
      try {
        const qrBitmap = await this.prerenderQr(
          sequence,
          options,
          composeOptions
        );
        const inner = await getCompositionDispatcher().composeFrontBitmap(
          sequence,
          composeOptions,
          qrBitmap,
          undefined,
          onProgress
        );
        const framed = wrapContentInCardFrame(
          inner,
          frame,
          htmlFactory
        ) as HTMLCanvasElement;
        inner.close();
        return framed;
      } catch (err) {
        console.warn(
          "[PrintCardRenderer] worker front render failed, main-thread fallback:",
          err
        );
        // fall through to the main-thread path below
      }
    }

    // Main-thread render (worker unavailable or per-card fallback). QR is
    // generated internally by composeSequenceImage as today.
    let mainThreadOptions = composeOptions;
    if (options.qrUrl) {
      const qrImage = await this.prerenderQrImage(
        sequence,
        options,
        composeOptions
      );
      if (qrImage) {
        mainThreadOptions = { ...composeOptions, qrImageBitmap: qrImage };
      }
    }
    const sequenceCanvas = await this.imageComposer.composeSequenceImage(
      sequence,
      mainThreadOptions,
      onProgress
    );
    return wrapContentInCardFrame(
      sequenceCanvas,
      frame,
      htmlFactory
    ) as HTMLCanvasElement;
  }

  /**
   * Pre-render the card's QR code on the MAIN thread (the worker has no Firebase
   * and no `new Image()`), returning a transferable ImageBitmap, or null when the
   * card has no QR cell or no generator is wired. Mirrors the parity harness so
   * worker output matches the proven render.
   */
  private async prerenderQr(
    sequence: SequenceData,
    options: PrintRenderOptions,
    composeOptions: Partial<SequenceExportOptions>
  ): Promise<ImageBitmap | null> {
    if (!composeOptions.visibilityOverrides?.showQRCode) return null;
    const qrGen = this.imageComposer.qrGenerator;
    if (!qrGen) return null;
    try {
      const img = await this.prerenderQrImage(
        sequence,
        options,
        composeOptions
      );
      return img ? await createImageBitmap(img) : null;
    } catch (err) {
      console.warn("[PrintCardRenderer] QR pre-render failed:", err);
      return null;
    }
  }

  private async prerenderQrImage(
    sequence: SequenceData,
    options: PrintRenderOptions,
    composeOptions: Partial<SequenceExportOptions>
  ): Promise<HTMLImageElement | null> {
    if (!composeOptions.visibilityOverrides?.showQRCode) return null;
    const qrGen = this.imageComposer.qrGenerator;
    if (!qrGen) return null;
    const qrOptions = {
      style: "modern",
      margin: 1,
      darkMode: false,
      leftPropType: options.leftPropType,
      rightPropType: options.rightPropType,
      deckName: options.deckName,
    } as const;
    return options.qrUrl
      ? qrGen.generateUrlAsImage(options.qrUrl, 600, qrOptions)
      : qrGen.generateAsImage(sequence, 600, qrOptions);
  }

  async renderBack(
    sequence: SequenceData,
    options: PrintRenderOptions
  ): Promise<HTMLCanvasElement> {
    const canvasWidth = options.canvasWidth ?? MPC_WIDTH;
    const canvasHeight = options.canvasHeight ?? MPC_HEIGHT;
    const bleedPx = options.bleedPx ?? MPC_BLEED;
    const theme = options.theme ?? this.theme;
    const appearance = resolveCardBackAppearance(options);

    // The CardPair seam and print output use a scale-2 raster (1644x2244).
    const scale = 2;
    const job = await buildBackJob(sequence, {
      width: canvasWidth * scale,
      height: canvasHeight * scale,
      bleedPx: bleedPx * scale,
      theme,
      ...appearance,
    });
    const off = paintBackJob(job);
    // Convert OffscreenCanvas → HTMLCanvasElement for the CardPair seam.
    const out = document.createElement("canvas");
    out.width = off.width;
    out.height = off.height;
    out.getContext("2d")!.drawImage(off, 0, 0);
    return out;
  }

  async renderInfoCardFront(
    theme?: string,
    deckNumber?: number
  ): Promise<HTMLCanvasElement> {
    return renderInfoCardFront({
      width: MPC_WIDTH,
      height: MPC_HEIGHT,
      bleedPx: MPC_BLEED,
      theme: theme ?? this.theme,
      deckNumber,
    });
  }

  async renderInfoCardBack(theme?: string): Promise<HTMLCanvasElement> {
    return renderInfoCardBack({
      width: MPC_WIDTH,
      height: MPC_HEIGHT,
      bleedPx: MPC_BLEED,
      theme: theme ?? this.theme,
    });
  }
}

/**
 * The "How to Read" insert that ships as card 1 of a printed deck.
 *
 * Standalone rather than a method because the insert draws no pictographs and
 * so needs no ImageComposer — export paths can build it without constructing a
 * renderer. Sized to the deck's card size so the insert matches its stack.
 */
export async function renderInsertCardPair(options: {
  theme: string;
  cardSize?: CardSizeId;
  deckNumber?: number;
}): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }> {
  const size = CARD_SIZES[options.cardSize ?? "poker"];
  const geometry = {
    width: size.canvasWidth,
    height: size.canvasHeight,
    bleedPx: size.bleedPx,
    theme: options.theme,
  };
  const [front, back] = await Promise.all([
    renderInfoCardFront({ ...geometry, deckNumber: options.deckNumber }),
    renderInfoCardBack(geometry),
  ]);
  return { front, back };
}

/**
 * The festival sample-pack signup card (QR → tkaflowarts.com/start).
 * Standalone for the same reason as the insert: no pictographs, no
 * ImageComposer — the 9-up sheet script and the harness build it directly.
 */
export async function renderSignupCardPair(options: {
  theme: string;
  cardSize?: CardSizeId;
}): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }> {
  const size = CARD_SIZES[options.cardSize ?? "poker"];
  const geometry = {
    width: size.canvasWidth,
    height: size.canvasHeight,
    bleedPx: size.bleedPx,
    theme: options.theme,
  };
  const [front, back] = await Promise.all([
    renderSignupCardFront(geometry),
    renderSignupCardBack(geometry),
  ]);
  return { front, back };
}
