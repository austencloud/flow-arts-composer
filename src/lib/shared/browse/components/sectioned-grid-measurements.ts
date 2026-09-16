export interface SectionedGridSequenceSizeSource {
  readonly steps?: readonly unknown[];
  readonly sequenceLength?: number;
}

export interface SectionedGridMeasurementItem {
  readonly type: "banner" | "header" | "row";
  readonly key: string;
  readonly sequences?: readonly SectionedGridSequenceSizeSource[];
}

export type SectionedGridStartPlacementLayout = "row" | "column";

/**
 * Cards with different step counts have different aspect ratios. A virtual row
 * must reserve enough height for its tallest card before the thumbnail renderer
 * finishes, or the following section can be placed on top of it.
 */
export function getSectionedGridRowMaxSteps(
  sequences: readonly SectionedGridSequenceSizeSource[]
): number {
  let maxSteps = 4;
  for (const sequence of sequences) {
    const steps = sequence.steps?.length || sequence.sequenceLength || 4;
    if (steps > maxSteps) maxSteps = steps;
  }
  return maxSteps;
}

/**
 * TanStack keeps measured sizes until told that the virtual item stream changed.
 * Count alone cannot detect an 8-step row being replaced by a 16-step row at the
 * same index, so include item identity and every input used by the height estimate.
 */
export function createSectionedGridMeasurementSignature(
  items: readonly SectionedGridMeasurementItem[],
  columnCount: number,
  startPlacementLayout: SectionedGridStartPlacementLayout
): string {
  const itemTokens = items.map((item) => {
    if (item.type !== "row") return `${item.type}:${item.key}`;
    return `${item.type}:${item.key}:${getSectionedGridRowMaxSteps(item.sequences ?? [])}`;
  });

  return `${columnCount}\u001e${startPlacementLayout}\u001e${itemTokens.join("\u001f")}`;
}

/**
 * TanStack defaults to numeric indexes, which can transfer a cached height to
 * unrelated data after filtering. The flattened stream already owns stable keys.
 */
export function getSectionedGridItemKey(
  items: readonly SectionedGridMeasurementItem[],
  index: number
): string | number {
  return items[index]?.key ?? index;
}
