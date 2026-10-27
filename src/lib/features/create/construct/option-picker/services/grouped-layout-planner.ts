/**
 * Grouped Layout Planner
 *
 * Lays out the Types 4-6 panel: which types share a row, how wide each type's
 * section is, how many columns it uses, and one tile size for all of them.
 *
 * Every arrangement that keeps the type order is tried (one row, two rows
 * either way, three rows), each row's width is split by option count rather
 * than evenly by type, and the largest uniform tile that fits the panel's
 * width AND height wins. The panel's height used to be ignored, which left
 * small tiles in one row above an empty band.
 */

export interface GroupedTypeCount {
  type: string;
  count: number;
}

export interface GroupedSectionPlan {
  type: string;
  /** Section width in px, including the grid's inset. */
  width: number;
  columns: number;
  tileRows: number;
}

export interface GroupedRowPlan {
  sections: GroupedSectionPlan[];
  /** Row height in px: the header (when shown) plus the tallest grid. */
  height: number;
}

export interface GroupedLayoutPlan {
  rows: GroupedRowPlan[];
  tileSize: number;
  showHeaders: boolean;
  /** False when even the smallest tile overflows; the panel then clips. */
  fits: boolean;
}

export interface GroupedLayoutInput {
  typeCounts: readonly GroupedTypeCount[];
  /** Content width available to the rows. */
  width: number;
  /** Content height available to the rows. */
  height: number;
  /** Gap between tiles inside a grid. */
  tileGap: number;
  /** Gap between side-by-side sections in a row. */
  sectionGap: number;
  /** Gap between rows. */
  rowGap: number;
  /** Horizontal padding inside each grid, both sides together. */
  gridInset: number;
  /** Height a per-type header takes above its grid. */
  headerHeight: number;
  /** Narrowest section that still fits its header label. */
  headerMinWidth: number;
  /** Headers are kept only when every row is at least this tall with them. */
  headerMinRowHeight: number;
  /** Largest tile allowed. */
  maxSize: number;
  /** Smallest tile allowed; below this the panel clips instead. */
  minSize: number;
}

interface RowFit {
  sections: GroupedSectionPlan[];
  height: number;
  widthFits: boolean;
}

/** Every split of the ordered types into consecutive rows. */
export function groupedArrangements(typeCount: number): number[][][] {
  const indices = Array.from({ length: typeCount }, (_, i) => i);
  if (typeCount <= 1) return [[indices]];
  const result: number[][][] = [];
  // Each of the typeCount - 1 boundaries either breaks the row or not.
  const boundaryCount = typeCount - 1;
  for (let mask = 0; mask < 1 << boundaryCount; mask++) {
    const rows: number[][] = [[indices[0]!]];
    for (let i = 1; i < typeCount; i++) {
      if (mask & (1 << (i - 1))) rows.push([indices[i]!]);
      else rows[rows.length - 1]!.push(indices[i]!);
    }
    result.push(rows);
  }
  // Fewer rows first, so ties keep the flatter arrangement.
  return result.sort((a, b) => a.length - b.length);
}

function gridWidth(columns: number, size: number, input: GroupedLayoutInput) {
  return columns * size + (columns - 1) * input.tileGap + input.gridInset;
}

function gridHeight(rows: number, size: number, tileGap: number) {
  return rows * size + (rows - 1) * tileGap;
}

/**
 * The shortest way to fit one row's sections at this tile size: try 1 tile
 * row, then 2, and so on, giving each section the fewest columns that reach
 * that row count. Widths follow option counts.
 */
