/**
 * Put the sequence inside an exported file.
 *
 * Embedding is a passenger on export, never a reason for it to fail: every
 * function here hands back the original blob on any error and logs a warning.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  buildSequenceFilePayload,
  sequencePngTextEntries,
  sequenceVideoTags,
} from "#lib/shared/share/domain/sequence-file-payload.js";
import { insertPngTextChunks, isPng } from "./png-text-chunks";

export interface SequenceFileEmbedOptions {
  /** The short link this exact file visibly carries, when the caller holds it. */
  link?: string | null;
}

/**
 * Card PNG with the sequence in iTXt chunks. Anything that is not a PNG, or a
 * sequence that cannot be encoded, comes back as the same blob.
 */
export async function embedSequenceInCardPng(
  blob: Blob,
  sequence: SequenceData,
  options: SequenceFileEmbedOptions = {}
): Promise<Blob> {
  try {
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (!isPng(head)) return blob;
    const payload = buildSequenceFilePayload(sequence, options);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const written = insertPngTextChunks(bytes, sequencePngTextEntries(payload));
    if (written === bytes) return blob;
    return new Blob([written as BlobPart], { type: blob.type || "image/png" });
  } catch (error) {
    console.warn("[SequenceFile] Card exported without its sequence:", error);
    return blob;
  }
}

export type SequenceVideoTags = ReturnType<typeof sequenceVideoTags>;

/** MP4 tags for a video of this sequence, or null when it cannot be encoded. */
export function buildSequenceVideoTags(
  sequence: SequenceData,
  options: SequenceFileEmbedOptions = {}
): SequenceVideoTags | null {
  try {
    return sequenceVideoTags(buildSequenceFilePayload(sequence, options));
  } catch (error) {
    console.warn("[SequenceFile] Video exported without its sequence:", error);
    return null;
  }
}

/**
 * Rewrite an MP4's container with these tags, copying every encoded packet
 * as is (no re-encode). For encoders that cannot take tags themselves, such as
 * the background worker encoder from the vendored video-editor package.
 */
export async function embedSequenceTagsInMp4(
  blob: Blob,
  tags: SequenceVideoTags,
  options: { fragmented?: boolean } = {}
): Promise<Blob> {
  try {
    const {
      Input,
      Output,
      Conversion,
      BlobSource,
      BufferTarget,
      Mp4OutputFormat,
      ALL_FORMATS,
    } = await import("mediabunny");
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: options.fragmented ? "fragmented" : "in-memory",
      }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tags: (inputTags) => ({ ...inputTags, ...tags }),
      showWarnings: false,
    });
    // A dropped track (an audio track the copy path cannot carry, say) would
    // cost the visitor more than the missing tags do.
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      throw new Error(
        `MP4 remux not possible: ${conversion.discardedTracks
          .map((track) => track.reason)
          .join(", ")}`
      );
    }
    await conversion.execute();
    if (!target.buffer) throw new Error("MP4 remux produced no bytes");
    return new Blob([target.buffer], { type: blob.type || "video/mp4" });
  } catch (error) {
    console.warn("[SequenceFile] Video exported without its sequence:", error);
    return blob;
  }
}
