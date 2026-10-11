/**
 * Convert an in-memory editor strip (period-length arrays) into the existing
 * Firebase pattern shapes, tiled to the sequence length, so the proven
 * apply managers can consume them unchanged.
 */
import type {
  TurnPattern,
  TurnPatternEntry,
  TurnValue,
} from "#lib/shared/create/domain/turn-pattern-data.js";
import type {
  DurationPattern,
  DurationPatternEntry,
} from "./models/duration-pattern-data";
import { tilePeriod } from "#lib/shared/create/domain/rhythm/rhythm-mask.js";

export function stripToTurnPattern(
  left: readonly TurnValue[],
  right: readonly TurnValue[],
  seqLen: number,
): TurnPattern {
  const tb = tilePeriod(left, seqLen);
  const tr = tilePeriod(right, seqLen);
  const entries: TurnPatternEntry[] = [];
  for (let i = 0; i < seqLen; i++) {
    entries.push({ stepIndex: i, left: tb[i]!, right: tr[i]! });
  }
  return {
    id: "strip",
    name: "strip",
    userId: "",
    createdAt: null as unknown as TurnPattern["createdAt"],
    stepCount: seqLen,
    entries,
  };
}

export function stripToDurationPattern(
  values: readonly number[],
  seqLen: number,
): DurationPattern {
  const tv = tilePeriod(values, seqLen);
  const entries: DurationPatternEntry[] = [];
  for (let i = 0; i < seqLen; i++) {
    entries.push({ stepIndex: i, duration: tv[i]! });
  }
  return {
    id: "strip",
    name: "strip",
    userId: "",
    createdAt: null,
    stepCount: seqLen,
    entries,
  };
}
