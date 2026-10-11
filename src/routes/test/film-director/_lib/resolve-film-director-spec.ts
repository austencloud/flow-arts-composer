import {
  Plane,
  PRESET_VALID_COUNTS,
  calculateFacingAngle,
  createFormationFromPreset,
  type FormationPreset,
} from "@austencloud/scene-3d";
import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "#lib/shared/3d/domain/character-model.js";

import {
  EFFECTS,
  getRegistration,
} from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { getStageCoordinateFrame } from "#lib/shared/3d/environments/domain/stage-coordinate-frame.js";
import { getPerformerStageBounds } from "#lib/shared/3d/environments/domain/performer-stage-bounds.js";
import {
  getSceneEnvironmentRendererKey,
  SceneEnvironmentId,
} from "#lib/shared/3d/environments/domain/scene-environment.js";
import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { GridJoin } from "@tka/tka-types";

import {
  AUDIENCE_FACING_ANGLE,
  compileBlockingMoves,
  type DirectorBlockingMove,
} from "./blocking-language";
import { convertSceneBeatTimes } from "./director-beat-times";
import { resolveDirectorCameraTrack } from "./director-camera-track";
import {
  isDirectiveExpression,
  type DirectiveValue,
} from "#lib/features/film-director/domain/directives.js";
import {
  createAxisStream,
  resolveFilmSeed,
  seededPick,
  type FilmSeed,
} from "#lib/features/film-director/domain/directive-random.js";
import { resolveCastAxis } from "#lib/features/film-director/domain/resolve-directives.js";
import {
  assertSequenceDirective,
  transformSourceId,
} from "./sequence-language";
import {
  DIRECTOR_EFFORT_IDS,
  DIRECTOR_FORMATIONS,
  FilmDirectorInputSchema,
  type DirectorCastInput,
  type DirectorPerformerSequence,
  type DirectorSceneBlockingInput,
  type DirectorSceneBlockingPhaseInput,
  type DirectorSceneInput,
  type FilmDirectorInput,
  type ResolvedDirectorPerformer,
  type ResolvedDirectorScene,
  type ResolvedDirectorHold,
  type DirectorPropBuild,
  type ResolvedDirectorHandEffects,
  type ResolvedDirectorStepEffect,
  type ResolvedDirectorStepEffort,
  type ResolvedDirectorStepStaffLength,
  type ResolvedDirectorStepPlane,
  type ResolvedFilmDirectorSpec,
} from "./film-director-schema";

const DEFAULT_CHARACTERS = CHARACTER_DEFINITIONS.map(
  (character) => character.id
) as CharacterId[];

function createCharacterAxisStream(
  seed: FilmSeed,
  sceneId: string
): () => number {
  // Seed namespaces are persisted behavior. Keep the historical hash key so
  // migrating avatarId to characterId does not silently recast a saved film,
  // while making characterId the canonical reroll control for v4 authors.
  const legacySeed: FilmSeed = {
    ...seed,
    axes: {
      ...seed.axes,
      avatarId: seed.axes.characterId ?? seed.axes.avatarId ?? 0,
    },
  };
  return createAxisStream(legacySeed, sceneId, "avatarId");
}

function createHandPlaneAxisStream(
  seed: FilmSeed,
  sceneId: string,
  hand: "left" | "right"
): () => number {
  // Plane picks are persisted choreography. Keep the historical color-named
  // hash namespace so a vocabulary migration cannot reshuffle an existing
  // film, while canonical left/right salts remain the public reroll controls.
  const canonicalAxis = `${hand}Plane`;
  const legacyAxis = hand === "left" ? "bluePlane" : "redPlane";
  const legacySeed: FilmSeed = {
    ...seed,
    axes: {
      ...seed.axes,
      [legacyAxis]: seed.axes[canonicalAxis] ?? seed.axes[legacyAxis] ?? 0,
    },
  };
  return createAxisStream(legacySeed, sceneId, legacyAxis);
}

// Axis catalogs, built once at module scope. `effect` and `characterId` stay
// loosely typed as `string` here (see the per-axis comments in resolveScene)
// because their schema fields are un-narrowed `z.string()` refinements —
// the registry-type cast happens once, on the resolved concrete value, same
// as this file did before directives existed.
//
// Exported because they are what a directive may actually resolve to. Any
// surface that shows a director their options reads these, so the offered set
// and the accepted set cannot drift apart.
export const PROP_CATALOG = Object.values(PropType);
export const EFFECT_CATALOG: readonly string[] = [
  "none",
  ...EFFECTS.map((effect) => effect.id),
];
export const EFFORT_CATALOG = [...DIRECTOR_EFFORT_IDS] as EffortId[];
export const ENVIRONMENT_CATALOG = Object.values(SceneEnvironmentId);
export const PLANE_CATALOG = Object.values(Plane) as Plane[];
// "custom" needs per-performer positions, so an open formation pick never
// selects it — the count filter below narrows further, per scene.
export const FORMATION_CATALOG = DIRECTOR_FORMATIONS.filter(
  (preset) => preset !== "custom"
) as FormationPreset[];

type PerformerInput = NonNullable<DirectorCastInput["performers"]>[number];

interface ResolvedPerformerFields {
  id: string;
  name?: string;
  characterId: CharacterId;
  prop: PropType;
  propBuild?: DirectorPropBuild;
  gridJoin?: GridJoin | null;
  effect: EffectType;
  handEffects?: ResolvedDirectorHandEffects;
  effort: EffortId;
  sequence: DirectorPerformerSequence;
  position?: { x: number; z: number };
  facingDegrees?: number;
  blocking?: DirectorBlockingMove[];
  beatOffset?: number;
  staffLengthCm: number | null;
  leftPlane: Plane;
  rightPlane: Plane;
  stepPlanes: ResolvedDirectorStepPlane[];
  stepEffects: ResolvedDirectorStepEffect[];
  stepEfforts: ResolvedDirectorStepEffort[];
  stepStaffLengths: ResolvedDirectorStepStaffLength[];
  holds: ResolvedDirectorHold[];
}

/**
 * Gap 26. What a director may say where an effect is expected: one value, or
 * one per hand. Each side keeps the full directive grammar.
 */
