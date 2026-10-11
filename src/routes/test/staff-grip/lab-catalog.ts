/**
 * What the lab can put on stage.
 *
 * The lab compares one grip problem across bodies, props and sequences, so it
 * needs every axis to come from the same catalogs the product ships. Nothing
 * here invents a character, a prop or a sequence: this module only names the
 * subsets the lab can reach and registers the locally staged intake rigs that
 * deliberately never enter the deployable catalog.
 */
import {
  SCENE_PROP_FAMILIES,
  SCENE_PROP_TYPES,
} from "#lib/shared/3d/domain/scene-prop-catalog.js";
import { ALL_FIXTURE_LOOPS } from "#lib/shared/combination/domain/demo-fixtures.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { loadByIdentifier } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";

import {
  DEFAULT_LAB_CHARACTER_ID,
  LAB_SWEEP_AXIS_LABEL,
  isLabCharacterId,
  isLocalOnlyCharacter,
  labCharacter,
  labCharacterName,
  labCharacters,
  labSweepCharacter,
} from "../_lab-kit/lab-characters";

import { isLabGoalId, loadLabGoalSequence } from "./lab-goals";

/**
 * The character roster, the local intake rig and the proportion sweep now live
 * with the shared lab kit, because the reach lab poses the same bodies. They
 * are re-exported here so every consumer that already names them through this
 * catalog keeps working, and so importing this module still registers the
 * lab-only characters as a side effect.
 */
export {
  DEFAULT_LAB_CHARACTER_ID,
  LAB_SWEEP_AXIS_LABEL,
  isLabCharacterId,
  isLocalOnlyCharacter,
  labCharacter,
  labCharacterName,
  labCharacters,
  labSweepCharacter,
};

/** Every prop the shared 3D catalog supports. The lab reaches all of them. */
export const LAB_PROP_TYPES: readonly PropType[] = SCENE_PROP_TYPES;

/**
 * The build the lab opens on: a real LED double staff from the shared
 * catalog's Double Staff family. `StaffLabState.prop` explains why it is not
 * the procedural Staff.
 */
export const DEFAULT_LAB_PROP: PropType = PropType.CAPSULE_BATON;

const LAB_PROP_TYPE_SET = new Set<PropType>(LAB_PROP_TYPES);

export function isLabPropType(value: string): value is PropType {
  return LAB_PROP_TYPE_SET.has(value as PropType);
}

/** The catalog's own label for a prop, so the lab never writes its own. */
export function labPropLabel(prop: PropType): string {
  for (const family of SCENE_PROP_FAMILIES) {
    const variant = family.variants.find(({ id }) => id === prop);
    if (variant) return variant.label;
  }
  return prop;
}

/**
 * A repeating word always shows in its smallest form, so a four-step GGGG loop
 * reads as "G". Two fixtures can simplify to the same word, so the fixture
 * key's own rotation suffix disambiguates them.
 */
export function labSequenceLabel(
  sequence: SequenceData,
  fixtureKey?: string
): string {
  const word = simplifyRepeatedWord(sequence.word ?? sequence.id);
  const rotation = fixtureKey?.match(/_(CCW|CW)$/i)?.[1]?.toLowerCase();
  return rotation ? `${word} ${rotation}` : word;
}

export interface LabSequenceOption {
  id: string;
  label: string;
  stepCount: number;
  sequence: SequenceData;
}

/**
 * The verified fixture loops. Every one is an exact row set of
 * `DiamondPictographDataframe.csv` and is enforced by
 * `tests/unit/combination/fixtures.test.ts`, so they are stable targets that
 * need neither a network round trip nor a signed-in library.
 *
 * These are the lab's harness, not its goal list. The goals — the 19 core TnD
 * sequences in `lab-goals.ts` — are what the controls pin; the fixtures stay
 * here so every URL that already names one keeps resolving, synchronously and
 * without a network round trip.
 */
export const LAB_FIXTURES: readonly LabSequenceOption[] = ALL_FIXTURE_LOOPS.map(
  ([fixtureKey, sequence]) => ({
    id: sequence.id,
    label: labSequenceLabel(sequence, fixtureKey),
    stepCount: sequence.steps.length,
    sequence,
  })
);

/**
 * The sequence the lab opens on.
 *
 * Deliberately a fixture rather than goal one. It resolves from the bundle, so
 * the stage has a sequence on the first frame instead of waiting on a catalog
 * fetch, and at eight steps it is the longest sequence the sweep covers — the
 * one that exercises the scrub's marker track at its densest. The goal list is
 * one press away and every goal id is a shareable URL.
 */
export const DEFAULT_LAB_SEQUENCE_ID = "fx-falg";

export function labFixture(id: string): LabSequenceOption | undefined {
  return LAB_FIXTURES.find((option) => option.id === id);
}

/**
 * Turn a sequence id from the URL back into a sequence. Fixtures resolve
 * synchronously; a goal comes from the baked `l1-tnd-motions` catalog, the same
 * documents the deck ships; anything else is a real library or community
 * sequence and goes through the product's own identifier loader, which is what
 * makes a pasted lab URL reproduce a library sequence on a cold load.
 */
export async function resolveLabSequence(
  id: string
): Promise<SequenceData | null> {
  const fixture = labFixture(id);
  if (fixture) return fixture.sequence;
  if (isLabGoalId(id)) return loadLabGoalSequence(id);
  return loadByIdentifier(id);
}
