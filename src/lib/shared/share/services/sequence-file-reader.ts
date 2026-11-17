/**
 * One reader for any file that may carry a sequence inside it: a card PNG
 * (iTXt or tEXt chunk) or an MP4 (comment tag). A file with no payload is not
 * an error; it is simply not one of ours.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  SEQUENCE_FILE_KEYWORD,
  parseSequenceFilePayload,
  type SequenceFileKind,
  type SequenceFilePayload,
} from "#lib/shared/share/domain/sequence-file-payload.js";
import { isPng, readPngTextChunks } from "./png-text-chunks";

export interface SequenceFileReadResult {
  sequence: SequenceData;
  payload: SequenceFilePayload;
  fileKind: SequenceFileKind;
}

/** Sniff the container from its signature, not its name or MIME type. */
export function sniffSequenceFileKind(
  head: Uint8Array
): SequenceFileKind | null {
  if (isPng(head)) return "png";
  // ISO BMFF: a box size, then the `ftyp` box type at bytes 4..8.
  if (
    head.length >= 8 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    return "mp4";
  }
  return null;
}

async function readMp4Comment(file: Blob): Promise<string | null> {
  const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    const tags = await input.getMetadataTags();
    return tags.comment ?? null;
  } finally {
    input.dispose();
  }
}

/** The embedded sequence, or null when the file carries none. Never throws. */
export async function readSequenceFromFile(
  file: Blob
): Promise<SequenceFileReadResult | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const fileKind = sniffSequenceFileKind(head);
    if (!fileKind) return null;

    const text =
      fileKind === "png"
        ? (readPngTextChunks(new Uint8Array(await file.arrayBuffer()))[
            SEQUENCE_FILE_KEYWORD
          ] ?? null)
        : await readMp4Comment(file);

    const parsed = parseSequenceFilePayload(text);
    return parsed ? { ...parsed, fileKind } : null;
  } catch (error) {
    console.warn("[SequenceFile] Could not read a file's sequence:", error);
    return null;
  }
}
