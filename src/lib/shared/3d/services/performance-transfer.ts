import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  sha256,
  stableStringify,
} from "../../../../../unreal/Shared/Tools/capture-provenance.mjs";

export const PERFORMANCE_TRANSFER_SCHEMA = "tka-performance-transfer-v1";
export const MAX_PERFORMANCE_TRANSFER_BYTES = 20 * 1024 * 1024;
const MAX_SEQUENCE_BYTES = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const ORIGIN_KEY = "__performanceTransferOrigin";

interface TransferOrigin {
  source: PerformanceTransfer;
  baselineJson?: string;
}

export interface PerformanceTransfer {
  schema: typeof PERFORMANCE_TRANSFER_SCHEMA;
  sequenceSHA256: string;
  sequenceJson: string;
  selection?: { characterId: string; propFamily: string };
  playback: { phase: number; rate: number; paused: boolean };
}

export interface DecodedPerformanceTransfer {
  transfer: PerformanceTransfer;
  sequence: SequenceData;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validStep(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Number.isInteger(value.stepNumber) &&
    (value.stepNumber as number) >= 1 &&
    typeof value.duration === "number" &&
    Number.isFinite(value.duration) &&
    value.duration > 0 &&
    record(value.motions) &&
    record(value.motions.left) &&
    record(value.motions.right)
  );
}

function validSequence(value: unknown): value is SequenceData {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.word === "string" &&
    (value.name === undefined || typeof value.name === "string") &&
    Array.isArray(value.steps) &&
    value.steps.every(validStep) &&
    (value.thumbnails === undefined ||
      (Array.isArray(value.thumbnails) &&
        value.thumbnails.every(
          (thumbnail: unknown) => typeof thumbnail === "string"
        ))) &&
    (value.isFavorite === undefined || typeof value.isFavorite === "boolean") &&
    (value.isCircular === undefined || typeof value.isCircular === "boolean") &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) &&
        value.tags.every((tag: unknown) => typeof tag === "string"))) &&
    (value.metadata === undefined || record(value.metadata))
  );
}

function validPlayback(
  value: unknown
): value is PerformanceTransfer["playback"] {
  return (
    record(value) &&
    typeof value.phase === "number" &&
    Number.isFinite(value.phase) &&
    value.phase >= 0 &&
    value.phase < 1 &&
    typeof value.rate === "number" &&
    Number.isFinite(value.rate) &&
    value.rate >= 0.5 &&
    value.rate <= 1.75 &&
    typeof value.paused === "boolean"
  );
}