export interface HandEffectPair {
  left: DirectiveValue<string>;
  right: DirectiveValue<string>;
}
type SpokenEffect = DirectiveValue<string> | HandEffectPair;

function isHandEffectPair(value: SpokenEffect): value is HandEffectPair {
  return (
    typeof value === "object" &&
    value !== null &&
    "left" in value &&
    "right" in value
  );
}

/**
 * Gap 20. Where performer `index` of `count` lands on a level ramp. The ends
 * are exactly `from` and `to`; between them the line is walked and rounded, so
 * a 1-to-3 ramp across four performers reads 1, 2, 2, 3 rather than inventing
 * fractional levels the generator has no meaning for.
 */
export function rampedSequenceLevel(
  ramp: { from: number; to: number },
  index: number,
  count: number
): number {
  if (count <= 1) return ramp.from;
  const walked = ramp.from + ((ramp.to - ramp.from) * index) / (count - 1);
  return Math.min(3, Math.max(1, Math.round(walked)));
}

/**
 * Gap 20. Reads a spoken `beatOffset` for one performer. A plain number is
 * everyone's offset; `{canon}` staggers the cast, performer k entering k
 * offsets after the first, which is what a canon means.
 */
export function spreadBeatOffset(
  spoken: number | { canon: number } | undefined,
  index: number
): number | undefined {
  if (spoken === undefined) return undefined;
  if (typeof spoken === "number") return spoken;
  return index * spoken.canon;
}

function contextualEnvironmentFromEffects(
  effects: readonly EffectType[]
): SceneEnvironmentId {
  if (effects.includes("bubbles")) return "ocean";
  if (effects.includes("fire")) return "autumn";
  if (effects.some((effect) => effect === "led" || effect === "zap"))
    return "cosmic";
  return "forest";
}

function defaultFormation(count: number): FormationPreset {
  // Gap 21. Nobody is standing anywhere, so no preset describes the stage.
  // "custom" is the honest answer: the arrangement is exactly the (empty)
  // list of positions.
  if (count === 0) return "custom";
  if (count === 1) return "solo";
  if (count <= 4) return "grid-2x2";
  return "circle";
}

/**
 * Expands a `cast` block into one performer-input slot per `cast.count`.
 * Overrides match `performer-${index + 1}` by explicit id first; overrides
 * with no id fill whatever slots remain, in array order. An override whose
 * id doesn't name one of this cast's performers is a rejection, not a
 * silent positional guess — that would put the wrong override on the wrong
 * performer (e.g. a lone `{id:"performer-3", ...}` landing on performer-1).
 */
function buildCastPerformerInputs(cast: DirectorCastInput): PerformerInput[] {
  const overrides = cast.performers ?? [];
  const byIndex: (PerformerInput | undefined)[] = new Array(cast.count).fill(
    undefined
  );
  const idLess: PerformerInput[] = [];
  const idPattern = /^performer-(\d+)$/;

  for (const override of overrides) {
    if (override.id === undefined) {
      idLess.push(override);
      continue;
    }
    const match = idPattern.exec(override.id);
    const index = match ? Number(match[1]) - 1 : -1;
    if (index < 0 || index >= cast.count) {
      throw new Error(
        `Cast override "${override.id}" does not match any of the ${cast.count} performers.`
      );
    }
    byIndex[index] = override;
  }

  let cursor = 0;
  for (const override of idLess) {
    while (cursor < cast.count && byIndex[cursor] !== undefined) cursor += 1;
    if (cursor >= cast.count) break;
    byIndex[cursor] = override;
    cursor += 1;
  }

  return Array.from({ length: cast.count }, (_, index) => ({
    ...(byIndex[index] ?? {}),
    id: `performer-${index + 1}`,
  }));
}

/**
 * Resolves a single scene-scoped directive (formation, environmentId,
 * stepPlanes entries). `sameAs` and `pick: "distinct"` are performer-scoped
 * concepts and have no meaning for a single scene-level value.
 *
 * `streamKey` defaults to `sceneId` (the original, only behavior) — pass a
 * more specific key when several scene-scoped values share the same `axis`
 * name within one scene (e.g. multiple stepPlanes entries all resolve on
 * axis "stepPlane") so each gets its own draw instead of colliding on an
 * identical fresh stream. `sceneId` itself stays the real scene id in error
 * text regardless of `streamKey`.
 */
function resolveSceneDirective<T extends string>(
  value: DirectiveValue<T> | undefined,
  axis: string,
  fallback: () => T,
  sceneId: string,
  seed: FilmSeed,
  catalog: readonly T[],
  streamKey: string = sceneId
): T {
  if (value === undefined) return fallback();
  if (!isDirectiveExpression(value)) return value;
  if ("sameAs" in value || ("pick" in value && value.pick === "distinct")) {
    throw new Error(
      `Scene "${sceneId}": "${axis}" supports literals, pick:any, oneOf, and not — distinct/sameAs are performer-scoped.`
    );
  }
  const [resolved] = resolveCastAxis<T>({
    axis,
    sceneId,
    performerIds: ["scene"],
    values: [value],
    catalog,
    random: createAxisStream(seed, streamKey, axis),
  });
  return resolved!;
}

/**
 * Resolves one performer's effective stepPlanes list. Each entry's `plane`
 * is a scene-scoped directive (see resolveSceneDirective) keyed by axis
 * "stepPlane" so a single `seed.axes.stepPlane` reroll reshuffles every
 * stepPlanes entry across the film, while each (performer, step, hand)
 * triple still draws from its own stream via a distinguishing `streamKey`.
 */
function resolveStepPlanesForPerformer(
  entries: readonly {
    step: number;
    hand: "left" | "right";
    plane: DirectiveValue<Plane>;
  }[],
  performerId: string,
  sceneId: string,
  seed: FilmSeed,
  seedSceneId: string = sceneId
): ResolvedDirectorStepPlane[] {
  return entries.map((entry) => ({
    step: entry.step,
    hand: entry.hand,
    plane: resolveSceneDirective<Plane>(
      entry.plane,
      "stepPlane",
      () => {
        throw new Error(
          `Scene "${sceneId}": stepPlanes entry for "${performerId}" at step ${entry.step} is missing a plane.`
        );
      },
      sceneId,
      seed,
      PLANE_CATALOG,
      // NUL-separated like createAxisStream's own key: authored ids may
      // contain spaces, so a space-joined key would be ambiguous.
      `${seedSceneId}\u0000${performerId}\u0000${entry.step}\u0000${entry.hand === "left" ? "blue" : "red"}`
    ),
  }));
}

