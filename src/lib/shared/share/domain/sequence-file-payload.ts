/**
 * The sequence a picture or video carries inside the file.
 *
 * One builder and one parser for the payload written into exported card PNGs
 * (an iTXt chunk) and MP4s (the comment tag), so another copy of the app, or
 * anyone inspecting the file, can read the sequence back.
 *
 * The sequence itself is the flat encoding printed QR cards already carry
 * (`encodeSequence`), uncompressed so other software can read it. No second
 * encoding is invented here.
 *
 * Hard rule: the file never says more than the picture shows. The builder
 * writes a fixed key set and nothing about a person, an account, a document id,
 * a device, a locale, a time or a place.
 */

import { z } from "zod";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  decodeSequence,
  encodeSequence,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { normalizeLetter } from "#lib/shared/foundation/domain/models/letter.js";

export const SEQUENCE_FILE_FORMAT = "flow-arts-sequence";
/** The PNG text keyword holding the payload JSON. */
export const SEQUENCE_FILE_KEYWORD = "flow-arts-sequence";
export const SEQUENCE_FILE_VERSION = 1;
export const SEQUENCE_FILE_ENCODING = "flow-arts-flat";
export const SEQUENCE_FILE_APP = "Flow Arts Composer";
export const SEQUENCE_FILE_NOTATION = "The Kinetic Alphabet";

export type SequenceFileKind = "png" | "mp4";

export interface SequenceFilePayload {
  format: typeof SEQUENCE_FILE_FORMAT;
  version: number;
  app: string;
  notation: string;
  word: string;
  encoding: typeof SEQUENCE_FILE_ENCODING;
  sequence: string;
  /**
   * Each step's letter, in step order ("" for a step without one). The flat
   * text has no letter column, and a float saved without its prefloat
   * direction reads back as a different letter, so the file carries what its
   * picture already shows. Absent when no step has a letter.
   */
  letters?: string[];
  link?: string;
  by?: string;
}

/** The word the card and video header show: the simplified display word. */
export function sequenceFileWord(sequence: SequenceData): string {
  return simplifyRepeatedWord(
    sequence.displayName || sequence.intendedWord || sequence.word || ""
  );
}

/**
 * Build the payload for one exported file.
 *
 * `link` is passed only when the caller already holds the short link this exact
 * artifact visibly carries. This never mints a link. Throws when the sequence
 * cannot be encoded; embedding callers catch and ship the file without it.
 */
export function buildSequenceFilePayload(
  sequence: SequenceData,
  options: { link?: string | null } = {}
): SequenceFilePayload {
  const payload: SequenceFilePayload = {
    format: SEQUENCE_FILE_FORMAT,
    version: SEQUENCE_FILE_VERSION,
    app: SEQUENCE_FILE_APP,
    notation: SEQUENCE_FILE_NOTATION,
    word: sequenceFileWord(sequence),
    encoding: SEQUENCE_FILE_ENCODING,
    sequence: encodeSequence(sequence),
  };
  const letters = sequence.steps.map((step) => step.letter ?? "");
  if (letters.some(Boolean)) payload.letters = letters;
  if (options.link) payload.link = options.link;
  return payload;
}

export function serializeSequenceFilePayload(
  payload: SequenceFilePayload
): string {
  return JSON.stringify(payload);
}

const optionalText = z.string().min(1).optional().catch(undefined);

/**
 * Unknown fields are stripped, a higher version with a known encoding is still
 * read, and a bad optional field is dropped rather than failing the file.
 */
const payloadSchema = z.object({
  format: z.literal(SEQUENCE_FILE_FORMAT),
  version: z.number().int().min(1),
  app: z.string().catch(SEQUENCE_FILE_APP),
  notation: z.string().catch(SEQUENCE_FILE_NOTATION),
  word: z.string().catch(""),
  encoding: z.literal(SEQUENCE_FILE_ENCODING),
  sequence: z.string().min(1),
  letters: z.array(z.string()).optional().catch(undefined),
  link: z.string().url().optional().catch(undefined),
  by: optionalText,
});

export interface ParsedSequenceFile {
  payload: SequenceFilePayload;
  sequence: SequenceData;
}

/** Parse payload JSON and decode its sequence; null for anything unreadable. */
export function parseSequenceFilePayload(
  text: string | null | undefined
): ParsedSequenceFile | null {
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;

  const payload: SequenceFilePayload = {
    format: parsed.data.format,
    version: parsed.data.version,
    app: parsed.data.app,
    notation: parsed.data.notation,
    word: parsed.data.word,
    encoding: parsed.data.encoding,
    sequence: parsed.data.sequence,
    ...(parsed.data.letters && { letters: parsed.data.letters }),
    ...(parsed.data.link && { link: parsed.data.link }),
    ...(parsed.data.by && { by: parsed.data.by }),
  };

  let sequence: SequenceData;
  try {
    sequence = decodeSequence(payload.sequence);
  } catch {
    return null;
  }
  return { payload, sequence: applyFileLetters(sequence, payload.letters) };
}

/**
 * Put the file's letters back on the decoded steps. Only a list that lines up
 * one-to-one with the steps is trusted, and only entries that are real letters
 * are applied; every other step is left for the hydrator to derive, which
 * keeps a letter that is already set.
 */
function applyFileLetters(
  sequence: SequenceData,
  letters: string[] | undefined
): SequenceData {
  if (!letters || letters.length !== sequence.steps.length) return sequence;
  let changed = false;
  const steps = sequence.steps.map((step, index) => {
    const letter = normalizeLetter(letters[index]);
    if (!letter || step.letter === letter) return step;
    changed = true;
    return { ...step, letter } as typeof step;
  });
  return changed ? { ...sequence, steps } : sequence;
}

/**
 * One plain sentence for anyone inspecting the file. File metadata, not UI
 * copy: it is never shown in the app.
 */
export function describeSequenceFile(
  payload: Pick<SequenceFilePayload, "word" | "link">,
  medium: "picture" | "video"
): string {
  const parts: string[] = [];
  if (payload.word) parts.push(`Sequence ${payload.word}.`);
  parts.push(
    `This ${medium} carries its sequence and opens in ${SEQUENCE_FILE_APP}.`
  );
  if (payload.link) parts.push(payload.link);
  return parts.join(" ");
}

/** PNG text chunks for a card picture. */
export function sequencePngTextEntries(
  payload: SequenceFilePayload
): Record<string, string> {
  return {
    [SEQUENCE_FILE_KEYWORD]: serializeSequenceFilePayload(payload),
    Description: describeSequenceFile(payload, "picture"),
    Software: SEQUENCE_FILE_APP,
  };
}

/** MP4 metadata tags (mediabunny `MetadataTags` shape) for a video. */
export function sequenceVideoTags(payload: SequenceFilePayload): {
  title?: string;
  description: string;
  comment: string;
} {
  return {
    ...(payload.word && { title: payload.word }),
    description: describeSequenceFile(payload, "video"),
    comment: serializeSequenceFilePayload(payload),
  };
}
