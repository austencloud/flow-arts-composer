/**
 * The lab's goal list: the 19 core TnD sequences.
 *
 * These are ids 1-19 of `TND_MOTIONS` in `scripts/seed-tnd-deck.ts`, the deck
 * the `l1-tnd-motions` catalog ships, and the corpus
 * `docs/diagnostics/prop-continuity-findings.json` was swept against. The lab's
 * target is a teleport-free pass across all nineteen, so they are the thing the
 * controls pin — not an ad-hoc pick of demo fixtures.
 *
 * The roster below is data, but it is not a second source of truth. The seeder
 * remains the authority, and `tests/unit/3d-animation/staff-grip-goals-contract.test.ts`
 * fails if this list, the baked catalog, and the seeder ever disagree on a
 * playback-relevant field.
 *
 * VTG groups these by hand-path timing (split / together / quarter) and hand-path
 * direction (same / opposite); the labels come from `TND_FAMILIES` in the seeder.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { selectStaticSequence } from "$lib/shared/foundation/services/static-sequence-catalog";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

/** Where the browser reads the baked `l1-tnd-motions` catalog. */
export const LAB_GOAL_CATALOG_URL = "/data/hero/tnd-base-words.json";

export interface LabGoal {
  /** 1-19, matching the seeder's own `TND_MOTIONS` id. */
  readonly order: number;
  readonly id: string;
  /** The full expanded word. Data, never the label. */
  readonly word: string;
  /** What the user reads: the word in its smallest repeating form. */
  readonly label: string;
  readonly familyId: LabGoalFamilyId;
}

export type LabGoalFamilyId =
  | "split-same"
  | "tog-same"
  | "quarter-same"
  | "split-opp"
  | "tog-opp"
  | "quarter-opp";

export interface LabGoalFamily {
  readonly id: LabGoalFamilyId;
  /** The seeder's own VTG label. */
  readonly label: string;
  /** How the family's repeat divides the circle. */
  readonly typeCombo: "Quartered" | "Halved";
  /** The start position every goal in the family opens from. */
  readonly startPlacement: string;
  readonly goals: readonly LabGoal[];
}

interface GoalSeed {
  readonly order: number;
  readonly word: string;
  readonly familyId: LabGoalFamilyId;
}

const GOAL_SEEDS: readonly GoalSeed[] = [
  { order: 1, word: "AAAA", familyId: "split-same" },
  { order: 2, word: "BBBB", familyId: "split-same" },
  { order: 3, word: "CCCC", familyId: "split-same" },
  { order: 4, word: "GGGG", familyId: "tog-same" },
  { order: 5, word: "HHHH", familyId: "tog-same" },
  { order: 6, word: "IIII", familyId: "tog-same" },
  { order: 7, word: "SSSS", familyId: "quarter-same" },
  { order: 8, word: "TTTT", familyId: "quarter-same" },
  { order: 9, word: "UUUU", familyId: "quarter-same" },
  { order: 10, word: "VVVV", familyId: "quarter-same" },
  { order: 11, word: "JDJD", familyId: "split-opp" },
  { order: 12, word: "KEKE", familyId: "split-opp" },
  { order: 13, word: "LFLF", familyId: "split-opp" },
  { order: 14, word: "DJDJ", familyId: "tog-opp" },
  { order: 15, word: "EKEK", familyId: "tog-opp" },
  { order: 16, word: "FLFL", familyId: "tog-opp" },
  { order: 17, word: "MPMP", familyId: "quarter-opp" },
  { order: 18, word: "NQNQ", familyId: "quarter-opp" },
  { order: 19, word: "OROR", familyId: "quarter-opp" },
];

interface FamilySeed {
  readonly id: LabGoalFamilyId;
  readonly label: string;
  readonly typeCombo: "Quartered" | "Halved";
  readonly startPlacement: string;
}

const FAMILY_SEEDS: readonly FamilySeed[] = [
  {
    id: "split-same",
    label: "Split-Same",
    typeCombo: "Quartered",
    startPlacement: "alpha1",
  },
  {
    id: "tog-same",
    label: "Tog-Same",
    typeCombo: "Quartered",
    startPlacement: "beta5",
  },
  {
    id: "quarter-same",
    label: "Quarter-Same",
    typeCombo: "Quartered",
    startPlacement: "gamma11",
  },
  {
    id: "split-opp",
    label: "Split-Opp",
    typeCombo: "Halved",
    startPlacement: "alpha1",
  },
  {
    id: "tog-opp",
    label: "Tog-Opp",
    typeCombo: "Halved",
    startPlacement: "beta5",
  },
  {
    id: "quarter-opp",
    label: "Quarter-Opp",
    typeCombo: "Halved",
    startPlacement: "gamma11",
  },
];

/** The seeder's id scheme: `tnd-<familyId>-<lowercased word>`. */
function goalId(seed: GoalSeed): string {
  return `tnd-${seed.familyId}-${seed.word.toLowerCase()}`;
}

/** All nineteen, in seeder order. */
export const LAB_GOALS: readonly LabGoal[] = GOAL_SEEDS.map((seed) => ({
  order: seed.order,
  id: goalId(seed),
  word: seed.word,
  label: simplifyRepeatedWord(seed.word),
  familyId: seed.familyId,
}));

/**
 * The same nineteen, grouped the way VTG groups them.
 *
 * Nineteen controls in one wrapped row reads as a wall. Six named families of
 * three or four give the row a structure the user already has in their head,
 * and each family fits on one line at every supported width.
 */
export const LAB_GOAL_FAMILIES: readonly LabGoalFamily[] = FAMILY_SEEDS.map(
  (family) => ({
    ...family,
    goals: LAB_GOALS.filter((goal) => goal.familyId === family.id),
  }),
);

const GOALS_BY_ID = new Map<string, LabGoal>(
  LAB_GOALS.map((goal) => [goal.id, goal]),
);

export function labGoal(id: string): LabGoal | undefined {
  return GOALS_BY_ID.get(id);
}

export function isLabGoalId(id: string): boolean {
  return GOALS_BY_ID.has(id);
}

let catalogPayload: Promise<unknown> | null = null;

/**
 * One fetch of the baked catalog, shared by all nineteen goals. Retried on
 * failure rather than caching a rejection, so a dropped request does not brick
 * every goal for the rest of the session.
 */
function labGoalCatalog(fetcher: typeof fetch = fetch): Promise<unknown> {
  catalogPayload ??= fetcher(LAB_GOAL_CATALOG_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Goal catalog returned ${response.status}`);
      }
      return response.json();
    })
    .catch((error: unknown) => {
      catalogPayload = null;
      throw error;
    });
  return catalogPayload;
}

/**
 * Hydrate one goal from the baked catalog. Returns `null` for an id that is not
 * a goal, so callers can fall through to the library loader.
 */
export async function loadLabGoalSequence(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<SequenceData | null> {
  if (!GOALS_BY_ID.has(id)) return null;
  return selectStaticSequence(await labGoalCatalog(fetcher), id);
}