/**
 * Rejects two entries that address the same step. Directors write these lists
 * by hand and a duplicate is always a mistake: whichever entry the reader
 * believes is in force, the other one is dead text.
 */
function assertOneEntryPerStep(
  entries: readonly { step: number }[],
  field: string,
  performerId: string,
  sceneId: string
): void {
  const seen = new Set<number>();
  for (const entry of entries) {
    if (seen.has(entry.step)) {
      throw new Error(
        `Scene "${sceneId}": performer "${performerId}" ${field} names step ${entry.step} twice.`
      );
    }
    seen.add(entry.step);
  }
}

/**
 * Resolves one performer's effective stepEffects list. Each entry's value is a
 * scene-scoped directive on axis "stepEffect", so a single
 * `seed.axes.stepEffect` reroll reshuffles every stepEffects entry in the
 * film, while each (performer, step) pair still draws from its own stream via
 * a distinguishing streamKey — the same arrangement stepPlanes uses.
 */
function resolveStepEffectsForPerformer(
  entries: readonly { step: number; effect: SpokenEffect }[],
  performerId: string,
  sceneId: string,
  seed: FilmSeed,
  seedSceneId: string = sceneId
): ResolvedDirectorStepEffect[] {
  assertOneEntryPerStep(entries, "stepEffects", performerId, sceneId);
  const resolveOne = (
    value: DirectiveValue<string>,
    entryStep: number,
    // Gap 26. The hands of one entry must not share a stream key, or a
    // `pick: "any"` pair would draw the same effect for both.
    handKey: string
  ): EffectType =>
    resolveSceneDirective<string>(
      value,
      "stepEffect",
      () => {
        throw new Error(
          `Scene "${sceneId}": stepEffects entry for "${performerId}" at step ${entryStep} is missing an effect.`
        );
      },
      sceneId,
      seed,
      EFFECT_CATALOG,
      // NUL-separated like createAxisStream's own key: authored ids may
      // contain spaces, so a space-joined key would be ambiguous.
      `${seedSceneId}\u0000${performerId}\u0000${entryStep}\u0000stepEffect${handKey}`
    ) as EffectType;

  return entries.map((entry) => {
    if (!isHandEffectPair(entry.effect)) {
      return {
        step: entry.step,
        effect: resolveOne(entry.effect, entry.step, ""),
      };
    }
    const left = resolveOne(entry.effect.left, entry.step, "");
    const right = resolveOne(entry.effect.right, entry.step, "-right");
    return { step: entry.step, effect: left, handEffects: { left, right } };
  });
}

/** The effort twin of resolveStepEffectsForPerformer, axis "stepEffort". */
function resolveStepEffortsForPerformer(
  entries: readonly { step: number; effort: DirectiveValue<EffortId> }[],
  performerId: string,
  sceneId: string,
  seed: FilmSeed,
  seedSceneId: string = sceneId
): ResolvedDirectorStepEffort[] {
  assertOneEntryPerStep(entries, "stepEfforts", performerId, sceneId);
  return entries.map((entry) => ({
    step: entry.step,
    effort: resolveSceneDirective<EffortId>(
      entry.effort,
      "stepEffort",
      () => {
        throw new Error(
          `Scene "${sceneId}": stepEfforts entry for "${performerId}" at step ${entry.step} is missing an effort.`
        );
      },
      sceneId,
      seed,
      EFFORT_CATALOG,
      `${seedSceneId}\u0000${performerId}\u0000${entry.step}\u0000stepEffort`
    ),
  }));
}

/**
 * Sorts a performer's holds by where they start and proves none overlaps the
 * next. Overlapping holds have no honest meaning: the lag the first one adds
 * would move the second one's window out from under the number the director
 * wrote.
 */
function resolveHoldsForPerformer(
  holds: readonly { fromStep: number; steps: number; progress?: number }[],
  performerId: string,
  sceneId: string
): ResolvedDirectorHold[] {
  const sorted = [...holds].sort((a, b) => a.fromStep - b.fromStep);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.fromStep < previous.fromStep + previous.steps) {
      throw new Error(
        `Scene "${sceneId}": performer "${performerId}" holds overlap: step ${previous.fromStep} for ${previous.steps} steps and step ${current.fromStep} for ${current.steps} steps.`
      );
    }
  }
  return sorted.map((hold) => ({
    fromStep: hold.fromStep,
    steps: hold.steps,
    // Gap 19. Absent stays absent so a film that never fixes the frozen pose
    // resolves exactly as it did before the word existed.
    ...(hold.progress !== undefined ? { progress: hold.progress } : {}),
  }));
}

/**
 * Gap 17. A prop-length list is a ramp, so it resolves sorted with every
 * entry's arrival stated. `linear` is the default because a director naming a
 * second length is usually describing growth, not a jump cut.
 */
function resolveStepStaffLengthsForPerformer(
  entries: readonly {
    step: number;
    staffLengthCm: number;
    ease?: "cut" | "linear";
  }[],
  performerId: string,
  sceneId: string
): ResolvedDirectorStepStaffLength[] {
  assertOneEntryPerStep(entries, "stepStaffLengths", performerId, sceneId);
  return [...entries]
    .sort((a, b) => a.step - b.step)
    .map((entry) => ({
      step: entry.step,
      staffLengthCm: entry.staffLengthCm,
      ease: entry.ease ?? "linear",
    }));
}

