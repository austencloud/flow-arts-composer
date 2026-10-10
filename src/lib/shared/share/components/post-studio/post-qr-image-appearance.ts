import type {
  PostCardItem,
  PostImageItem,
} from "#lib/shared/media-composition/domain/post-project.js";
import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";
import { DARK_POST_QR_STYLE } from "@tka/render-composition";
import { cardOptionsForItem } from "./post-item-render-options";

export type PostQrAppearance = NonNullable<PostImageItem["qrAppearance"]>;

export function posterQrAppearance(
  options: Partial<SequenceExportOptions> | null | undefined,
  card: PostCardItem | null | undefined
): PostQrAppearance {
  return cardOptionsForItem(options, card)?.visibilityOverrides?.darkMode ===
    false
    ? "light"
    : "dark";
}

const payloads = new Map<string, Promise<string | null>>();
const rendered = new Map<string, Promise<string | null>>();
const CACHE_LIMIT = 80;

function remember<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  value: Promise<T>
): Promise<T> {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return value;
}

/** Only replace artwork when the QR occupies the image, not a photo containing one. */
export function isQrArtwork(
  detections: {
    rawValue: string;
    boundingBox: { width: number; height: number };
  }[],
  width: number,
  height: number
): string | null {
  if (detections.length !== 1 || width <= 0 || height <= 0) return null;
  const code = detections[0]!;
  if (
    code.boundingBox.width / width < 0.65 ||
    code.boundingBox.height / height < 0.65
  )
    return null;
  try {
    const url = new URL(code.rawValue);
    return url.protocol === "https:" || url.protocol === "http:"
      ? code.rawValue
      : null;
  } catch {
    return null;
  }
}

export function qrPayloadForImage(sourceUrl: string): Promise<string | null> {
  const cached = payloads.get(sourceUrl);
  if (cached) return cached;
  return remember(
    payloads,
    sourceUrl,
    (async () => {
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) return null;
        const bitmap = await createImageBitmap(await response.blob());
        try {
          const { createTkaQrDetector } =
            await import("#lib/shared/qr/services/tka-qr-detector.js");
          const codes = await createTkaQrDetector().detect(bitmap);
          return isQrArtwork(codes, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      } catch {
        return null;
      }
    })()
  );
}

/** Keep the original until an actual QR has been decoded. Both editor and export read the same image element. */
export function qrImageForAppearance(
  sourceUrl: string,
  appearance: PostQrAppearance
): Promise<string | null> {
  const key = `${appearance}:${sourceUrl}`;
  const cached = rendered.get(key);
  if (cached) return cached;
  return remember(
    rendered,
    key,
    (async () => {
      const payload = await qrPayloadForImage(sourceUrl);
      if (!payload) return null;
      const { getUrlQRCodeGenerator } =
        await import("#lib/shared/qr/get-qr-code-generator.js");
      const generator = getUrlQRCodeGenerator();
      const result = await generator.generateForUrl(payload, {
        size: 512,
        margin: 1,
        style:
          appearance === "dark"
            ? {
                ...generator.getPresetStyle("modern"),
                color: DARK_POST_QR_STYLE.color,
                backgroundColor: DARK_POST_QR_STYLE.backgroundColor,
              }
            : "modern",
      });
      return result.dataUrl;
    })()
  );
}
