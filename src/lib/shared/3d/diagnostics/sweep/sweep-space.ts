/**
 * The configuration space a grip/stance sweep walks.
 *
 * A performer's grip and stance solve does not fail as one bug. It fails for a
 * particular body holding a particular prop through a particular sequence, and
 * loading one of each is how a failure stays hidden. This module names the
 * three axes, builds their default membership from the catalogs that already
 * own it, and enumerates the cross product in a stable order so a run can be
 * resumed against the same list it started.
 *
 * Everything here is pure: no rig, no DOM, no WebGL.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "#lib/shared/3d/domain/character-model.js";
import { SCENE_PROP_TYPES } from "#lib/shared/3d/domain/scene-prop-catalog.js";

/** One body the sweep can pose. */
export interface SweepCharacter {
  id: CharacterId;
  /** Human name for the matrix row header. */
  label: string;
}

/** One prop the sweep can put in that body's hands. */
export interface SweepProp {
  id: PropType;
  label: string;
  /**
   * Prop length the run configures, in centimetres. The reach check compares
   * this against the longest prop the measured body can actually hold, so a
   * sweep that leaves it unset cannot report a prop-too-long failure.
   */
  lengthCm: number;
}

/** One sequence the sweep plays through. */
export interface SweepSequence {
  id: string;
  label: string;
  /** Steps in the sequence. The phase axis runs `[0, stepCount)`. */
  stepCount: number;
  data: SequenceData;
}

export interface SweepSpace {
  characters: readonly SweepCharacter[];
  props: readonly SweepProp[];
  sequences: readonly SweepSequence[];
}

/** One addressable cell of the matrix. */
export interface SweepConfiguration {
  key: string;
  character: SweepCharacter;
  prop: SweepProp;
  sequence: SweepSequence;
}

/**
 * Product default. Every catalog rig ships as a shape a real user can pick, so
 * a sweep that skips one is a sweep that cannot find that rig's failure.
 */
export function defaultSweepCharacters(): SweepCharacter[] {
  return CHARACTER_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.name,
  }));
}

/**
 * Props the 3D scene can actually render. Anything outside this catalog cannot
 * be posed, so sweeping it would only manufacture blocked cells.
 */
export function defaultSweepProps(lengthCm = DEFAULT_PROP_LENGTH_CM): SweepProp[] {
  return SCENE_PROP_TYPES.map((id) => ({ id, label: id, lengthCm }));
}

/**
 * The prop length a performer gets when nobody has chosen one, matching
 * `PerformerPropSizeSlider`'s fallback.
 *
 * The product has two of these and they disagree: this 81 cm fallback, and the
 * 34-inch staff in `DEFAULT_USER_PROPORTIONS`, which is what the scene actually
 * renders - a live rig reports a rendered staff length of 863.6 mm. A sweep
 * that only ever tests 81 cm therefore under-reports how far the shipped prop
 * overruns what a body can hold, so pass the length under investigation rather
 * than relying on this.
 */
export const DEFAULT_PROP_LENGTH_CM = 81;

/** The staff the scene renders today: 34 inches, from `DEFAULT_USER_PROPORTIONS`. */
export const RENDERED_STAFF_LENGTH_CM = 86.36;

/** Wrap real sequence data as a sweep axis member. */
export function toSweepSequence(sequence: SequenceData): SweepSequence {
  return {
    id: sequence.id,
    label: sequence.word || sequence.name || sequence.id,
    stepCount: sequence.steps.length,
    data: sequence,
  };
}

export function sweepConfigurationKey(
  characterId: string,
  propId: string,
  sequenceId: string
): string {
  return `${characterId}|${propId}|${sequenceId}`;
}

/**
 * Cross product in character-major order. The order is part of the contract:
 * a resumed run replays this list and skips the keys it already has, so a
 * reordering would silently re-sample work that was already done.
 */
export function enumerateSweepConfigurations(
  space: SweepSpace
): SweepConfiguration[] {
  const configurations: SweepConfiguration[] = [];
  for (const character of space.characters) {
    for (const prop of space.props) {
      for (const sequence of space.sequences) {
        configurations.push({
          key: sweepConfigurationKey(character.id, prop.id, sequence.id),
          character,
          prop,
          sequence,
        });
      }
    }
  }
  return configurations;
}

/**
 * Identifies the exact axis membership a run was built from. A resumed run
 * whose digest disagrees is a different sweep and must start over rather than
 * merge results measured against different sequences.
 */
export function sweepSpaceDigest(space: SweepSpace): string {
  const parts = [
    space.characters.map((character) => character.id).join(","),
    space.props.map((prop) => `${prop.id}@${prop.lengthCm}`).join(","),
    space.sequences.map((sequence) => sequence.id).join(","),
  ];
  return parts.join("//");
}
