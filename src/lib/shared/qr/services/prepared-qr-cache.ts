import { canonicalDigest } from "$lib/shared/foundation/utils/canonical-digest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { encodeSequence } from "$lib/shared/navigation/services/sequence-encoder";
import { canonicalCellKeyString } from "$lib/shared/render/services/cloud-cell-key";
import {
  getCanonicalSequenceCells,
  type WarmOptions,
} from "$lib/shared/render/services/warm-sequence-cells";
import { QR_IMAGE_CACHE_SCHEMA, type QrImageCache } from "./qr-image-cache";
import type { QRCodeOptions, QRCodeResult } from "./types";

export interface PreparedQrStore {
  keyFor(
    sequence: SequenceData,
    props: WarmOptions,
    options?: QRCodeOptions
  ): Promise<string>;
  get(key: string): Promise<QRCodeResult | null>;
  set(key: string, result: QRCodeResult): Promise<void>;
}

const BUCKET = "the-kinetic-alphabet.firebasestorage.app";
const MAX_BYTES = 512 * 1024;
const PREFIX = "prepared-qr-v1";

export function preparedQrUrl(key: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`prepared-qrs/${key}.json`)}?alt=media`;
}

/** A ready QR is shared artwork AND proof that its scan assets were published.
 * This cache is consulted before either the renderer or short-code allocator. */
export class PreparedQrCache implements PreparedQrStore {
  constructor(private readonly local: Pick<QrImageCache, "get" | "set">) {}

  async keyFor(
    sequence: SequenceData,
    props: WarmOptions,
    options?: QRCodeOptions
  ): Promise<string> {
    const cells = getCanonicalSequenceCells(sequence, props);
    return canonicalDigest({
      schema: `${PREFIX}:${QR_IMAGE_CACHE_SCHEMA}`,
      sequence: encodeSequence(sequence),
      // Includes the renderer revision, start pose, durations and participating
      // hands. A changed scan asset must never inherit an old readiness proof.
      cells: cells.flatMap(({ data, options: cellOptions }) =>
        [true, false].map((dark) =>
          canonicalCellKeyString(data, dark, cellOptions)
        )
      ),
      viewMode: options?.viewMode,
      deckId: options?.deckId,
      deckName: options?.deckName,
      size: options?.size || 200,
      margin: options?.margin || 1,
      style: options?.style ?? "modern",
      darkMode: options?.darkMode ?? false,
      centerIcon: options?.centerIcon ?? "play",
    });
  }

  async get(key: string): Promise<QRCodeResult | null> {
    const localKey = `${PREFIX}:${key}`;
    const cached = await this.local.get(localKey);
    if (cached?.prepared)
      return { svg: cached.svg, dataUrl: cached.dataUrl, ...cached.prepared };
    return this.getShared(key);
  }

  /** Bulk baking verifies the public object, independently of this device's cache. */
  async getShared(key: string, timeoutMs = 1500): Promise<QRCodeResult | null> {
    try {
      // An absent or unreachable shared cache must not add an unbounded wait
      // before the existing local preparation path can proceed.
      const response = await fetch(preparedQrUrl(key), {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (
        !response.ok ||
        Number(response.headers.get("content-length")) > MAX_BYTES
      )
        return null;
      const text = await response.text();
      if (text.length > MAX_BYTES) return null;
      const record = JSON.parse(text);
      if (
        record.key !== key ||
        typeof record.svg !== "string" ||
        !/^(?:<\?xml[^?]*\?>\s*)?<svg(?:\s|\/?>)/.test(record.svg.trim()) ||
        typeof record.shortCode !== "string" ||
        typeof record.encodedUrl !== "string"
      )
        return null;
      const url = new URL(record.encodedUrl);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "tka.run" ||
        url.pathname !== `/${record.shortCode}`
      )
        return null;
      const result: QRCodeResult = {
        svg: record.svg,
        dataUrl: `data:image/svg+xml;base64,${btoa(record.svg)}`,
        encodedUrl: record.encodedUrl,
        shortCode: record.shortCode,
      };
      await this.remember(`${PREFIX}:${key}`, result);
      return result;
    } catch {
      return null;
    }
  }

  private remember(key: string, result: QRCodeResult): Promise<void> {
    return this.local.set(key, {
      svg: result.svg,
      dataUrl: result.dataUrl,
      prepared: { encodedUrl: result.encodedUrl, shortCode: result.shortCode! },
    });
  }

  async set(key: string, result: QRCodeResult): Promise<void> {
    if (!result.shortCode) return;
    await this.remember(`${PREFIX}:${key}`, result);
    try {
      const { getAuthInstance, getStorageInstance } =
        await import("$lib/shared/auth/firebase");
      const auth = await getAuthInstance();
      await auth.authStateReady();
      if (!auth.currentUser) return;
      const { ref, uploadBytes } = await import("firebase/storage");
      const blob = new Blob(
        [
          JSON.stringify({
            key,
            svg: result.svg,
            encodedUrl: result.encodedUrl,
            shortCode: result.shortCode,
          }),
        ],
        { type: "application/json" }
      );
      if (blob.size >= MAX_BYTES) return;
      await uploadBytes(
        ref(await getStorageInstance(), `prepared-qrs/${key}.json`),
        blob,
        {
          contentType: "application/json",
          cacheControl: "public,max-age=31536000,immutable",
        }
      );
    } catch {
      // Sharing is best-effort (including first-write-wins races). The ready
      // QR remains usable and persisted locally if Storage is unavailable.
    }
  }
}
