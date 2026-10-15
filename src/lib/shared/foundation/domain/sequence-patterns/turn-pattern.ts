import type { TurnGlyphEntry } from "@tka/render-composition";
import type { SequenceData } from "../models/sequence-data.js";

/** Return one complete period of the sequence's per-hand turn values. */
export function deriveTurnGlyphEntries(
  sequence: SequenceData
): TurnGlyphEntry[] {
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return [{ left: 0, right: 0 }];

  const entries: TurnGlyphEntry[] = steps.map((step) => {
    const leftT = step.motions?.left?.turns;
    const rightT = step.motions?.right?.turns;
    return {
      left: typeof leftT === "number" ? leftT : 0,
      right: typeof rightT === "number" ? rightT : 0,
      leftFloat: leftT === "fl",
      rightFloat: rightT === "fl",
    };
  });

  return entries.slice(0, detectTurnPeriod(entries));
}

export function detectTurnPeriod(entries: readonly TurnGlyphEntry[]): number {
  const n = entries.length;
  if (n <= 1) return n;

  outer: for (let p = 1; p <= n; p++) {
    if (n % p !== 0) continue;
    for (let i = p; i < n; i++) {
      const ref = entries[i % p]!;
      const cur = entries[i]!;
      if (
        ref.left !== cur.left ||
        ref.right !== cur.right ||
        ref.leftFloat !== cur.leftFloat ||
        ref.rightFloat !== cur.rightFloat
      )
        continue outer;
    }
    return p;
  }
  return n;
}

function formatTurnValue(value: number): string {
  if (value === 0.5) return "½";
  if (value === 1.5) return "1½";
  if (value === 2.5) return "2½";
  return String(value);
}

export function deriveTurnLabel(entries: readonly TurnGlyphEntry[]): string {
  const hasFloat = entries.some((e) => e.leftFloat || e.rightFloat);
  const allFloat = entries.every((e) => e.leftFloat && e.rightFloat);
  if (allFloat) return "FL";

  const values = new Set<number>();
  for (const e of entries) {
    if (!e.leftFloat) values.add(e.left);
    if (!e.rightFloat) values.add(e.right);
  }

  if (values.size === 0) return "0";
  if (values.size === 1) {
    const label = formatTurnValue([...values][0]!);
    return hasFloat ? `${label}+FL` : label;
  }

  const label = [...values]
    .sort((a, b) => a - b)
    .map(formatTurnValue)
    .join("-");
  return hasFloat ? `${label}+FL` : label;
}