function resolveEffectPresets(
  effectPresets: Record<string, string | { pick: "any" }>,
  sceneId: string,
  seed: FilmSeed,
  seedSceneId: string = sceneId
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [effectId, presetValue] of Object.entries(effectPresets)) {
    if (typeof presetValue === "string") {
      const registration = getRegistration(effectId);
      if (!registration) {
        throw new Error(
          `Effect preset references unknown effect "${effectId}".`
        );
      }
      if (
        !registration.presetGroup.presets.some(
          (preset) => preset.id === presetValue
        )
      ) {
        throw new Error(
          `Effect "${effectId}" has no preset named "${presetValue}".`
        );
      }
      resolved[effectId] = presetValue;
      continue;
    }

    // { pick: "any" } — draw from the effect's registered presets. A missing
    // registration and an empty preset group collapse to the same error:
    // both mean there is nothing to pick from.
    const registration = getRegistration(effectId);
    const presetIds = registration?.presetGroup.presets.map(
      (preset) => preset.id
    );
    const picked = presetIds?.length
      ? seededPick(
          presetIds,
          createAxisStream(seed, seedSceneId, `effectPreset:${effectId}`)
        )
      : undefined;
    if (picked === undefined) {
      throw new Error(
        `Scene "${sceneId}": effect "${effectId}" has no registered presets to pick from.`
      );
    }
    resolved[effectId] = picked;
  }
  return resolved;
}

function validateEffectOverrides(
  effectOverrides: Record<string, Record<string, unknown>>
): void {
  for (const effectId of Object.keys(effectOverrides)) {
    if (!getRegistration(effectId)) {
      throw new Error(
        `Effect overrides reference unknown effect "${effectId}".`
      );
    }
  }
}

type FormationLayout = ReturnType<typeof createFormationFromPreset>;
type FormationSlot = FormationLayout["slots"][number];

/**
 * Two conventions collide here. The formation library's "same-direction"
 * default faces +Z, but every director camera fronts the group from -Z
 * (computeFramingScene's wall-plane eye). A film's default cast must face
 * its audience, so same-direction (and slot-less custom rosters) face -Z.
 * Slots with their own facingAngle (circle, back-to-back, ...) keep theirs.
 */
function slotFacingAngle(
  slot: FormationSlot | undefined,
  formation: FormationLayout
): number {
  if (!slot) return AUDIENCE_FACING_ANGLE;
  if (
    slot.facingAngle === undefined &&
    formation.facingMode === "same-direction"
  ) {
    return AUDIENCE_FACING_ANGLE;
  }
  return calculateFacingAngle(slot, formation);
}

function endFormationMarks(
  preset: FormationPreset,
  count: number
): { x: number; z: number }[] {
  if (preset === "custom") {
    throw new Error(
      'Blocking cannot end in a "custom" formation — it has no marks of its own. Name a preset, or give each performer their own blocking.'
    );
  }
  if (!PRESET_VALID_COUNTS[preset].includes(count)) {
    throw new Error(
      `Blocking ends in "${preset}", which does not support ${count} performers.`
    );
  }
  const layout = createFormationFromPreset(preset, count);
  return Array.from({ length: count }, (_, index) => {
    const slot = layout.slots.find((candidate) => candidate.index === index);
    if (!slot) {
      throw new Error(
        `Blocking ends in "${preset}", which has no mark for performer ${index + 1}.`
      );
    }
    return { ...slot.position };
  });
}

/** Close enough to a mark that walking to it would be walking in place. */
const MARK_ARRIVED_METERS = 0.05;

function movesToMark(
  mark: { x: number; z: number },
  start: { x: number; z: number },
  blocking: DirectorSceneBlockingPhaseInput
): DirectorBlockingMove[] {
  if (Math.hypot(mark.x - start.x, mark.z - start.z) < MARK_ARRIVED_METERS) {
    return [{ move: "stand", durationSeconds: blocking.durationSeconds }];
  }
  return [
    {
      move: "walk",
      to: mark,
      // Everyone keeps the facing they opened with, so a cast facing its
      // audience travels sideways or backs up into the new formation instead
      // of turning away to walk there.
      facing: blocking.facing ?? "hold",
      durationSeconds: blocking.durationSeconds,
      easing: blocking.easing,
    },
  ];
}

/**
 * Gap 18. Cast staging is a timeline, not one instruction. A phase list says
 * "line up, hold, then break into a circle on the drop", and each phase may
 * open on a stated second (the converter has already turned a count or a cue
 * into one) or simply follow the one before it.
 *
 * Phases run in the order written and may not overlap, because two formations
 * cannot both own the cast at once, and the error has to name both phases or
 * the director cannot tell which pair to move.
 */
function assertOrderedPhases(
  phases: readonly DirectorSceneBlockingPhaseInput[],
  durationSeconds: number,
  sceneId: string
): void {
  let cursor = 0;
  let previousIndex = 0;
  let previousEnd = 0;
  for (const [index, phase] of phases.entries()) {
    const start = phase.startSeconds ?? cursor;
    if (index > 0 && start < previousEnd) {
      throw new Error(
        `Scene "${sceneId}": blocking phase ${index + 1} starts at ${fmtSeconds(start)}s, before phase ${previousIndex + 1} finishes at ${fmtSeconds(previousEnd)}s.`
      );
    }
    cursor = start + (phase.durationSeconds ?? 0);
    if (cursor > durationSeconds + 1e-6) {
      throw new Error(
        `Scene "${sceneId}": blocking phase ${index + 1} finishes at ${fmtSeconds(cursor)}s, past the scene's ${fmtSeconds(durationSeconds)}s.`
      );
    }
    previousIndex = index;
    previousEnd = cursor;
  }
}

const fmtSeconds = (value: number): string => String(Number(value.toFixed(2)));

/** One performer's walk through every phase, standing through the gaps. */
function movesThroughPhases(
  phases: readonly DirectorSceneBlockingPhaseInput[],
  start: { x: number; z: number },
  index: number,
  count: number
): DirectorBlockingMove[] {
  const moves: DirectorBlockingMove[] = [];
  let cursor = 0;
  let at = start;
  for (const phase of phases) {
    const phaseStart = phase.startSeconds ?? cursor;
    if (phaseStart > cursor) {
      moves.push({ move: "stand", durationSeconds: phaseStart - cursor });
    }
    const mark = endFormationMarks(phase.endFormation, count)[index]!;
    moves.push(...movesToMark(mark, at, phase));
    at = mark;
    cursor = phaseStart + (phase.durationSeconds ?? 0);
  }
  return moves;
}

