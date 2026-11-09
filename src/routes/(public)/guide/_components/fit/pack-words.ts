/**
 * Cuts a figure's words across as many screens as they need (2026-11-06,
 * Austen: no scrolling, and no screen of words alone). The figure stays and
 * the words advance. Both guide cutters use it: Level 1's flow pages
 * (flow-render-items.ts) and Level 2's topics (section-screens.ts).
 */

export type PackPiece<T> = {
  piece: T;
  /** Characters this piece costs on a screen. */
  cost: number;
  /** A heading or lead-in: never the last thing on a screen. */
  leads: boolean;
};

// A tail shorter than this share of a screen joins the screen before it when
// that screen can stretch to hold it.
const TAIL_SHARE = 0.3;
const TAIL_STRETCH = 1.2;
const LEAD_STRETCH = 1.35;

/**
 * Splits pieces, in order, into parts of at most `budget` characters, evened
 * out so that the words split about equally and a sentence or two is not left
 * standing with the figure alone. A single piece over the budget keeps a part
 * to itself; the caller breaks it at sentences first.
 */
export function packPieces<T>(
  pieces: readonly PackPiece<T>[],
  budget: number
): T[][] {
  if (pieces.length === 0) return [];
  const total = pieces.reduce((n, p) => n + p.cost, 0);
  if (total <= budget) return [pieces.map((p) => p.piece)];
  const target = total / Math.ceil(total / budget);
  const parts: PackPiece<T>[][] = [];
  let cur: PackPiece<T>[] = [];
  let curCost = 0;
  for (const p of pieces) {
    const over = curCost + p.cost > budget;
    const even = curCost >= target - p.cost / 2;
    if (cur.length > 0 && (over || even)) {
      // A heading or lead-in moves on with the words it opens.
      let keep = cur.length;
      while (keep > 0 && cur[keep - 1]!.leads) keep--;
      // Headings stay with their first words unless the two run well past
      // the screen; then the headings stand with the figure.
      if (keep === 0 && curCost + p.cost > budget * LEAD_STRETCH)
        keep = cur.length;
      if (keep > 0) {
        parts.push(cur.slice(0, keep));
        cur = cur.slice(keep);
        curCost = cur.reduce((n, q) => n + q.cost, 0);
      }
    }
    cur.push(p);
    curCost += p.cost;
  }
  if (cur.length) parts.push(cur);
  if (parts.length >= 2) {
    const costOf = (part: PackPiece<T>[]) =>
      part.reduce((n, p) => n + p.cost, 0);
    const tail = parts[parts.length - 1]!;
    const before = parts[parts.length - 2]!;
    if (
      costOf(tail) < budget * TAIL_SHARE &&
      costOf(before) + costOf(tail) <= budget * TAIL_STRETCH
    ) {
      parts.splice(parts.length - 2, 2, [...before, ...tail]);
    }
  }
  return parts.map((part) => part.map((p) => p.piece));
}

const LABEL_MAX = 28;

/**
 * The name a figure's caption gives its screen's pill: the plain part before
 * its colon, without a closing aside ("AABB ×2 (reversals after 3 & 7)" reads
 * "AABB ×2"). Null when no short name can be had from it.
 */
export function captionLabel(caption: string | null | undefined): string | null {
  if (!caption) return null;
  let name = caption.replace(/\s+/g, " ").trim();
  const colon = name.indexOf(":");
  if (colon > 0) name = name.slice(0, colon).trim();
  name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (name.length > LABEL_MAX) name = (name.split(/ [-–] /)[0] ?? "").trim();
  return name && name.length <= LABEL_MAX ? name : null;
}
