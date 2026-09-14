import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SoloPropData } from "../domain/models/solo-prop-data";
import type { SoloPropStepData } from "../domain/models/solo-prop-step-data";
import type { SequenceData } from "../domain/models/sequence-data";

const BASE62_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(bytes: Uint8Array): string {
  let result = "";
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  while (value > 0n) {
    result = BASE62_CHARS[Number(value % 62n)] + result;
    value = value / 62n;
  }
  return result.padStart(22, "0");
}

function serializeStep(step: SoloPropStepData): string {
  let s = `${step.startLocation}:${step.endLocation}:${step.motionType}:${step.rotationDirection}:${step.turns}:${step.startOrientation}:${step.endOrientation}`;
  if (step.plane != null && step.plane !== "wall") s += `:plane=${step.plane}`;
  if (step.handPath != null) {
    s += `:${step.handPath}`;
    if (step.skewSteps != null) {
      s += `:${step.skewSteps}:${step.skewDir ?? ""}`;
    }
  }
  return s;
}

// FNV-1a 128-bit via dual 64-bit hashing. Deterministic and synchronous.
function hash128(input: string): string {
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x100000001b3n;
  const FNV_PRIME = 0x00000100000001b3n;
  for (let i = 0; i < input.length; i++) {
    const c = BigInt(input.charCodeAt(i));
    h1 ^= c;
    h1 = (h1 * FNV_PRIME) & 0xffffffffffffffffn;
    h2 ^= c;
    h2 = (h2 * (FNV_PRIME + 2n)) & 0xffffffffffffffffn;
  }
  const bytes = new Uint8Array(16);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(h1 & 0xffn);
    h1 >>= 8n;
    bytes[i + 8] = Number(h2 & 0xffn);
    h2 >>= 8n;
  }
  return toBase62(bytes);
}

/** A deck card's identity for content matching: which base sequence, from which
 *  catalog, under which frozen variation recipe. Structural so `shared/` need not
 *  depend on the choreo-card feature's `DeckReleaseCard`. */
interface DeckCardIdentity {
  sequenceId: string;
  sourceCatalogId: string;
  // `object`, not Record<string, unknown>, so a typed variation interface
  // (CardVariation) is assignable without an index signature. Indexed internally.
  variation?: object;
}

/**
 * Order-independent content fingerprint of a composed deck. Two decks with the
 * same set of (catalog, sequence, variation) cards hash equal regardless of
 * shuffle/position — a re-drawn LOOP deck with identical cards matches its
 * already-released twin. Variation keys are sorted so field order never shifts
 * the hash.
 */
export function hashDeckContent(cards: readonly DeckCardIdentity[]): string {
  const identities = cards.map((c) => {
    const v = c.variation as Record<string, unknown> | undefined;
    const variationKey = v
      ? Object.keys(v)
          .sort()
          .map((k) => `${k}=${String(v[k])}`)
          .join(",")
      : "";
    return `${c.sourceCatalogId}|${c.sequenceId}|${variationKey}`;
  });
  identities.sort();
  return hash128(identities.join("~"));
}

export function hashHandPath(locations: readonly GridLocation[]): string {
  const canonical = locations.join("|");
  return hash128(canonical);
}

export function hashSoloProp(
  soloProp: Pick<SoloPropData, "startLocation" | "startOrientation" | "steps">
): string {
  const parts = [`${soloProp.startLocation}:${soloProp.startOrientation}`];
  for (const step of soloProp.steps) {
    parts.push(serializeStep(step));
  }
  return hash128(parts.join("|"));
}

/** Every field that affects how a choreo-card pictograph renders for a node. */
interface HashableNode {
  letter?: unknown;
  startPosition?: unknown;
  endPosition?: unknown;
  gridPosition?: unknown;
  leftReversal?: boolean;
  rightReversal?: boolean;
  motions?: { left?: MotionData; right?: MotionData };
}

function serializeMotion(m?: MotionData): string {
  // Invisible placeholder = hand not really there (both-required Step shape):
  // hash it exactly like the old absent hand so render-cache keys for
  // blank/one-hand content are stable across the migration.
  if (!m || m.isVisible === false) return "-";
  return `${m.motionType}:${m.rotationDirection}:${m.startLocation}:${m.endLocation}:${m.turns}:${m.startOrientation}:${m.endOrientation}${m.pathShape ? `:${m.pathShape}` : ""}`;
}

function serializeChoreoNode(node: HashableNode): string {
  return [
    node.letter ?? "",
    node.startPosition ?? node.gridPosition ?? "",
    node.endPosition ?? "",
    serializeMotion(node.motions?.left),
    serializeMotion(node.motions?.right),
    node.leftReversal ? "B" : "",
    node.rightReversal ? "R" : "",
  ].join(":");
}

/**
 * Content fingerprint of a sequence's render-relevant state: word, start
 * position, and every step's letter, both motions, and reversal flags.
 *
 * Use as a render-cache discriminator. Any transform that changes what the
 * card draws (reversal flips, re-derived letters, recomputed orientations)
 * yields a different hash, so caches self-invalidate — no manual version bumps,
 * and reversal variants that reuse a base sequence's id never collide.
 */
export function hashSequenceContent(
  seq: Pick<SequenceData, "word" | "steps" | "startPosition">
): string {
  const parts: string[] = [String(seq.word ?? "")];
  if (seq.startPosition) {
    parts.push("sp|" + serializeChoreoNode(seq.startPosition as HashableNode));
  }
  for (const step of seq.steps ?? []) {
    parts.push(serializeChoreoNode(step as HashableNode));
  }
  return hash128(parts.join("~"));
}

/** Generic deterministic 128-bit string fingerprint (base62, 22 chars).
 *  For hashing arbitrary canonical strings such as mandala shape keys. */
export function hashString(input: string): string {
  return hash128(input);
}

/** Motion path only: type, rotation direction, start/end locations. Turns,
 *  orientations and reversal flags are intentionally dropped. */
function serializeMotionSkeleton(m?: MotionData): string {
  if (!m) return "-";
  return `${m.motionType}:${m.rotationDirection}:${m.startLocation}:${m.endLocation}`;
}

function serializeSkeletonNode(node: HashableNode): string {
  return [
    node.letter ?? "",
    node.startPosition ?? node.gridPosition ?? "",
    node.endPosition ?? "",
    serializeMotionSkeleton(node.motions?.left),
    serializeMotionSkeleton(node.motions?.right),
  ].join(":");
}

/**
 * Location-arrangement fingerprint: word + each step's letter, positions, motion
 * type, rotation direction and start/end locations — but NOT turns, orientations
 * or reversal flags. Two sequences that follow the exact same path and differ
 * only by turns applied on top hash identically.
 *
 * Use to decide whether two cards are "sufficiently different": within one deck
 * a word title may repeat only when the skeleton differs (different locations),
 * never as the same path re-spun with a different turn pattern.
 */
export function hashSequenceSkeleton(
  seq: Pick<SequenceData, "word" | "steps" | "startPosition">
): string {
  const parts: string[] = [String(seq.word ?? "")];
  if (seq.startPosition) {
    parts.push(
      "sp|" + serializeSkeletonNode(seq.startPosition as HashableNode)
    );
  }
  for (const step of seq.steps ?? []) {
    parts.push(serializeSkeletonNode(step as HashableNode));
  }
  return hash128(parts.join("~"));
}
