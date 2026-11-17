/**
 * Typed PostHog boundary for files that carry their sequence inside them.
 *
 * No property here may identify a person or a sequence: only the kind of file,
 * how it left or came back, and a step count. The route is left off on
 * purpose, since a sequence page's path names the sequence.
 */

import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
import { SEQUENCE_FILE_FORMAT } from "#lib/shared/share/domain/sequence-file-payload.js";
import type { SequenceFileKind } from "#lib/shared/share/domain/sequence-file-payload.js";

export type SequenceFileDelivery = "download" | "share";
/** `share_target` in build 1; the open-a-file entry adds `drop` and `picker`. */
export type SequenceFileEntry = "share_target" | "drop" | "picker";

export function trackSequenceFileWritten(
  fileKind: SequenceFileKind,
  delivery: SequenceFileDelivery
): void {
  captureEvent("sequence_file_written", { file_kind: fileKind, delivery });
}

export function trackSequenceFileOpened(input: {
  fileKind: SequenceFileKind;
  entry: SequenceFileEntry;
  hadLink: boolean;
  stepCount: number;
}): void {
  captureEvent("sequence_file_opened", {
    file_kind: input.fileKind,
    entry: input.entry,
    had_link: input.hadLink,
    step_count: input.stepCount,
  });
}

/**
 * What kind of file was opened and held no sequence: the sniffed container
 * when it is one of ours, otherwise only the broad MIME family.
 */
export type SequenceFileNotFoundKind =
  | SequenceFileKind
  | "image"
  | "video"
  | "other";

export function fileKindFromType(mimeType: string): SequenceFileNotFoundKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

/** A file was opened from the device or dropped, and nothing in it opened. */
export function trackSequenceFileNotFound(input: {
  fileKind: SequenceFileNotFoundKind;
  entry: SequenceFileEntry;
}): void {
  captureEvent("sequence_file_not_found", {
    file_kind: input.fileKind,
    entry: input.entry,
  });
}

/** The payload is written near the start of both containers. */
const SCAN_BYTES = 256 * 1024;
const MARKER = new TextEncoder().encode(`"format":"${SEQUENCE_FILE_FORMAT}"`);

function containsMarker(bytes: Uint8Array): boolean {
  const last = bytes.length - MARKER.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < MARKER.length; j++) {
      if (bytes[i + j] !== MARKER[j]) continue outer;
    }
    return true;
  }
  return false;
}

function kindFromHead(bytes: Uint8Array): SequenceFileKind | null {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "mp4";
  }
  return null;
}

/**
 * After a file was actually delivered, report it if it carries a sequence.
 * An observer: callers never await it, and it never throws.
 */
export async function observeSequenceFileDelivery(
  blob: Blob,
  delivery: SequenceFileDelivery
): Promise<void> {
  try {
    const head = new Uint8Array(await blob.slice(0, SCAN_BYTES).arrayBuffer());
    const fileKind = kindFromHead(head);
    if (!fileKind || !containsMarker(head)) return;
    trackSequenceFileWritten(fileKind, delivery);
  } catch {
    // Analytics must never reach the delivery path.
  }
}
