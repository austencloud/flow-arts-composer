import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";

export interface TogetherOppositeExample {
  readonly id: string;
  readonly label: string;
  readonly gridMode: GridMode;
  readonly pictograph: PictographData;
}

/**
 * Select one real dataframe variant for every letter/grid pair whose hand arcs
 * derive to Together-Opposite. This deliberately ignores CSV timing/direction
 * columns and prop spin, both of which can disagree with the hand geometry.
 */
export function selectTogetherOppositeExamples(
  pictographs: readonly PictographData[]
): TogetherOppositeExample[] {
  const byLetterAndGrid = new Map<string, PictographData>();
  for (const pictograph of pictographs) {
    if (deriveTnDFromPictograph(pictograph).tndMode !== TnDMode.TOG_OPP) {
      continue;
    }
    const gridMode = pictograph.gridMode ?? GridMode.DIAMOND;
    const letter = pictograph.letter;
    if (!letter) continue;
    const key = `${letter}:${gridMode}`;
    if (!byLetterAndGrid.has(key)) byLetterAndGrid.set(key, pictograph);
  }

  return [...byLetterAndGrid.values()]
    .sort((a, b) => {
      const byLetter = String(a.letter).localeCompare(String(b.letter));
      return byLetter || String(a.gridMode).localeCompare(String(b.gridMode));
    })
    .map((pictograph) => ({
      id: pictograph.id,
      label: `${pictograph.letter} · ${pictograph.startPosition ?? "variant"} · ${pictograph.gridMode}`,
      gridMode: pictograph.gridMode ?? GridMode.DIAMOND,
      pictograph,
    }));
}

export async function loadTogetherOppositeExamples(): Promise<
  TogetherOppositeExample[]
> {
  const [diamond, box] = await Promise.all([
    letterQueryHandler.getAllPictographVariations(GridMode.DIAMOND),
    letterQueryHandler.getAllPictographVariations(GridMode.BOX),
  ]);
  return selectTogetherOppositeExamples([
    ...diamond.map((pictograph) => ({
      ...pictograph,
      gridMode: GridMode.DIAMOND,
    })),
    ...box.map((pictograph) => ({ ...pictograph, gridMode: GridMode.BOX })),
  ]);
}
