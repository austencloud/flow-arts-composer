// How many columns a letter's variations are laid out in. Every row stays
// full: a count that divides by four reads in rows of four or eight, any
// other count in rows that divide it evenly.

/** The column counts that leave no short last row. */
export function variationColumnChoices(count: number): number[] {
  if (count <= 0) return [];
  if (count % 4 === 0) return count % 8 === 0 ? [4, 8] : [4];
  const even: number[] = [];
  for (let columns = 2; columns <= count; columns++) {
    if (count % columns === 0) even.push(columns);
  }
  // A prime count has no even split but itself; one long row is no better
  // than rows of four with a short last one.
  return even.length > 1 ? even : [Math.min(4, count)];
}

/** Columns for a grid that sizes its cells from the width alone: four when
 *  the count allows it, else the even split closest to four. */
export function defaultVariationColumns(count: number): number {
  const choices = variationColumnChoices(count);
  if (choices.length === 0) return 4;
  return choices.reduce((best, columns) =>
    Math.abs(columns - 4) < Math.abs(best - 4) ? columns : best
  );
}

/** Columns for a box too short to hold every row, where the grid scrolls:
 *  the widest allowed split (up to eight) whose cells stay at least minCell,
 *  so a short landscape screen scrolls through two rows instead of four.
 *  Narrower than that, the default split. */
export function scrollVariationColumns(
  count: number,
  width: number,
  gap: number,
  minCell: number
): number {
  const fits = variationColumnChoices(count).filter(
    (columns) =>
      columns <= 8 && (width - (columns - 1) * gap) / columns >= minCell
  );
  return fits.length > 0 ? Math.max(...fits) : defaultVariationColumns(count);
}

/** The allowed column count whose square cells come out largest in a box of
 *  this size, and that cell size. With a maxCell, cells stop growing there;
 *  when several counts reach it, the one nearest four columns wins, so a
 *  roomy box gets a compact block instead of a long thin strip. */
export function fitVariationColumns(
  count: number,
  width: number,
  height: number,
  gap: number,
  maxCell = Infinity
): { columns: number; cell: number } | null {
  const choices = variationColumnChoices(count);
  if (choices.length === 0 || width <= 0 || height <= 0) return null;
  let best = { columns: choices[0]!, cell: 0 };
  for (const columns of choices) {
    const rows = Math.ceil(count / columns);
    const cell = Math.min(
      maxCell,
      (width - (columns - 1) * gap) / columns,
      (height - (rows - 1) * gap) / rows
    );
    const tieNearerFour =
      cell === best.cell && Math.abs(columns - 4) < Math.abs(best.columns - 4);
    if (cell > best.cell || tieNearerFour) best = { columns, cell };
  }
  return { columns: best.columns, cell: Math.floor(best.cell) };
}
