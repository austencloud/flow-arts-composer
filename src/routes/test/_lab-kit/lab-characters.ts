/**
 * Which bodies an inspection lab under `/test` can put on stage.
 *
 * A lab that studies anatomy needs more bodies than the deployable catalog
 * ships: the hand-staged intake rig, and the controlled proportion sweep whose
 * copies move exactly one body dimension each. Registering those is a side
 * effect on a shared catalog, so it has to happen once, at module load, before
 * any picker reads it — not inside a render component, where the roster would
 * depend on whether a canvas had mounted yet.
 *
 * `staff-grip` owned this first. It moved here whole when the reach lab needed
 * the same roster, so both labs offer the same bodies and a character id means
 * the same thing in either address bar.
 *
 * Names follow `.claude/rules/3d-character-terminology.md`: a CHARACTER is the
 * visible 3D body. The package's `Avatar*` vocabulary stays at its own boundary.
 */
import {
  AVATAR_DEFINITIONS,
  type AvatarDefinition,
  type AvatarId,
} from "@austencloud/scene-3d";

import {
  CHARACTER_DEFINITIONS,
  type CharacterDefinition,
  type CharacterId,
} from "#lib/shared/3d/domain/character-model.js";
import {
  registerProportionSweepCharacters,
  type ProportionSweepCharacter,
} from "#lib/shared/3d/domain/proportion-sweep-characters.js";

/**
 * Rigs that exist on this machine under `static/models/avatars/bakeoff/` but
 * are not part of the deployable catalog. `personal-metaperson` already ships
 * as a `local-evaluation` definition inside the scene package; `intake-current`
 * is the slot the latest hand-staged intake lands in, so it has to be
 * registered from the product side.
 */
const LOCAL_INTAKE_DEFINITIONS: readonly AvatarDefinition[] = [
  {
    id: "intake-current" as AvatarId,
    name: "Current intake",
    modelPath: "/models/avatars/bakeoff/intake-current.glb",
    icon: "fa-person-rays",
    description: "Latest locally staged character intake",
    availability: "local-evaluation",
  },
];

function registerLocalIntakeCharacters(): void {
  for (const definition of LOCAL_INTAKE_DEFINITIONS) {
    if (AVATAR_DEFINITIONS.some(({ id }) => id === definition.id)) continue;
    AVATAR_DEFINITIONS.push(definition);
  }
}

registerLocalIntakeCharacters();

/**
 * The controlled proportion sweep: one licensed base rig with exactly one body
 * dimension moved per copy. The deployed catalog varies every dimension at
 * once, so a catalog body that fails a fit test cannot say which dimension
 * caused it. These can, which is the difference between a lab that reproduces
 * a failure and one that explains it.
 *
 * The GLBs are gitignored, so a checkout without them registers ten characters
 * whose models 404. That is the same trade the intake rig already makes and
 * the same reason neither is the default: a lab opens on a CDN body, and these
 * are one pick away for whoever has them.
 */
const LAB_SWEEP_CHARACTERS = registerProportionSweepCharacters();

const LAB_SWEEP_BY_ID = new Map<string, ProportionSweepCharacter>(
  LAB_SWEEP_CHARACTERS.map((character) => [character.id as string, character])
);

/** The sweep record behind a character, when the character is a sweep body. */
export function labSweepCharacter(
  id: string
): ProportionSweepCharacter | undefined {
  return LAB_SWEEP_BY_ID.get(id);
}

/** What a sweep body's axis is called in the labs' own vocabulary. */
export const LAB_SWEEP_AXIS_LABEL: Readonly<
  Record<ProportionSweepCharacter["axis"], string>
> = {
  none: "Control",
  stature: "Stature",
  shoulderWidth: "Shoulder width",
  armLength: "Arm length",
  armSegmentRatio: "Arm segment ratio",
  torsoGirth: "Build",
};

/**
 * The body a lab opens on.
 *
 * Not the intake rig, deliberately. `intake-current.glb` is gitignored local
 * evaluation material, so a fresh checkout that defaults to it opens on an
 * empty stage with no explanation. A catalog character streams from the CDN
 * and is there for everyone. The intake rig stays one pick away, and any URL
 * naming it still resolves.
 */
export const DEFAULT_LAB_CHARACTER_ID = "ch07" as CharacterId;

/** Every character a lab can pose, catalog and local intake alike. */
export function labCharacters(): readonly CharacterDefinition[] {
  return CHARACTER_DEFINITIONS;
}

export function labCharacter(id: string): CharacterDefinition | undefined {
  return CHARACTER_DEFINITIONS.find((definition) => definition.id === id);
}

export function isLabCharacterId(id: string): id is CharacterId {
  return labCharacter(id) !== undefined;
}

export function labCharacterName(id: string): string {
  return labCharacter(id)?.name ?? id;
}

/** True for a rig that only exists on this machine. */
export function isLocalOnlyCharacter(id: string): boolean {
  return labCharacter(id)?.availability === "local-evaluation";
}