function fitRow(
  counts: readonly GroupedTypeCount[],
  size: number,
  headers: boolean,
  input: GroupedLayoutInput
): RowFit {
  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const available = input.width - (counts.length - 1) * input.sectionGap;
  let last: RowFit | null = null;

  for (let targetRows = 1; targetRows <= maxCount; targetRows++) {
    const sections = counts.map((c) => {
      const columns = Math.max(1, Math.ceil(c.count / targetRows));
      const tileRows = Math.max(1, Math.ceil(c.count / columns));
      const needed = gridWidth(columns, size, input);
      const width = Math.ceil(
        headers ? Math.max(needed, input.headerMinWidth) : needed
      );
      return { type: c.type, width, columns, tileRows };
    });
    const totalWidth = sections.reduce((sum, s) => sum + s.width, 0);
    const tallest = Math.max(...sections.map((s) => s.tileRows));
    const height =
      (headers ? input.headerHeight : 0) +
      gridHeight(tallest, size, input.tileGap);
    last = { sections, height, widthFits: totalWidth <= available };
    if (last.widthFits) return last;
  }

  return last!;
}

function planArrangement(
  arrangement: number[][],
  size: number,
  headers: boolean,
  input: GroupedLayoutInput
) {
  const rows = arrangement.map((row) =>
    fitRow(
      row.map((i) => input.typeCounts[i]!),
      size,
      headers,
      input
    )
  );
  const totalHeight =
    rows.reduce((sum, r) => sum + r.height, 0) +
    (rows.length - 1) * input.rowGap;
  const fits =
    rows.every((r) => r.widthFits) && totalHeight <= input.height;
  return { rows, totalHeight, fits };
}

/** Largest tile size that fits this arrangement, or null if none does. */
function largestFittingSize(
  arrangement: number[][],
  headers: boolean,
  input: GroupedLayoutInput
): number | null {
  let lo = Math.floor(input.minSize);
  let hi = Math.floor(input.maxSize);
  if (hi < lo || !planArrangement(arrangement, lo, headers, input).fits) {
    return null;
  }
  // Fitting only gets easier as tiles shrink, so the sizes that fit form a
  // prefix and binary search finds its end.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (planArrangement(arrangement, mid, headers, input).fits) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function bestPlan(
  headers: boolean,
  input: GroupedLayoutInput
): GroupedLayoutPlan | null {
  let best: GroupedLayoutPlan | null = null;
  for (const arrangement of groupedArrangements(input.typeCounts.length)) {
    const size = largestFittingSize(arrangement, headers, input);
    if (size === null) continue;
    if (best && size <= best.tileSize) continue;
    const plan = planArrangement(arrangement, size, headers, input);
    best = {
      rows: plan.rows.map((r) => ({ sections: r.sections, height: r.height })),
      tileSize: size,
      showHeaders: headers,
      fits: true,
    };
  }
  return best;
}

export function planGroupedLayout(
  input: GroupedLayoutInput
): GroupedLayoutPlan {
  const typeCounts = input.typeCounts.filter((c) => c.count > 0);
  if (typeCounts.length === 0) {
    return { rows: [], tileSize: input.minSize, showHeaders: false, fits: true };
  }
  const normalized = { ...input, typeCounts };

  // Headers stay only when every row is still tall enough to carry one.
  const withHeaders = bestPlan(true, normalized);
  if (
    withHeaders &&
    withHeaders.rows.every((r) => r.height >= input.headerMinRowHeight)
  ) {
    return withHeaders;
  }

  const withoutHeaders = bestPlan(false, normalized);
  if (withoutHeaders) return withoutHeaders;

  // Nothing fits even at the smallest tile: take the shortest arrangement at
  // that size and let the panel clip, as it did before.
  let fallback: ReturnType<typeof planArrangement> | null = null;
  for (const arrangement of groupedArrangements(typeCounts.length)) {
    const plan = planArrangement(arrangement, input.minSize, false, normalized);
    const widthFits = plan.rows.every((r) => r.widthFits);
    const fallbackWidthFits = fallback?.rows.every((r) => r.widthFits);
    if (
      !fallback ||
      (widthFits && !fallbackWidthFits) ||
      (widthFits === fallbackWidthFits &&
        plan.totalHeight < fallback.totalHeight)
    ) {
      fallback = plan;
    }
  }
  return {
    rows: fallback!.rows.map((r) => ({
      sections: r.sections,
      height: r.height,
    })),
    tileSize: input.minSize,
    showHeaders: false,
    fits: false,
  };
}