function validSelection(
  value: unknown
): value is NonNullable<PerformanceTransfer["selection"]> {
  return (
    record(value) &&
    typeof value.characterId === "string" &&
    value.characterId.length > 0 &&
    typeof value.propFamily === "string" &&
    value.propFamily.length > 0
  );
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function originOf(sequence: SequenceData): TransferOrigin | null {
  const candidate = sequence.metadata?.[ORIGIN_KEY];
  return record(candidate) && record(candidate.source)
    ? (candidate as unknown as TransferOrigin)
    : null;
}

function withoutEditorTransferData(sequence: SequenceData): SequenceData {
  const {
    [ORIGIN_KEY]: _origin,
    _enrichedAt: _enriched,
    ...metadata
  } = sequence.metadata ?? {};
  return { ...sequence, metadata };
}

/** Retain a verified native snapshot through Composer's defaulting and enrichment. */
export function withPerformanceTransferOrigin(
  sequence: SequenceData,
  source: PerformanceTransfer
): SequenceData {
  return {
    ...sequence,
    metadata: {
      ...sequence.metadata,
      [ORIGIN_KEY]: { source },
    },
  };
}

/** Called once after Create's async enrichment, before its derived-state pass. */
export function setPerformanceTransferEditorBaseline(
  sequence: SequenceData,
  normalize: (sequence: SequenceData) => SequenceData
): SequenceData {
  const origin = originOf(sequence);
  if (!origin || origin.baselineJson) return sequence;
  const baselineJson = stableStringify(
    JSON.parse(JSON.stringify(withoutEditorTransferData(normalize(sequence))))
  );
  return {
    ...sequence,
    metadata: {
      ...sequence.metadata,
      [ORIGIN_KEY]: { ...origin, baselineJson },
    },
  };
}

/** Carry an unchanged editor baseline through the viewer's semantic hydration. */
export function advancePerformanceTransferEditorBaseline(
  before: SequenceData,
  after: SequenceData
): SequenceData {
  const origin = originOf(before);
  if (
    !origin?.baselineJson ||
    origin.baselineJson !==
      stableStringify(
        JSON.parse(JSON.stringify(withoutEditorTransferData(before)))
      )
  )
    return after;

  return {
    ...after,
    metadata: {
      ...after.metadata,
      [ORIGIN_KEY]: {
        ...origin,
        baselineJson: stableStringify(
          JSON.parse(JSON.stringify(withoutEditorTransferData(after)))
        ),
      },
    },
  };
}

export async function encodePerformanceTransfer(
  sequence: SequenceData,
  options: {
    selection?: PerformanceTransfer["selection"];
    playback?: PerformanceTransfer["playback"];
  } = {}
): Promise<string> {
  // JSON normalization gives dates and optional fields their actual wire values.
  const origin = originOf(sequence);
  const normalized: unknown = JSON.parse(
    JSON.stringify(origin ? withoutEditorTransferData(sequence) : sequence)
  );
  if (!validSequence(normalized))
    throw new Error("Sequence snapshot is incomplete");
  const currentJson = stableStringify(normalized);
  let sequenceJson = currentJson;
  let reusedOrigin = false;
  if (origin && origin.baselineJson === currentJson) {
    // The source is untrusted metadata: recheck its canonical snapshot and hash.
    const verified = await decodePerformanceTransfer(
      JSON.stringify(origin.source)
    );
    if (verified.sequence.id === sequence.id) {
      sequenceJson = verified.transfer.sequenceJson;
      reusedOrigin = true;
    }
  }
  if (byteLength(sequenceJson) > MAX_SEQUENCE_BYTES)
    throw new Error("Sequence snapshot exceeds the transfer size limit");
  const playback = options.playback ??
    (reusedOrigin ? origin?.source.playback : undefined) ?? {
      phase: 0,
      rate: 1,
      paused: true,
    };
  if (!validPlayback(playback)) throw new Error("Playback values are invalid");
  const selection =
    options.selection ?? (reusedOrigin ? origin?.source.selection : undefined);
  if (selection !== undefined && !validSelection(selection))
    throw new Error("Performer selection is invalid");
  const transfer: PerformanceTransfer = {
    schema: PERFORMANCE_TRANSFER_SCHEMA,
    sequenceSHA256: await sha256(sequenceJson),
    sequenceJson,
    ...(selection ? { selection } : {}),
    playback,
  };
  const text = JSON.stringify(transfer);
  if (byteLength(text) > MAX_PERFORMANCE_TRANSFER_BYTES)
    throw new Error("Performance transfer exceeds the size limit");
  return text;
}

export async function decodePerformanceTransfer(
  text: string
): Promise<DecodedPerformanceTransfer> {
  if (byteLength(text) > MAX_PERFORMANCE_TRANSFER_BYTES)
    throw new Error("Performance transfer exceeds the size limit");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Performance transfer is not valid JSON");
  }
  if (!record(raw) || raw.schema !== PERFORMANCE_TRANSFER_SCHEMA)
    throw new Error("Unsupported performance transfer schema");
  if (
    typeof raw.sequenceJson !== "string" ||
    byteLength(raw.sequenceJson) > MAX_SEQUENCE_BYTES ||
    typeof raw.sequenceSHA256 !== "string" ||
    !HASH.test(raw.sequenceSHA256) ||
    !validPlayback(raw.playback) ||
    (raw.selection !== undefined && !validSelection(raw.selection))
  )
    throw new Error("Performance transfer fields are invalid");
  let sequence: unknown;
  try {
    sequence = JSON.parse(raw.sequenceJson);
  } catch {
    throw new Error("Sequence snapshot is not valid JSON");
  }
  if (
    !validSequence(sequence) ||
    stableStringify(sequence) !== raw.sequenceJson
  )
    throw new Error("Sequence snapshot is incomplete or not canonical");
  if ((await sha256(raw.sequenceJson)) !== raw.sequenceSHA256)
    throw new Error("Sequence snapshot does not match its SHA-256 hash");
  return { transfer: raw as unknown as PerformanceTransfer, sequence };
}
