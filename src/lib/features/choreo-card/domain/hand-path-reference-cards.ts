import { createStartPositionData } from "$lib/shared/foundation/domain/factories/create-start-position-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPositionFromLocations } from "$lib/shared/pictograph/grid/services/grid-position-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { TND_BY_FAMILY, type TnDElement } from "./tnd-element";
import {
  HAND_PATH_REFERENCE_CARD_IDS,
  HAND_PATH_REFERENCE_CARD_VERSION,
  getHandPathReferenceDefinition,
  getHandPathReferenceDefinitionNotes,
  type HandPathReferenceCardDefinition,
  type HandPathReferenceCardId,
} from "./hand-path-reference-card-manifest";

export {
  HAND_PATH_REFERENCE_CARD_IDS,
  HAND_PATH_REFERENCE_CARD_VERSION,
  type HandPathReferenceCardId,
};

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

export type Move = readonly [
  leftFrom: GridLocation,
  leftTo: GridLocation,
  rightFrom: GridLocation,
  rightTo: GridLocation,
];

export interface HandPathReferenceCard {
  id: HandPathReferenceCardId;
  name: string;
  cardTitle: string;
  timing: "Split" | "Together" | "Quarter";
  direction: "Same" | "Opposite";
  element: TnDElement;
  sequence: SequenceData;
}

function handMotion(hand: HandSide, from: GridLocation, to: GridLocation) {
  return createMotionData({
    hand,
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });
}

function buildModeSequence(
  id: HandPathReferenceCardId,
  name: string,
  moves: readonly Move[],
  letters: readonly (Letter | null)[]
): SequenceData {
  const first = moves[0]!;
  const startPosition = getGridPositionFromLocations(first[0], first[2]);
  const startLeft = handMotion(HandSide.LEFT, first[0], first[0]);
  const startRight = handMotion(HandSide.RIGHT, first[2], first[2]);

  return createSequenceData({
    id: `hand-path-reference-${id}`,
    name,
    sequenceKind: "hand-path",
    displayName: getHandPathReferenceDefinition(id).cardTitle,
    notes: getHandPathReferenceDefinitionNotes(
      getHandPathReferenceDefinition(id)
    ),
    metadata: { isHandPathVisualization: true },
    word: "",
    gridMode: GridMode.DIAMOND,
    isCircular: true,
    startPosition: createStartPositionData({
      id: `hand-path-reference-${id}-start`,
      startPosition,
      endPosition: startPosition,
      gridPosition: startPosition,
      motions: { left: startLeft, right: startRight },
    }),
    steps: moves.slice(1).map((move, index) =>
      createStepData({
        id: `hand-path-reference-${id}-${index + 1}`,
        letter: letters[index] ?? null,
        gridMode: GridMode.DIAMOND,
        startPosition: getGridPositionFromLocations(move[0], move[2]),
        endPosition: getGridPositionFromLocations(move[1], move[3]),
        stepNumber: index + 1,
        motions: {
          left: handMotion(HandSide.LEFT, move[0], move[1]),
          right: handMotion(HandSide.RIGHT, move[2], move[3]),
        },
      })
    ),
  });
}

function card(
  definition: HandPathReferenceCardDefinition,
  moves: readonly Move[],
  letters: readonly (Letter | null)[]
): HandPathReferenceCard {
  const element = TND_BY_FAMILY[definition.familyId];
  if (!element) throw new Error(`Missing T&D family ${definition.familyId}`);
  return {
    id: definition.id,
    name: definition.name,
    cardTitle: definition.cardTitle,
    timing: definition.timing,
    direction: definition.direction,
    element,
    sequence: buildModeSequence(definition.id, definition.name, moves, letters),
  };
}

/**
 * The raw five-row waypoint tables behind the six reference cards: row 0 is
 * the start position, rows 1-4 are the beats. Exported so labs that transform
 * hand paths (rotate, mirror, flip, phase) start from the same geometry the
 * cards, learn lessons, and printed decks use.
 */
export const HAND_PATH_REFERENCE_MOVES: Readonly<
  Record<HandPathReferenceCardId, readonly Move[]>
> = {
  ss: [
    [S, S, N, N],
    [S, W, N, E],
    [W, N, E, S],
    [N, E, S, W],
    [E, S, W, N],
  ],
  ts: [
    [S, S, S, S],
    [S, W, S, W],
    [W, N, W, N],
    [N, E, N, E],
    [E, S, E, S],
  ],
  so: [
    [W, W, W, W],
    [W, N, W, S],
    [N, E, S, E],
    [E, S, E, N],
    [S, W, N, W],
  ],
  to: [
    [S, S, S, S],
    [S, W, S, E],
    [W, N, E, N],
    [N, E, N, W],
    [E, S, W, S],
  ],
  qo: [
    [S, S, E, E],
    [S, W, E, N],
    [W, N, N, W],
    [N, E, W, S],
    [E, S, S, E],
  ],
  qs: [
    [S, S, E, E],
    [S, E, E, N],
    [E, N, N, W],
    [N, W, W, S],
    [W, S, S, E],
  ],
};

export const ALPHA_BETA_HAND_PATH_CARDS = [
  card(getHandPathReferenceDefinition("ss"), HAND_PATH_REFERENCE_MOVES.ss, [
    Letter.A,
    Letter.A,
    Letter.A,
    Letter.A,
  ]),
  card(getHandPathReferenceDefinition("ts"), HAND_PATH_REFERENCE_MOVES.ts, [
    Letter.G,
    Letter.G,
    Letter.G,
    Letter.G,
  ]),
  card(getHandPathReferenceDefinition("so"), HAND_PATH_REFERENCE_MOVES.so, [
    Letter.D,
    Letter.J,
    Letter.D,
    Letter.J,
  ]),
  card(getHandPathReferenceDefinition("to"), HAND_PATH_REFERENCE_MOVES.to, [
    Letter.D,
    Letter.J,
    Letter.D,
    Letter.J,
  ]),
] as const satisfies readonly HandPathReferenceCard[];

export const GAMMA_HAND_PATH_CARDS = [
  card(getHandPathReferenceDefinition("qo"), HAND_PATH_REFERENCE_MOVES.qo, [
    null,
    Letter.P,
    null,
    Letter.P,
  ]),
  card(getHandPathReferenceDefinition("qs"), HAND_PATH_REFERENCE_MOVES.qs, [
    null,
    null,
    null,
    null,
  ]),
] as const satisfies readonly HandPathReferenceCard[];

/**
 * Learn, print preview, and physical releases all use these authored paths.
 * A correction here therefore reaches every teaching surface and export.
 */
export const HAND_PATH_REFERENCE_CARDS: readonly HandPathReferenceCard[] = [
  ...ALPHA_BETA_HAND_PATH_CARDS,
  ...GAMMA_HAND_PATH_CARDS,
];

export function getHandPathReferenceCards(
  ids: readonly HandPathReferenceCardId[] = HAND_PATH_REFERENCE_CARD_IDS
): HandPathReferenceCard[] {
  const byId = new Map(
    HAND_PATH_REFERENCE_CARDS.map((referenceCard) => [
      referenceCard.id,
      referenceCard,
    ])
  );
  return ids.flatMap((id) => {
    const referenceCard = byId.get(id);
    return referenceCard ? [referenceCard] : [];
  });
}

export function getHandPathReferenceNotes(
  referenceCard: HandPathReferenceCard
): string {
  return getHandPathReferenceDefinitionNotes(
    getHandPathReferenceDefinition(referenceCard.id)
  );
}