function buildResolvedPerformers(
  inputs: readonly ResolvedPerformerFields[],
  formationPreset: FormationPreset,
  durationSeconds: number,
  sceneBlocking: DirectorSceneBlockingInput | undefined,
  sceneId: string
): ResolvedDirectorPerformer[] {
  // Gap 21. No preset lists 0 as a valid count, and none should: an empty
  // stage has nothing to arrange, so there is no arrangement to check.
  if (inputs.length === 0) return [];
  const validCounts = PRESET_VALID_COUNTS[formationPreset];
  if (!validCounts.includes(inputs.length)) {
    throw new Error(
      `Formation "${formationPreset}" does not support ${inputs.length} performers.`
    );
  }
  if (
    formationPreset === "custom" &&
    inputs.some((performer) => performer.position === undefined)
  ) {
    throw new Error("Every performer in a custom formation needs a position.");
  }

  const formation = createFormationFromPreset(formationPreset, inputs.length);
  const phases = Array.isArray(sceneBlocking) ? sceneBlocking : null;
  if (phases) assertOrderedPhases(phases, durationSeconds, sceneId);
  const single = Array.isArray(sceneBlocking) ? null : (sceneBlocking ?? null);
  const marks = single
    ? endFormationMarks(single.endFormation, inputs.length)
    : null;
  const seenIds = new Set<string>();

  return inputs.map((input, index) => {
    const id = input.id;
    if (seenIds.has(id)) throw new Error(`Performer id "${id}" is duplicated.`);
    seenIds.add(id);

    if (
      !CHARACTER_DEFINITIONS.some(
        (character) => character.id === input.characterId
      )
    ) {
      throw new Error(
        `Character "${input.characterId}" is not in the deployed 3D catalog.`
      );
    }

    const slot = formation.slots.find((candidate) => candidate.index === index);
    if (!slot && !input.position) {
      throw new Error(
        `Formation "${formationPreset}" has no slot for performer ${index + 1}.`
      );
    }
    const position = input.position ?? slot!.position;
    const facingAngle =
      input.facingDegrees !== undefined
        ? (input.facingDegrees * Math.PI) / 180
        : slotFacingAngle(slot, formation);

    // A performer's own blocking is dictation and wins outright: the director
    // said where this one goes, which is not "and also join the formation."
    const moves =
      input.blocking ??
      (phases
        ? movesThroughPhases(phases, position, index, inputs.length)
        : marks && single
          ? movesToMark(marks[index]!, position, single)
          : []);

    return {
      id,
      name: input.name ?? `Performer ${index + 1}`,
      characterId: input.characterId,
      prop: input.prop,
      ...(input.propBuild ? { propBuild: input.propBuild } : {}),
      ...(input.gridJoin !== undefined ? { gridJoin: input.gridJoin } : {}),
      effect: input.effect,
      ...(input.handEffects ? { handEffects: input.handEffects } : {}),
      effort: input.effort,
      sequence: input.sequence,
      position: { ...position },
      facingAngle,
      blocking: compileBlockingMoves(moves, {
        durationSeconds,
        performerId: id,
        startPosition: position,
        startFacingAngle: facingAngle,
      }),
      beatOffset: input.beatOffset ?? 0,
      staffLengthCm: input.staffLengthCm,
      leftPlane: input.leftPlane,
      rightPlane: input.rightPlane,
      stepPlanes: input.stepPlanes,
      stepEffects: input.stepEffects,
      stepEfforts: input.stepEfforts,
      // Absent, not empty: a prop that keeps one length has no ramp, and an
      // empty array in every snapshot would be noise.
      ...(input.stepStaffLengths.length
        ? { stepStaffLengths: input.stepStaffLengths }
        : {}),
      holds: input.holds,
    };
  });
}

