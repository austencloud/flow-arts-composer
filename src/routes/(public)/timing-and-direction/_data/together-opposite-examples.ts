import { HAND_PATH_REFERENCE_CARDS } from "$lib/features/choreo-card/domain/hand-path-reference-cards";
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  TnDMode,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";

export interface TogetherOppositeExample {
  readonly id: string;
  readonly label: string;
  readonly gridMode: GridMode;
  readonly pictograph: PictographData;
  readonly sequence: SequenceData;
  readonly step: number;
}

function hasSameHandPath(
  candidate: PictographData,
  target: PictographData
): boolean {
  return [HandSide.LEFT, HandSide.RIGHT].every((hand) => {
    const a = candidate.motions[hand];
    const b = target.motions[hand];
    return (
      a?.startLocation === b?.startLocation && a?.endLocation === b?.endLocation
    );
  });
}

/**
 * Resolve a real dataframe motion to a closed, authored hand-path reference
 * cycle. The rotations are performed by the shared geometry owner; every step
 * is re-derived before use so an apparently similar rotation cannot slip into
 * the player under the wrong timing-and-direction label.
 */
export function resolveTogetherOppositePlayback(
  pictograph: PictographData
): Pick<TogetherOppositeExample, "sequence" | "step"> | null {
  const references = HAND_PATH_REFERENCE_CARDS.filter(
    ({ id }) => id === "to" || id === "qo"
  );
  for (const reference of references) {
    for (let rotation = 0; rotation < 8; rotation++) {
      const rotated = rotateSequenceGeometry(reference.sequence, rotation);
      if (
        !rotated.steps.every(
          (step) => deriveTnDFromPictograph(step).tndMode === TnDMode.TOG_OPP
        )
      ) {
        continue;
      }
      const step = rotated.steps.findIndex((candidate) =>
        hasSameHandPath(candidate, pictograph)
      );
      if (step >= 0) {
        return {
          sequence: { ...rotated, id: `${rotated.id}-rotation-${rotation}` },
          step,
        };
      }
    }
  }
  return null;
}

/**
 * One readable representative per matching letter, selected from the real
 * dataframe by geometric derivation. CSV timing/direction columns and prop spin
 * are intentionally not used as classifiers.
 */
export function selectTogetherOppositeExamples(
  pictographs: readonly PictographData[]
): TogetherOppositeExample[] {
  const examples = new Map<string, TogetherOppositeExample>();
  for (const pictograph of pictographs) {
    const letter = pictograph.letter;
    if (
      !letter ||
      examples.has(letter) ||
      deriveTnDFromPictograph(pictograph).tndMode !== TnDMode.TOG_OPP
    ) {
      continue;
    }
    const playback = resolveTogetherOppositePlayback(pictograph);
    if (!playback) continue;
    const gridMode = pictograph.gridMode ?? GridMode.DIAMOND;
    examples.set(letter, {
      id: pictograph.id,
      label: `${letter} · ${pictograph.startPlacement ?? "variant"} · ${gridMode}`,
      gridMode,
      pictograph,
      ...playback,
    });
  }
  return [...examples.values()].sort((a, b) => a.label.localeCompare(b.label));
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