function resolveScene(
  rawScene: DirectorSceneInput,
  sceneIndex: number,
  startSeconds: number,
  startStep: number,
  aspectRatio: number,
  filmSeed: FilmSeed
): ResolvedDirectorScene {
  // Beats convert against the scene's own bpm, so bpm resolves first; every
  // line below this one thinks purely in seconds. `stated` tracks whether
  // the director actually wrote a bpm — describeBeats() phrases an
  // unstated fallback as "the default 90 bpm" rather than naming a number
  // the director never typed.
  const bpmStated = rawScene.performance?.bpm !== undefined;
  const bpm = rawScene.performance?.bpm ?? 90;
  const scene = convertSceneBeatTimes(rawScene, {
    value: bpm,
    stated: bpmStated,
    beatsPerBar: rawScene.performance?.meter?.beatsPerBar,
  });
  const durationSeconds = scene.durationSeconds ?? 8;
  const cast = scene.performance?.cast;
  /**
   * Gap 14. Which scene's name the seeded draws happen under. Every stream
   * key below uses this; error text keeps using `scene.id`, so a rejection
   * still names the scene the director is reading.
   */
  const seedSceneId = scene.seedAs ?? scene.id;

  // Gap 21. A stated empty cast, by either spelling, is an empty stage.
  // Only silence about the cast falls back to the lone default performer.
  const rawInputs: PerformerInput[] = cast
    ? buildCastPerformerInputs(cast)
    : (scene.performance?.performers ?? [{}]);

  const performerIds = rawInputs.map(
    (input, index) => input.id ?? `performer-${index + 1}`
  );

  // characterId's schema field is an un-narrowed `z.string()` (validated at
  // runtime against the deployed catalog, not by a literal-union schema), so
  // the axis resolves as plain strings and the registry cast happens once on
  // the resolved value below — same pattern this file used pre-directives.
  const characterIdValues: DirectiveValue<string>[] = rawInputs.map(
    (input, index) =>
      input.characterId ??
      cast?.defaults?.characterId ??
      DEFAULT_CHARACTERS[index % DEFAULT_CHARACTERS.length]!
  );
  const propValues: DirectiveValue<PropType>[] = rawInputs.map(
    (input) => input.prop ?? cast?.defaults?.prop ?? PropType.STAFF
  );
  // Gap 26. An effect is one value or a hand pair. The left column is what
  // the axis has always resolved, so a film that never speaks a pair draws
  // exactly the numbers it drew before; the right column runs as a second
  // stream over only the performers who did speak one.
  const spokenEffects = rawInputs.map(
    (input) => input.effect ?? cast?.defaults?.effect ?? "none"
  );
  const effectValues: DirectiveValue<string>[] = spokenEffects.map((value) =>
    isHandEffectPair(value) ? value.left : (value as DirectiveValue<string>)
  );
  const effortValues: DirectiveValue<EffortId>[] = rawInputs.map(
    (input) => input.effort ?? cast?.defaults?.effort ?? "linear"
  );

  // Pre-validate literal character IDs with the original, more specific error
  // text ("not in the deployed 3D catalog") — resolveCastAxis's own catalog
  // check exists too (needed so a distinct pick still has a pool to draw
  // from), but its generic axis-catalog message is a worse error for the
  // single-character case this file has always reported this way.
  for (const value of characterIdValues) {
    if (isDirectiveExpression(value)) continue;
    if (!CHARACTER_DEFINITIONS.some((character) => character.id === value)) {
      throw new Error(
        `Character "${value}" is not in the deployed 3D catalog.`
      );
    }
  }
  const resolvedCharacterIds = resolveCastAxis<string>({
    axis: "characterId",
    sceneId: scene.id,
    performerIds,
    values: characterIdValues,
    catalog: DEFAULT_CHARACTERS,
    random: createCharacterAxisStream(filmSeed, seedSceneId),
  });
  const resolvedProps = resolveCastAxis<PropType>({
    axis: "prop",
    sceneId: scene.id,
    performerIds,
    values: propValues,
    catalog: PROP_CATALOG,
    random: createAxisStream(filmSeed, seedSceneId, "prop"),
  });
  const resolvedEffects = resolveCastAxis<string>({
    axis: "effect",
    sceneId: scene.id,
    performerIds,
    values: effectValues,
    catalog: EFFECT_CATALOG,
    random: createAxisStream(filmSeed, seedSceneId, "effect"),
  });
  const pairIndices = spokenEffects
    .map((value, index) => (isHandEffectPair(value) ? index : -1))
    .filter((index) => index >= 0);
  const resolvedHandEffects: (ResolvedDirectorHandEffects | undefined)[] =
    rawInputs.map(() => undefined);
  if (pairIndices.length > 0) {
    const rightHands = resolveCastAxis<string>({
      axis: "effect",
      sceneId: scene.id,
      performerIds: pairIndices.map((index) => performerIds[index]!),
      values: pairIndices.map(
        (index) => (spokenEffects[index] as HandEffectPair).right
      ),
      catalog: EFFECT_CATALOG,
      random: createAxisStream(filmSeed, seedSceneId, "effect:right"),
    });
    pairIndices.forEach((index, cursor) => {
      resolvedHandEffects[index] = {
        left: resolvedEffects[index]! as EffectType,
        right: rightHands[cursor]! as EffectType,
      };
    });
  }
  const resolvedEfforts = resolveCastAxis<EffortId>({
    axis: "effort",
    sceneId: scene.id,
    performerIds,
    values: effortValues,
    catalog: EFFORT_CATALOG,
    random: createAxisStream(filmSeed, seedSceneId, "effort"),
  });

  // staffLengthCm has no finite catalog (a pick needs an explicit "from"),
  // and its system default is the literal `null` bypass — not a value on
  // any axis. So only performers that actually state a directive or literal
  // run through resolveCastAxis; everyone else keeps `null` untouched.
  const staffLengthStates = rawInputs.map(
    (input) => input.staffLengthCm ?? cast?.defaults?.staffLengthCm
  );
  const staffIndices = staffLengthStates
    .map((value, index) => (value !== undefined ? index : -1))
    .filter((index) => index >= 0);
  const resolvedStaffLengths: (number | null)[] = rawInputs.map(() => null);
  const staffStatingIds = new Set(
    staffIndices.map((index) => performerIds[index]!)
  );
  for (const index of staffIndices) {
    const value = staffLengthStates[index];
    if (typeof value !== "object" || value === null || !("sameAs" in value)) {
      continue;
    }
    const target = (value as { sameAs: string }).sameAs;
    if (performerIds.includes(target) && !staffStatingIds.has(target)) {
      throw new Error(
        `Scene "${scene.id}", axis "staffLengthCm": sameAs references "${target}", which has no staff length to copy.`
      );
    }
  }
  if (staffIndices.length > 0) {
    const resolved = resolveCastAxis<number>({
      axis: "staffLengthCm",
      sceneId: scene.id,
      performerIds: staffIndices.map((index) => performerIds[index]!),
      values: staffIndices.map((index) => staffLengthStates[index]!),
      catalog: null,
      random: createAxisStream(filmSeed, seedSceneId, "staffLengthCm"),
    });
    staffIndices.forEach((index, cursor) => {
      resolvedStaffLengths[index] = resolved[cursor]!;
    });
  }

  const leftPlaneValues: DirectiveValue<Plane>[] = rawInputs.map(
    (input) => input.leftPlane ?? cast?.defaults?.leftPlane ?? Plane.WALL
  );
  const rightPlaneValues: DirectiveValue<Plane>[] = rawInputs.map(
    (input) => input.rightPlane ?? cast?.defaults?.rightPlane ?? Plane.WALL
  );
  const resolvedLeftPlanes = resolveCastAxis<Plane>({
    axis: "leftPlane",
    sceneId: scene.id,
    performerIds,
    values: leftPlaneValues,
    catalog: PLANE_CATALOG,
    random: createHandPlaneAxisStream(filmSeed, seedSceneId, "left"),
  });
  const resolvedRightPlanes = resolveCastAxis<Plane>({
    axis: "rightPlane",
    sceneId: scene.id,
    performerIds,
    values: rightPlaneValues,
    catalog: PLANE_CATALOG,
    random: createHandPlaneAxisStream(filmSeed, seedSceneId, "right"),
  });

  // A performer's own stepPlanes list REPLACES cast defaults entirely — it
  // does not merge with them. Naming a performer's steps is dictation: the
  // director said exactly what happens at those steps, not "add these to
  // whatever the cast shares."
  const resolvedStepPlanes: ResolvedDirectorStepPlane[][] = rawInputs.map(
    (input, index) => {
      const entries = (input.stepPlanes ??
        cast?.defaults?.stepPlanes ??
        []) as readonly {
        step: number;
        hand: "left" | "right";
        plane: DirectiveValue<Plane>;
      }[];
      // convertSceneBeatTimes has already turned every cue name into the
      // count it stands for, so these steps are numbers by the time the
      // resolver sees them (gap 15).
      return resolveStepPlanesForPerformer(
        entries,
        performerIds[index]!,
        scene.id,
        filmSeed,
        seedSceneId
      );
    }
  );

  // Same replace-not-merge rule as stepPlanes above: naming a performer's
  // steps is dictation, not an addition to what the cast shares.
  const resolvedStepEffects: ResolvedDirectorStepEffect[][] = rawInputs.map(
    (input, index) =>
      resolveStepEffectsForPerformer(
        (input.stepEffects ?? cast?.defaults?.stepEffects ?? []) as readonly {
          step: number;
          effect: DirectiveValue<string>;
        }[],
        performerIds[index]!,
        scene.id,
        filmSeed,
        seedSceneId
      )
  );
  const resolvedStepEfforts: ResolvedDirectorStepEffort[][] = rawInputs.map(
    (input, index) =>
      resolveStepEffortsForPerformer(
        (input.stepEfforts ?? cast?.defaults?.stepEfforts ?? []) as readonly {
          step: number;
          effort: DirectiveValue<EffortId>;
        }[],
        performerIds[index]!,
        scene.id,
        filmSeed,
        seedSceneId
      )
  );
  const resolvedStepStaffLengths: ResolvedDirectorStepStaffLength[][] =
    rawInputs.map((input, index) =>
      resolveStepStaffLengthsForPerformer(
        (input.stepStaffLengths ??
          cast?.defaults?.stepStaffLengths ??
          []) as readonly {
          step: number;
          staffLengthCm: number;
          ease?: "cut" | "linear";
        }[],
        performerIds[index]!,
        scene.id
      )
    );
  const resolvedHolds: ResolvedDirectorHold[][] = rawInputs.map(
    (input, index) =>
      resolveHoldsForPerformer(
        (input.holds ?? cast?.defaults?.holds ?? []) as readonly {
          fromStep: number;
          steps: number;
          progress?: number;
        }[],
        performerIds[index]!,
        scene.id
      )
  );

  // Sequences resolve as literals, not through resolveCastAxis: the derived
  // forms name one specific performer, so there is no catalog to pick from.
  // The derived graph is validated exactly one level deep — a sequence derived
  // from a derived one has no original of its own to change, and letting it
  // resolve would silently hand both performers the same result.
  const resolvedSequences: DirectorPerformerSequence[] = rawInputs.map(
    (input, index) => {
      const sequence =
        input.sequence ?? cast?.defaults?.sequence ?? { source: "demo" };
      // Gap 20. A level ramp is a cast-wide statement, so it is spent here,
      // where the performer's place in the cast is known, and the sequence
      // that leaves this map carries the plain level it resolved to.
      const level = (sequence as { level?: unknown }).level;
      if (typeof level !== "object" || level === null) return sequence;
      const { ramp } = level as { ramp: { from: number; to: number } };
      return {
        ...sequence,
        level: rampedSequenceLevel(ramp, index, rawInputs.length),
      } as DirectorPerformerSequence;
    }
  );
  resolvedSequences.forEach((sequence, index) => {
    const self = performerIds[index]!;
    assertSequenceDirective(
      sequence,
      `Scene "${scene.id}", performer "${self}"`
    );
    const sourceId = transformSourceId(sequence);
    if (sourceId === null) return;
    const verb = "mirrorOf" in sequence ? "mirror" : "transform";
    if (sourceId === self) {
      throw new Error(
        `Scene "${scene.id}": performer "${self}" cannot ${verb} themselves.`
      );
    }
    const targetIndex = performerIds.indexOf(sourceId);
    if (targetIndex < 0) {
      throw new Error(
        `Scene "${scene.id}": performer "${self}" ${verb}s "${sourceId}", who is not in this scene.`
      );
    }
    if (transformSourceId(resolvedSequences[targetIndex]!) !== null) {
      throw new Error(
        `Scene "${scene.id}": performer "${self}" ${verb}s "${sourceId}", whose sequence is already derived from another performer's. Derive from the original instead.`
      );
    }
  });

  const resolvedFields: ResolvedPerformerFields[] = rawInputs.map(
    (input, index) => ({
      id: performerIds[index]!,
      name: input.name,
      characterId: resolvedCharacterIds[index]! as CharacterId,
      prop: resolvedProps[index]!,
      // Absent, not an empty object: a performer who takes the scene's build
      // unchanged says nothing about it (gap 23).
      ...(input.propBuild ?? cast?.defaults?.propBuild
        ? { propBuild: input.propBuild ?? cast!.defaults!.propBuild! }
        : {}),
      ...(input.gridJoin !== undefined ? { gridJoin: input.gridJoin } : {}),
      effect: resolvedEffects[index]! as EffectType,
      ...(resolvedHandEffects[index]
        ? { handEffects: resolvedHandEffects[index]! }
        : {}),
      effort: resolvedEfforts[index]!,
      sequence: resolvedSequences[index]!,
      position: input.position,
      facingDegrees: input.facingDegrees,
      blocking: input.blocking ?? cast?.defaults?.blocking,
      beatOffset: spreadBeatOffset(
        input.beatOffset ?? cast?.defaults?.beatOffset,
        index
      ),
      staffLengthCm: resolvedStaffLengths[index]!,
      leftPlane: resolvedLeftPlanes[index]!,
      rightPlane: resolvedRightPlanes[index]!,
      stepPlanes: resolvedStepPlanes[index]!,
      stepEffects: resolvedStepEffects[index]!,
      stepEfforts: resolvedStepEfforts[index]!,
      stepStaffLengths: resolvedStepStaffLengths[index]!,
      holds: resolvedHolds[index]!,
    })
  );

  const environmentId = resolveSceneDirective<SceneEnvironmentId>(
    scene.location?.environmentId,
    "environmentId",
    () => contextualEnvironmentFromEffects(resolvedFields.map((f) => f.effect)),
    scene.id,
    filmSeed,
    ENVIRONMENT_CATALOG,
    seedSceneId
  );

  const performerCount = resolvedFields.length;
  const formationCatalog = FORMATION_CATALOG.filter((preset) =>
    PRESET_VALID_COUNTS[preset].includes(performerCount)
  );
  const formation = resolveSceneDirective<FormationPreset>(
    scene.performance?.formation,
    "formation",
    () => defaultFormation(performerCount),
    scene.id,
    filmSeed,
    formationCatalog,
    seedSceneId
  );

  const performers = buildResolvedPerformers(
    resolvedFields,
    formation,
    durationSeconds,
    scene.performance?.blocking,
    scene.id
  );

  const showStage = scene.location?.showStage ?? false;
  const showAudience = scene.location?.showAudience ?? false;
  const visiblePlanes = scene.location?.visiblePlanes ?? [];
  const sceneFeatures = {
    environment: true,
    stage: showStage,
    audience: showAudience,
    campfire: false,
    tent: false,
    ...(scene.location?.sceneFeatures ?? {}),
  };
  const effectPresets = resolveEffectPresets(
    scene.effectPresets ?? {},
    scene.id,
    filmSeed,
    seedSceneId
  );
  const effectOverrides = { ...(scene.effectOverrides ?? {}) };
  validateEffectOverrides(effectOverrides);

  const rendererKey = getSceneEnvironmentRendererKey(environmentId);
  const groundOffset = getStageCoordinateFrame(
    rendererKey,
    showStage
  ).performerAnchorY;
  const stageZOffset = getPerformerStageBounds(
    performers.map((performer) => performer.position)
  ).zOffset;
  const cameraTrack = resolveDirectorCameraTrack(scene.camera, {
    durationSeconds,
    aspectRatio,
    groundOffset,
    formation,
    sceneId: scene.id,
    filmSeed,
    performers: performers.map((performer) => ({
      ...performer,
      position: {
        ...performer.position,
        z: performer.position.z + stageZOffset,
      },
    })),
  });

  // A cut is instantaneous by definition: it has no window to dissolve over.
  // Only a stated duration can give one a length.
  const transitionKind =
    scene.transition?.kind ?? (sceneIndex === 0 ? "cut" : "environment-dissolve");

  return {
    id: scene.id,
    title: scene.title,
    intent: scene.intent ?? null,
    // Spread for the same reason as the two below: a film that states no
    // category carries no key and resolves exactly as it did before.
    ...(scene.category === undefined ? {} : { category: scene.category }),
    // Gaps 13 and 14. Spread so an unrelated scene carries neither key and
    // resolves exactly as it did before round 2.
    ...(scene.extends === undefined ? {} : { extends: scene.extends }),
    ...(scene.seedAs === undefined ? {} : { seedSource: scene.seedAs }),
    startSeconds,
    durationSeconds,
    transition: {
      kind: transitionKind,
      durationSeconds:
        scene.transition?.durationSeconds ??
        (sceneIndex === 0 || transitionKind === "cut" ? 0 : 0.8),
    },
    location: {
      environmentId,
      showStage,
      showAudience,
      sceneFeatures,
      visiblePlanes,
    },
    performance: {
      bpm,
      // Gap 16. "continue" hands this scene the count the last one ended on,
      // so a tempo change reads as the same phrase getting faster rather than
      // the phrase starting over. Absent when the scene restarts, which is
      // every scene written before this word existed.
      ...(rawScene.performance?.phrase === "continue"
        ? { stepOffset: startStep }
        : {}),
      sequence: {
        source: "demo",
        loop: scene.performance?.sequence?.loop ?? true,
      },
      formation,
      performers,
      stageExtent: collectStageExtent(performers),
    },
    effectPresets,
    effectOverrides,
    camera: cameraTrack,
  };
}

/**
 * Blocking segments are straight lines between keyframes, so the keyframes
 * themselves bound the whole scene's travel — no sampling needed.
 */
function collectStageExtent(
  performers: readonly ResolvedDirectorPerformer[]
): { x: number; z: number }[] {
  // Gap 21. An empty stage still needs ground under the camera, so the origin
  // stands in for the marks nobody reaches.
  if (performers.length === 0) return [{ x: 0, z: 0 }];
  return performers.flatMap((performer) => [
    { ...performer.position },
    ...performer.blocking.map((keyframe) => ({ ...keyframe.position })),
  ]);
}

export function resolveFilmDirectorSpec(
  untrustedInput: FilmDirectorInput | unknown
): ResolvedFilmDirectorSpec {
  const input = FilmDirectorInputSchema.parse(untrustedInput);
  const format = {
    width: input.format?.width ?? 1920,
    height: input.format?.height ?? 1080,
    fps: input.format?.fps ?? 30,
  };
  const aspectRatio = format.width / format.height;
  const filmSeed = resolveFilmSeed(input.id, input.seed);
  const seenSceneIds = new Set<string>();
  let cursorSeconds = 0;
  // Where the shared count stood when the previous scene ended. A scene that
  // restarts still advances it, so the scene after a restart can continue from
  // a real number rather than from zero.
  let cursorStep = 0;

  const scenes = input.scenes.map((scene, index) => {
    if (seenSceneIds.has(scene.id))
      throw new Error(`Scene id "${scene.id}" is duplicated.`);
    seenSceneIds.add(scene.id);
    if (scene.performance?.phrase === "continue" && index === 0) {
      throw new Error(
        `Scene "${scene.id}" continues the previous phrase, but it opens the film and there is no previous phrase to continue.`
      );
    }
    const resolved = resolveScene(
      scene,
      index,
      cursorSeconds,
      cursorStep,
      aspectRatio,
      filmSeed
    );
    cursorSeconds += resolved.durationSeconds;
    cursorStep =
      (resolved.performance.stepOffset ?? 0) +
      (resolved.durationSeconds * resolved.performance.bpm) / 60;
    return resolved;
  });

  return {
    version: input.version,
    id: input.id,
    title: input.title,
    brief: input.brief ?? null,
    format,
    playback: {
      loop: input.playback?.loop ?? true,
      autoplay: input.playback?.autoplay ?? true,
    },
    scenes,
    durationSeconds: cursorSeconds,
  };
}
