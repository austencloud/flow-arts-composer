import { z } from "zod";
import { Plane, type FormationPreset } from "@austencloud/scene-3d";
import type { CharacterId } from "$lib/shared/3d/domain/character-model";

import { EFFECTS } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
import type { EffectType } from "$lib/shared/effects/domain/effects-config";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import {
  isSceneEnvironmentId,
  type SceneEnvironmentId,
} from "$lib/shared/3d/environments/domain/scene-environment";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  CAMERA_CHANNEL_IDS,
  type CameraChannelId,
} from "./director-camera-channels";
import { directiveSchema } from "$lib/features/film-director/domain/directives";
import { normalizeFilmDirectorInput } from "./normalize-film-director-input";
import type { ResolvedDirectorBlockingKeyframe } from "./blocking-language";
import {
  DIRECTOR_CONTINUITIES,
  DIRECTOR_LOOP_PERIODS,
  DIRECTOR_MOTION_TYPE_FILTERS,
  DIRECTOR_ORIENTATIONS,
  DIRECTOR_PLACEMENT_GROUPS,
  DIRECTOR_ROTATION_DEGREES,
  DIRECTOR_SEQUENCE_LEVELS,
  type DirectorPerformerSequence,
} from "./sequence-language";

export const FILM_DIRECTOR_SCHEMA_VERSION_1 = 1 as const;
export const FILM_DIRECTOR_SCHEMA_VERSION_2 = 2 as const;
export const FILM_DIRECTOR_SCHEMA_VERSION_3 = 3 as const;
export const FILM_DIRECTOR_SCHEMA_VERSION_4 = 4 as const;
export const FILM_DIRECTOR_SCHEMA_VERSION_5 = 5 as const;
export const FILM_DIRECTOR_SCHEMA_VERSION = FILM_DIRECTOR_SCHEMA_VERSION_5;

export const FILM_DIRECTOR_DIRECTIVE_AXES = [
  "characterId",
  "prop",
  "effect",
  "effort",
  "staffLengthCm",
  "environmentId",
  "formation",
  "leftPlane",
  "rightPlane",
  "stepPlane",
  "stepEffect",
  "stepEffort",
] as const;

const seedSchema = z
  .object({
    base: z.number().int().optional(),
    axes: z.record(z.string(), z.number().int()).optional(),
  })
  .strict();

function normalizeLegacyHandPair(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const input = value as Record<string, unknown>;
  const normalized = { ...input };
  for (const [legacy, canonical] of [
    ["blue", "left"],
    ["red", "right"],
  ] as const) {
    if (legacy in normalized && canonical in normalized) return value;
    if (legacy in normalized) {
      normalized[canonical] = normalized[legacy];
      delete normalized[legacy];
    }
  }
  return normalized;
}

export const DIRECTOR_EFFORT_IDS = [
  "linear",
  "glide",
  "dab",
  "press",
  "punch",
  "elastic",
  "bounce",
  "anticipation",
] as const satisfies readonly EffortId[];

export const DIRECTOR_FORMATIONS = [
  "solo",
  "grid-2x2",
  "line",
  "circle",
  "v-shape",
  "diagonal",
  "tunnel-stack",
  "back-to-back",
  "facing-each-other",
  "stage-lr",
  "side-by-side",
  "custom",
] as const satisfies readonly FormationPreset[];

// Named so an unknown literal names the offending value in its rejection
// message. Built as string+refine, not z.enum/z.nativeEnum: these schemas
// are always used inside directiveSchema()'s union (literal | pick | oneOf |
// not | sameAs). An enum's invalid_value check fails at the same shallow
// "wrong shape" tier as the object-shaped branches, so zod's union can't
// tell which branch the director meant and falls back to the generic
// "Expected a literal value or a directive object" message — hiding the
// offending value entirely. A string schema passes trivially, so the
// refine's failure is the one branch that went deeper, and zod surfaces
// that refine's own message directly. Matches effectIdSchema/
// environmentIdSchema below, which already use this shape for the same
// reason.
const effortIdSchema = z
  .string()
  .refine(
    (value): value is (typeof DIRECTOR_EFFORT_IDS)[number] =>
      (DIRECTOR_EFFORT_IDS as readonly string[]).includes(value),
    { error: (issue) => `Unknown effort "${String(issue.input)}"` }
  );
const formationIdSchema = z
  .string()
  .refine(
    (value): value is (typeof DIRECTOR_FORMATIONS)[number] =>
      (DIRECTOR_FORMATIONS as readonly string[]).includes(value),
    { error: (issue) => `Unknown formation "${String(issue.input)}"` }
  );

export const DIRECTOR_CAMERA_PRESETS = [
  "front-lockoff",
  "three-quarter",
  "hero-dolly-in",
  "high-reveal",
  "group-orbit",
  "custom",
] as const;

export const DIRECTOR_INTERPOLATIONS = ["step", "linear", "smooth"] as const;
export const DIRECTOR_EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const;

const finiteNumber = z.number().finite();

/**
 * Every duration in this schema has a `durationBeats` twin, because a director
 * counts music rather than reading a stopwatch. Stating both units on one
 * field is a contradiction, not a preference — the converter would have to
 * pick a winner, and either choice silently discards what the director wrote.
 *
 * Two-layer validity contract for every `durationBeats`/`atBeats` field: this
 * schema only bounds beats SYNTACTICALLY (e.g. scene durationBeats is
 * positive and capped at 240, transition durationBeats at 32) — those caps
 * are generous enough to admit values that convert to an out-of-range
 * seconds figure at a slow bpm. The REAL bound (converted seconds within the
 * scene's 1-60s window, the transition's 0-3s window) is enforced at resolve
 * time by `convertSceneBeatTimes` (director-beat-times.ts), once the scene's
 * bpm is known. `schema.parse` succeeding is therefore necessary but not
 * sufficient for a beats-stated field to be valid — resolution can still
 * reject it.
 *
 * Named `atMostOneTimeUnit` (not `exactlyOne`) because both fields are
 * optional-with-a-computed-default: stating neither is fine (something else
 * supplies the duration), only stating BOTH is the contradiction. This is the
 * opposite of `cameraKeyframeSchema`'s inline `atSeconds`/`atBeats` check
 * further below, which requires EXACTLY one — a keyframe has no default
 * clock, so stating neither is just as invalid as stating both.
 */
const atMostOneTimeUnit = (
  value: {
    durationSeconds?: number;
    durationBeats?: number;
    durationBars?: number;
  },
  ctx: z.RefinementCtx
) => {
  const stated = [
    value.durationSeconds !== undefined,
    value.durationBeats !== undefined,
    value.durationBars !== undefined,
  ].filter(Boolean).length;
  if (stated > 1) {
    ctx.addIssue({
      code: "custom",
      message:
        'State exactly one of "durationSeconds", "durationBeats", or "durationBars".',
    });
  }
};

/**
 * Gap 15. A cue is a named moment in scene time, so "until the drop" is a
 * fourth way of stating how long something runs and contradicts the other
 * three exactly as they contradict each other.
 */
const atMostOneMoveLength = (
  value: {
    durationSeconds?: number;
    durationBeats?: number;
    durationBars?: number;
    until?: string;
  },
  ctx: z.RefinementCtx
) => {
  const stated = [
    value.durationSeconds !== undefined,
    value.durationBeats !== undefined,
    value.durationBars !== undefined,
    value.until !== undefined,
  ].filter(Boolean).length;
  if (stated > 1) {
    ctx.addIssue({
      code: "custom",
      message:
        'State exactly one of "durationSeconds", "durationBeats", "durationBars", or "until".',
    });
  }
};

/**
 * Gap 15. Cue names. Lowercase words joined by hyphens, always opening with a
 * letter, which is what keeps a cue name from ever being read as a number:
 * every field that accepts a cue also accepts a step or a count, and "4" must
 * mean the count four in both spellings.
 */
const CUE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const CUE_NAME_MESSAGE =
  'A cue name is lowercase letters, digits and hyphens, starting with a letter, like "drop" or "chorus-2".';
const cueNameSchema = z
  .string()
  .refine((value) => CUE_NAME_PATTERN.test(value), {
    error: () => CUE_NAME_MESSAGE,
  });

/** One named moment in scene time, stated in any of the three clocks. */
const cueSchema = z.union(
  [
    z.object({ atSeconds: finiteNumber.nonnegative() }).strict(),
    z.object({ atBeats: finiteNumber.nonnegative() }).strict(),
    z.object({ atBars: finiteNumber.nonnegative() }).strict(),
  ],
  {
    error:
      'A cue is a moment: {atSeconds}, {atBeats}, or {atBars}.',
  }
);

export const MAX_SCENE_CUES = 16;

/**
 * Gap 15. Wherever a whole count is spoken, the name of a cue is spoken
 * instead. `convertSceneBeatTimes` resolves it to that count before anything
 * downstream reads the list, so no resolver learns cues exist.
 */
const stepRefSchema = z.union([z.number().int().min(0), cueNameSchema], {
  error: 'A step is a whole count or the name of a cue.',
});

/**
 * Gap 22. Bars are the unit a director actually counts off, and they are just
 * beats multiplied by the scene's meter, so every field that accepts beats
 * accepts bars on the same terms: syntactic bounds here, the real seconds
 * bound at resolve time. The caps are the beats caps divided by the smallest
 * meter, which keeps a bars figure from parsing when its beats twin could not.
 */
const durationBarsField = finiteNumber.positive().optional();

const vector3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const position2Schema = z.object({ x: finiteNumber, z: finiteNumber }).strict();

const environmentIdSchema = z.string().refine(isSceneEnvironmentId, {
  error: (issue) => `Unknown 3D environment "${String(issue.input)}"`,
});
const characterIdSchema = z.string().min(1);
const PROP_TYPE_VALUES = new Set<string>(Object.values(PropType));
// string+refine, not z.nativeEnum — see the comment above effortIdSchema for
// why: it lets the refine's own message surface through directiveSchema()'s
// union instead of the generic "expected literal or directive object" text.
const propTypeSchema = z
  .string()
  .refine((value): value is PropType => PROP_TYPE_VALUES.has(value), {
    error: (issue) => `Unknown prop "${String(issue.input)}"`,
  });
const effectIdSchema = z
  .string()
  .refine(
    (value) =>
      value === "none" || EFFECTS.some((effect) => effect.id === value),
    { error: (issue) => `Unknown effect "${String(issue.input)}"` }
  );
const configurableEffectIdSchema = z
  .string()
  .refine((value) => EFFECTS.some((effect) => effect.id === value), {
    error: (issue) => `Unknown configurable effect "${String(issue.input)}"`,
  });

/**
 * Gap 23. Which build of the prop this performer carries. The keys are the
 * package's own `PropBuild` (`prop-finish-state.svelte.ts`), enumerated here
 * rather than passed through, so a misspelled key rejects by name instead of
 * arriving at `setPropBuild` and doing nothing.
 *
 * `finish` belongs here and not to the scene: the package's `propFinishState`
 * is a global singleton, but a performer's `propBuild` is merged over it
 * (`character-instance-state.svelte.ts` `effectivePropBuild`), so the fire
 * triad and the day triad can stand next to each other.
 */
const propBuildSchema = z
  .object({
    finish: z.enum(["fire", "day"]).optional(),
    fanBuild: z.enum(["pictograph", "fire", "lotus", "day", "moon"]).optional(),
    fanFrameColor: z.enum(["black", "white"]).optional(),
    fanCover: z.enum(["bare", "covered"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    error: 'A "propBuild" states at least one of the build\'s parts.',
  });

// Derived from the live enum, never retyped — see the comment above
// effortIdSchema for why this is string+refine (with a type-predicate to
// still narrow the inferred type to Plane) rather than z.enum/z.nativeEnum.
// Unlike the other axis catalogs, an unknown plane also lists the full
// catalog in its message: there is no "closest" plane the way there's an
// obvious closest prop, so directors are more likely to need the full list.
const PLANE_VALUES = Object.values(Plane) as Plane[];
const planeSchema = z
  .string()
  .refine(
    (value): value is Plane =>
      (PLANE_VALUES as readonly string[]).includes(value),
    {
      error: (issue) =>
        `Unknown plane "${String(issue.input)}". Planes: ${PLANE_VALUES.join(", ")}.`,
    }
  );

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

const visiblePlanesSchema = z
  .array(planeSchema)
  .refine((values) => firstDuplicate(values) === undefined, {
    error: (issue) =>
      `scene.visiblePlanes lists "${firstDuplicate(issue.input as readonly string[])}" twice.`,
  });

// Per-step plane overrides are a scene-scope directive (literal, pick:any,
// oneOf, not) resolved by resolveSceneDirective in
// resolve-film-director-spec.ts — distinct/sameAs make no sense pinned to a
// single (performer, step, hand) triple, same reasoning as environmentId
// and formation.
const handSideSchema = z.preprocess(
  (value) => (value === "blue" ? "left" : value === "red" ? "right" : value),
  z.enum(["left", "right"])
);

const stepPlaneEntrySchema = z
  .object({
    step: stepRefSchema,
    hand: handSideSchema,
    plane: directiveSchema(planeSchema),
  })
  .strict();

/**
 * Gap 26. An effect is spoken once for both hands, or once per hand. The pair
 * form keeps the full directive grammar on each side, so "fire on her right,
 * anything on her left" is one sentence. A single id is not shorthand for a
 * pair of the same id: it stays the whole-performer form and reaches the
 * renderer through the wildcard tip key exactly as it always has.
 */
const effectValueSchema = z.union([
  directiveSchema(effectIdSchema),
  z
    .object({
      left: directiveSchema(effectIdSchema),
      right: directiveSchema(effectIdSchema),
    })
    .strict(),
]);

// Per-step effect and effort are scene-scope directives for the same reason
// stepPlanes is: the value is pinned to one (performer, step) pair, so
// distinct has no cast to spread across and sameAs has no matching pair to
// copy from. Unlike an effort, an effect may name a hand (gap 26), because the
// renderer resolves effects per prop and a director asks for a lit right hand.
const stepEffectEntrySchema = z
  .object({
    step: stepRefSchema,
    effect: effectValueSchema,
  })
  .strict();

const stepEffortEntrySchema = z
  .object({
    step: stepRefSchema,
    effort: directiveSchema(effortIdSchema),
  })
  .strict();

/**
 * Gap 17. A prop that grows or shrinks while the phrase runs. Literal only,
 * unlike the whole-scene `staffLengthCm` above: a length has no catalog, and
 * the whole point of the list is the shape of the ramp, which a random draw
 * per entry would destroy.
 *
 * `ease` says how the value gets from the previous entry to this one:
 * "linear" (the default) grows continuously across the counts between them,
 * "cut" holds the previous length and changes on this entry's count.
 */
const stepStaffLengthEntrySchema = z
  .object({
    step: stepRefSchema,
    staffLengthCm: finiteNumber.min(40).max(300),
    ease: z.enum(["cut", "linear"]).optional(),
  })
  .strict();

/**
 * Time stops for one performer's prop phrase. Literal only: a hold is a
 * statement about this performer's clock, and there is no catalog of holds to
 * draw one from. `fromStep` is where the phrase freezes; `steps` is how long
 * it stays frozen, in the same counts the rest of the cast keeps dancing.
 * Overlap is checked at resolve time, where the scene and performer are known
 * and the rejection can name them.
 */
const holdSchema = z
  .object({
    fromStep: stepRefSchema,
    steps: z.number().int().min(1, { error: "A hold lasts at least one step." }),
    /**
     * Gap 19. Where inside the frozen count the pose sits. A hold freezes at
     * the top of `fromStep` by default, which is the pose the step opens on;
     * 0.5 freezes it halfway through the step instead, which is where a shape
     * a director actually wants to look at usually lives.
     */
    progress: finiteNumber.min(0).max(1).optional(),
  })
  .strict();

const cameraTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("group") }).strict(),
  z
    .object({
      kind: z.literal("performer"),
      performerId: z.string().min(1),
      height: finiteNumber.optional(),
      // Keep this performer in frame while they walk. `true` aims: the camera
      // stays put and turns its target with the walker. "follow" travels:
      // camera and target both move with them, holding the framing constant.
      // Only meaningful on `subject` — see the cameraSchema refine below.
      track: z.union([z.literal(true), z.literal("follow")]).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("point"), position: vector3Schema }).strict(),
  /**
   * Gap 12. Frame the hand, or the end of the prop it holds, rather than the
   * whole person. Both aim at the named performer's mark and differ only in
   * height: a hand rides about chest high, a prop tip about a staff's reach
   * above the floor. `hand` names the side, in the same left/right the planes
   * and the per-hand effects use.
   *
   * The aim is the opening mark, not the live hand. The rig publishes hand
   * world positions into PerformerRig's effects snippet and nothing carries
   * them back to `Viewer3DState`, so the adapter has nothing to re-aim from.
   * The capability matrix records that boundary.
   */
  z
    .object({
      kind: z.literal("hand"),
      performerId: z.string().min(1),
      hand: handSideSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("prop-tip"),
      performerId: z.string().min(1),
      hand: handSideSchema,
    })
    .strict(),
]);

const cameraKeyframeSchema = z
  .object({
    // Unlike every `durationSeconds`/`durationBeats` pair guarded by
    // `atMostOneTimeUnit` above, a keyframe has no computed-default clock —
    // stating NEITHER unit is just as invalid as stating both, checked
    // inline just below rather than reusing that helper.
    atSeconds: finiteNumber.nonnegative().optional(),
    atBeats: finiteNumber.nonnegative().optional(),
    atBars: finiteNumber.nonnegative().optional(),
    /** Gap 15. The name of a cue, which is a fourth way of saying when. */
    at: cueNameSchema.optional(),
    position: vector3Schema,
    target: cameraTargetSchema.optional(),
    fovDeg: finiteNumber.min(20).max(100).optional(),
    rollDeg: finiteNumber.min(-180).max(180).optional(),
    interpolation: z.enum(DIRECTOR_INTERPOLATIONS).optional(),
    easing: z.enum(DIRECTOR_EASINGS).optional(),
  })
  .strict()
  .superRefine((frame, ctx) => {
    const stated = [
      frame.atSeconds !== undefined,
      frame.atBeats !== undefined,
      frame.atBars !== undefined,
      frame.at !== undefined,
    ].filter(Boolean).length;
    if (stated !== 1) {
      ctx.addIssue({
        code: "custom",
        message:
          'A camera keyframe states exactly one of "atSeconds", "atBeats", "atBars", or "at".',
      });
    }
  });

const placementRefSchema = z.union(
  [
    z.string().min(1),
    z.preprocess(
      normalizeLegacyHandPair,
      z.object({ left: z.string().min(1), right: z.string().min(1) }).strict()
    ),
    z
      .object({
        group: z.enum(DIRECTOR_PLACEMENT_GROUPS),
        location: z.string().min(1),
      })
      .strict(),
  ],
  {
    error:
      'A position is a name like "beta5", a {blue, red} location pair, or a {group, location} like {group: "beta", location: "south"}.',
  }
);

const turnValueSchema = z.union([finiteNumber, z.literal("fl")]);
const turnLaneSchema = z.union([
  turnValueSchema,
  z.array(turnValueSchema).min(1).max(32),
]);
const turnsSchema = z.union(
  [
    turnLaneSchema,
    z.preprocess(
      normalizeLegacyHandPair,
      z
        .object({
          left: turnLaneSchema.optional(),
          right: turnLaneSchema.optional(),
        })
        .strict()
        .refine(
          (lanes) => lanes.left !== undefined || lanes.right !== undefined,
          {
            message: "A per-hand turn figure names left, right, or both.",
          }
        )
    ),
    z.object({ intensity: finiteNumber }).strict(),
  ],
  {
    error:
      'Turns are one value (a number or "fl"), a repeating figure of them, {blue, red} for per-hand figures, or {intensity} to roll at random.',
  }
);

const orientationSchema = z.enum(DIRECTOR_ORIENTATIONS);
const startOrientationSchema = z.union([
  orientationSchema,
  z.preprocess(
    normalizeLegacyHandPair,
    z
      .object({
        left: orientationSchema.optional(),
        right: orientationSchema.optional(),
      })
      .strict()
      .refine(
        (hands) => hands.left !== undefined || hands.right !== undefined,
        {
          message: "A per-hand start orientation names left, right, or both.",
        }
      )
  ),
]);

const loopSchema = z.union([
  z.enum(LOOPType),
  z
    .object({
      type: z.enum(LOOPType),
      period: z.enum(DIRECTOR_LOOP_PERIODS).optional(),
    })
    .strict(),
]);

const transformHandSchema = z.enum(["left", "right", "both"]);

/**
 * One operation in a `transforms` chain. Each branch is strict, so a `hand` on
 * `swap-hands` (which has no per-hand form) is named rather than ignored.
 */
const sequenceTransformSchema = z.discriminatedUnion("op", [
  z
    .object({ op: z.literal("mirror"), hand: transformHandSchema.optional() })
    .strict(),
  z
    .object({ op: z.literal("flip"), hand: transformHandSchema.optional() })
    .strict(),
  z
    .object({
      op: z.literal("rotate"),
      degrees: z.literal(DIRECTOR_ROTATION_DEGREES, {
        error:
          "A sequence rotates in 45-degree steps: 45, 90, 135, 180, 225, 270, or 315.",
      }),
      direction: z.enum(["cw", "ccw"]),
      hand: transformHandSchema.optional(),
    })
    .strict(),
  z.object({ op: z.literal("swap-hands") }).strict(),
  z
    .object({ op: z.literal("invert"), hand: transformHandSchema.optional() })
    .strict(),
  z
    .object({ op: z.literal("rewind"), hand: transformHandSchema.optional() })
    .strict(),
  z
    .object({
      op: z.literal("start-at"),
      step: z
        .number()
        .int()
        .min(2, {
          error:
            "A sequence already starts at step 1. Name a later step to start from.",
        })
        .max(64),
    })
    .strict(),
]);

const SEQUENCE_SOURCE_KEYS = [
  "source",
  "mirrorOf",
  "transformOf",
  "library",
  "word",
  "length",
] as const;
const SEQUENCE_CONTROL_KEYS = [
  "startPlacement",
  "startOrientation",
  "turns",
  "level",
  "gridMode",
  "flow",
  "handPath",
  "motionTypes",
  "loop",
  "mustContain",
  "mustNotContain",
  "endPlacement",
] as const;

const quoted = (keys: readonly string[]) =>
  keys.map((key) => `"${key}"`).join(", ");

/**
 * What one performer spins. `demo` is the film's shared sequence, `word` and
 * `length` generate a new one through the same pipeline the Create module
 * uses, `mirrorOf` reflects another performer's sequence across the
 * north-south axis, `transformOf` plus `transforms` applies any chain of the
 * Actions-panel transforms to another performer's sequence, and `library`
 * plays a saved public sequence by its id. Deliberately not directive axes:
 * "mirror her" names one specific performer, and a library id is a literal
 * reference, so a random pick would have nothing to mean.
 *
 * One flat object rather than a union of four, because a union reports every
 * branch's failure at once: a misspelled `flow` would arrive buried under
 * three irrelevant complaints about the branches that wanted a different
 * source key. Exactly-one-source is a refinement instead, which leaves every
 * other field free to fail in its own name. The grammar and its meaning live
 * in `sequence-language.ts`.
 */
const performerSequenceSchema = z
  .object({
    source: z.enum(["demo", "none"]).optional(),
    mirrorOf: z.string().min(1).optional(),
    transformOf: z.string().min(1).optional(),
    transforms: z
      .array(sequenceTransformSchema)
      .min(1, { error: 'A "transforms" list needs at least one operation.' })
      .max(8)
      .optional(),
    library: z.string().min(1).optional(),
    word: z.string().min(1).max(24).optional(),
    length: z.number().int().min(1).max(64).optional(),
    startPlacement: placementRefSchema.optional(),
    startOrientation: startOrientationSchema.optional(),
    turns: turnsSchema.optional(),
    /**
     * Gap 20. One level for whoever reads this sequence, or a ramp across the
     * cast: `{ramp: {from, to}}` hands the first performer `from`, the last
     * `to`, and everyone between a rounded step along that line. A ramp is a
     * statement about a cast, so it is only sayable in cast defaults; on one
     * performer it is rejected by name.
     */
    level: z
      .union([
        z.literal(DIRECTOR_SEQUENCE_LEVELS),
        z
          .object({
            ramp: z
              .object({
                from: z.literal(DIRECTOR_SEQUENCE_LEVELS),
                to: z.literal(DIRECTOR_SEQUENCE_LEVELS),
              })
              .strict(),
          })
          .strict(),
      ])
      .optional(),
    gridMode: z.enum(GridMode).optional(),
    flow: z.enum(DIRECTOR_CONTINUITIES).optional(),
    handPath: z.enum(DIRECTOR_CONTINUITIES).optional(),
    motionTypes: z.enum(DIRECTOR_MOTION_TYPE_FILTERS).optional(),
    loop: loopSchema.optional(),
    mustContain: z.array(z.string().min(1)).min(1).max(24).optional(),
    mustNotContain: z.array(z.string().min(1)).min(1).max(24).optional(),
    endPlacement: z
      .union([placementRefSchema, z.array(placementRefSchema).min(1).max(16)])
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const named = SEQUENCE_SOURCE_KEYS.filter(
      (key) => value[key] !== undefined
    );
    if (named.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          'A sequence names one source: {source: "demo"}, {source: "none"} to stand and watch, a "word" to spell, a "length" to improvise, a "mirrorOf" to reflect, a "transformOf" to change, or a "library" id to play.',
      });
      return;
    }
    if (named.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: `A sequence names one source, but this one names ${quoted(named)}.`,
      });
      return;
    }
    if (named[0] === "transformOf" && value.transforms === undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          '"transformOf" names whose sequence to change; "transforms" says what changes. Add a "transforms" list.',
      });
      return;
    }
    if (named[0] !== "transformOf" && value.transforms !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          '"transforms" only means something on a "transformOf" sequence. Name the performer to transform, or remove the list.',
      });
      return;
    }
    if (named[0] === "word" || named[0] === "length") return;

    const controls = SEQUENCE_CONTROL_KEYS.filter(
      (key) => value[key] !== undefined
    );
    if (controls.length === 0) return;
    // `source` covers two spellings under one key, so it branches on the
    // value while the rest branch on the key.
    const sourceRejection =
      value.source === "none"
        ? `A performer who stands and watches is not spinning anything, so there is nothing for ${quoted(controls)} to shape. Remove it, or give them a "word" of their own.`
        : `The demo sequence is the film's shared one, so it carries no controls of its own. Remove ${quoted(controls)}, or spell a "word" of your own.`;
    const CONTROL_REJECTIONS: Record<string, string> = {
      mirrorOf: `A mirror reflects another performer's sequence exactly, so it carries no controls of its own. Move ${quoted(controls)} to the performer being mirrored.`,
      transformOf: `A transformed sequence is another performer's sequence changed in a stated way, so it carries no controls of its own. Move ${quoted(controls)} to the performer being transformed.`,
      library: `A library sequence is already finished, so it carries no controls of its own. Remove ${quoted(controls)}, or spell a "word" of your own.`,
      source: sourceRejection,
    };
    ctx.addIssue({ code: "custom", message: CONTROL_REJECTIONS[named[0]!]! });
  })
  // The refinement above is the proof that exactly one source key is present,
  // which is what makes the narrower union type true.
  .transform((value) => value as DirectorPerformerSequence);

export type { DirectorPerformerSequence };

/**
 * One blocking move. `direction` is the performer's own left/right/forward/
 * back; `to` names a world point instead. The grammar and its defaults live in
 * `blocking-language.ts`.
 */
const blockingMoveSchema = z
  .object({
    move: z.enum(["stand", "walk", "turn", "run"]),
    to: position2Schema.optional(),
    along: z
      .object({
        arc: z.enum(["left", "right"]),
        // Sagitta as a fraction of the chord: 0.5 is a semicircle, 1.5 loops
        // most of the way round. The meaning and the geometry live in
        // `blocking-language.ts`.
        bulge: finiteNumber.gt(0).max(1.5).optional(),
      })
      .strict()
      .optional(),
    direction: z.enum(["forward", "backward", "left", "right"]).optional(),
    amount: z
      .union([
        z.object({ meters: finiteNumber.positive() }).strict(),
        z.object({ degrees: finiteNumber }).strict(),
      ])
      .optional(),
    facing: z
      .union([
        z.enum(["travel", "hold", "audience"]),
        z.object({ degrees: finiteNumber }).strict(),
      ])
      .optional(),
    durationSeconds: finiteNumber.positive().optional(),
    durationBeats: finiteNumber.positive().optional(),
    durationBars: durationBarsField,
    /** Gap 15. This move runs until the named cue. */
    until: cueNameSchema.optional(),
    easing: z.enum(DIRECTOR_EASINGS).optional(),
  })
  .strict()
  .superRefine(atMostOneMoveLength);

const blockingSchema = z.array(blockingMoveSchema).min(1).max(16);

/** One phase of cast-wide staging: everyone walks into the named formation. */
const sceneBlockingPhaseSchema = z
  .object({
    endFormation: formationIdSchema,
    /**
     * Gap 18. When this phase begins, in any of the clocks the scene already
     * speaks. Unstated means the moment the previous phase arrives, and 0 for
     * the first phase, which is what a single staging has always meant.
     */
    startSeconds: finiteNumber.nonnegative().optional(),
    startStep: finiteNumber.nonnegative().optional(),
    startCue: cueNameSchema.optional(),
    durationSeconds: finiteNumber.positive().optional(),
    durationBeats: finiteNumber.positive().optional(),
    durationBars: durationBarsField,
    easing: z.enum(DIRECTOR_EASINGS).optional(),
    facing: z
      .union([
        z.enum(["travel", "hold", "audience"]),
        z.object({ degrees: finiteNumber }).strict(),
      ])
      .optional(),
  })
  .strict()
  .superRefine(atMostOneTimeUnit)
  .superRefine((phase, ctx) => {
    const stated = [
      phase.startSeconds !== undefined,
      phase.startStep !== undefined,
      phase.startCue !== undefined,
    ].filter(Boolean).length;
    if (stated > 1) {
      ctx.addIssue({
        code: "custom",
        message:
          'A blocking phase states at most one of "startSeconds", "startStep", or "startCue".',
      });
    }
  });

/**
 * Cast-wide staging. `endFormation` walks everyone from their opening slot
 * into the named formation — the spoken "and then they all form a line". A
 * performer with their own `blocking` list ignores it.
 *
 * Gap 18. An array is a timeline of those: two lines that become one circle
 * halfway through, then a diagonal on the last phrase. Between phases the cast
 * holds the marks it just reached.
 */
const sceneBlockingSchema = z.union([
  sceneBlockingPhaseSchema,
  z.array(sceneBlockingPhaseSchema).min(1).max(8),
]);

/**
 * Spoken but not real. A director will plausibly ask for one performer's
 * trails to be long and another's short. The effects engine cannot do it:
 * `EffectsConfigState` holds one configuration per effect id for the whole
 * scene and `EffectOrchestrator3D` reads that single config for every
 * performer's tips. Accept the keys so the rejection can explain the
 * constraint instead of zod's "unrecognized key".
 */
export const PERFORMER_EFFECT_CONFIG_MESSAGE =
  'Effect presets and overrides are scene-wide: the effects engine keeps one configuration per effect id for the whole scene, so two performers using the same effect always look the same. Move "effectPresets"/"effectOverrides" to the scene, or give the performers different effects.';

const performerEffectConfigKeys = {
  effectPresets: z.unknown().optional(),
  effectOverrides: z.unknown().optional(),
};

function rejectPerformerEffectConfig(
  value: { effectPresets?: unknown; effectOverrides?: unknown },
  ctx: z.RefinementCtx
): void {
  for (const key of ["effectPresets", "effectOverrides"] as const) {
    if (value[key] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: PERFORMER_EFFECT_CONFIG_MESSAGE,
      });
    }
  }
}

/**
 * Gap 20. A spread is a statement about a cast: canon hands performer k the
 * kth multiple of one offset, a level ramp walks the cast from one difficulty
 * to another. Written on a single performer there is nobody to spread across,
 * so both reject by name rather than resolving to the one-performer case.
 */
export const CANON_NEEDS_A_CAST =
  'A canon spreads one offset across the cast, so it is spoken in "cast.defaults". On this performer, state the "beatOffset" they actually take.';
export const LEVEL_RAMP_NEEDS_A_CAST =
  'A level ramp walks the whole cast from one level to another, so it is spoken in "cast.defaults". On this performer, state the "level" they actually spin.';

const beatOffsetSpreadSchema = z.union([
  finiteNumber,
  z.object({ canon: finiteNumber }).strict(),
]);

function rejectPerformerCastSpreads(
  input: unknown,
  ctx: z.RefinementCtx
): void {
  const value = input as {
    beatOffset?: unknown;
    sequence?: { level?: unknown } | undefined;
  };
  if (typeof value.beatOffset === "object" && value.beatOffset !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["beatOffset"],
      message: CANON_NEEDS_A_CAST,
    });
  }
  const level = value.sequence?.level;
  if (typeof level === "object" && level !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sequence", "level"],
      message: LEVEL_RAMP_NEEDS_A_CAST,
    });
  }
}

const performerSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    sequence: performerSequenceSchema.optional(),
    characterId: directiveSchema(characterIdSchema).optional(),
    prop: directiveSchema(propTypeSchema).optional(),
    propBuild: propBuildSchema.optional(),
    effect: effectValueSchema.optional(),
    effort: directiveSchema(effortIdSchema).optional(),
    position: position2Schema.optional(),
    facingDegrees: finiteNumber.optional(),
    // Accepted in the canon shape so the rejection can name the constraint
    // rather than reading as "expected number".
    beatOffset: beatOffsetSpreadSchema.optional(),
    blocking: blockingSchema.optional(),
    staffLengthCm: directiveSchema(finiteNumber.min(40).max(300)).optional(),
    leftPlane: directiveSchema(planeSchema).optional(),
    rightPlane: directiveSchema(planeSchema).optional(),
    stepPlanes: z.array(stepPlaneEntrySchema).optional(),
    stepEffects: z.array(stepEffectEntrySchema).optional(),
    stepEfforts: z.array(stepEffortEntrySchema).optional(),
    stepStaffLengths: z.array(stepStaffLengthEntrySchema).max(16).optional(),
    holds: z.array(holdSchema).max(16).optional(),
    ...performerEffectConfigKeys,
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectPerformerEffectConfig(value, ctx);
    rejectPerformerCastSpreads(value, ctx);
  });

const castDefaultsSchema = z
  .object({
    sequence: performerSequenceSchema.optional(),
    characterId: directiveSchema(characterIdSchema).optional(),
    prop: directiveSchema(propTypeSchema).optional(),
    propBuild: propBuildSchema.optional(),
    effect: effectValueSchema.optional(),
    effort: directiveSchema(effortIdSchema).optional(),
    /** Gap 20. One offset for everyone, or `{canon}` for a staggered entry. */
    beatOffset: beatOffsetSpreadSchema.optional(),
    blocking: blockingSchema.optional(),
    staffLengthCm: directiveSchema(finiteNumber.min(40).max(300)).optional(),
    leftPlane: directiveSchema(planeSchema).optional(),
    rightPlane: directiveSchema(planeSchema).optional(),
    stepPlanes: z.array(stepPlaneEntrySchema).optional(),
    stepEffects: z.array(stepEffectEntrySchema).optional(),
    stepEfforts: z.array(stepEffortEntrySchema).optional(),
    stepStaffLengths: z.array(stepStaffLengthEntrySchema).max(16).optional(),
    holds: z.array(holdSchema).max(16).optional(),
    ...performerEffectConfigKeys,
  })
  .strict()
  .superRefine(rejectPerformerEffectConfig);

const castSchema = z
  .object({
    /**
     * Gap 21. Zero is a real answer. An establishing shot of an empty stage,
     * a held environment before anyone walks on, a beat of nothing: the
     * director says nobody is in this one and the scene still has a location,
     * a duration, and a camera.
     */
    count: z.number().int().min(0).max(8),
    defaults: castDefaultsSchema.optional(),
    performers: z.array(performerSchema).max(8).optional(),
  })
  .strict();

const performanceSchema = z
  .object({
    bpm: finiteNumber.min(20).max(300).optional(),
    /**
     * Gap 22. How many beats make a bar here. Only meaningful alongside a
     * bars-stated duration, and 4 when unstated, which is what an unmarked
     * count-off means.
     */
    meter: z
      .object({ beatsPerBar: z.number().int().min(2).max(12) })
      .strict()
      .optional(),
    /**
     * Gap 16. Whether the prop phrase starts over at this cut or carries on.
     * "restart" (the default, and what every film did before this word
     * existed) opens the scene on step zero. "continue" opens it on whatever
     * count the previous scene ended on, so a tempo change reads as the same
     * phrase taken faster rather than as a new one.
     */
    phrase: z.enum(["restart", "continue"]).optional(),
    sequence: z
      .object({ source: z.literal("demo"), loop: z.boolean().optional() })
      .strict()
      .optional(),
    formation: directiveSchema(formationIdSchema).optional(),
    blocking: sceneBlockingSchema.optional(),
    cast: castSchema.optional(),
    // Gap 21. An explicit empty array is a stated empty stage, the long way
    // round from `cast: { count: 0 }`, and means the same thing.
    performers: z.array(performerSchema).min(0).max(8).optional(),
  })
  .strict()
  .refine((value) => !(value.cast && value.performers), {
    message: "Use either a cast block or a performers array, not both.",
    path: ["cast"],
  });

const locationSchema = z
  .object({
    environmentId: directiveSchema(environmentIdSchema).optional(),
    showStage: z.boolean().optional(),
    showAudience: z.boolean().optional(),
    sceneFeatures: z.record(z.string(), z.boolean()).optional(),
    visiblePlanes: visiblePlanesSchema.optional(),
  })
  .strict();

/** Where a `pan` aims when it is spoken as a destination instead of an angle. */
const cameraPanDestinationSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("performer"), performerId: z.string().min(1) })
    .strict(),
  z.object({ kind: z.literal("point"), position: vector3Schema }).strict(),
]);

const cameraMoveFields = {
  move: z.enum([
    "hold",
    "push-in",
    "pull-back",
    "orbit",
    "crane",
    "pan",
    "tilt",
    "truck",
    "zoom",
    "roll",
  ]),
  direction: z
    .enum(["cw", "ccw", "up", "down", "left", "right", "in", "out"])
    .optional(),
  amount: z
    .union([
      z.object({ degrees: finiteNumber }).strict(),
      z.object({ meters: finiteNumber.positive() }).strict(),
      // A zoom that answers the move it runs with rather than a number: keep
      // the subject the same size on screen while the rig travels.
      z.object({ match: z.literal("subject-size") }).strict(),
    ])
    .optional(),
  to: cameraPanDestinationSchema.optional(),
  durationSeconds: finiteNumber.positive().optional(),
  durationBeats: finiteNumber.positive().optional(),
  durationBars: durationBarsField,
  /** Gap 15. This move runs until the named cue. */
  until: cueNameSchema.optional(),
  easing: z.enum(DIRECTOR_EASINGS).optional(),
};

const MOVE_GROUP_NESTED =
  'A move inside "with" already runs alongside another move. State every concurrent move in the outer move\'s "with".';
const MOVE_GROUP_MEMBER_DURATION =
  'A move inside "with" shares the window of the move it runs with. Give the duration to that outer move.';
const MOVE_GROUP_HOLD =
  'A "hold" runs with nothing and nothing runs with a hold. Give the "with" to a move that actually moves.';
const MATCH_NEEDS_A_TRAVEL =
  'A zoom that matches subject size runs inside a push-in or a pull-back, spoken in that move\'s "with". On its own there is no travel for it to answer.';
const MATCH_IS_A_ZOOM = 'Only a zoom can match subject size.';
const MATCH_HAS_NO_DIRECTION =
  'A zoom that matches subject size takes its direction from the move it runs with. Drop the direction.';
const PAN_TO_OR_ANGLE =
  'A pan states where to aim or how far to turn, not both. Drop "to", or drop the direction and amount.';
const TO_IS_A_PAN = 'Only a "pan" takes a "to". Other moves state an amount.';

const hasMatchAmount = (move: { amount?: unknown }): boolean =>
  Boolean(move.amount && typeof move.amount === "object" && "match" in move.amount);

const rejectPanContradiction = (
  move: { move: string; to?: unknown; direction?: unknown; amount?: unknown },
  ctx: z.RefinementCtx
) => {
  if (move.to === undefined) return;
  if (move.move !== "pan") {
    ctx.addIssue({ code: "custom", message: TO_IS_A_PAN, path: ["to"] });
    return;
  }
  if (move.direction !== undefined || move.amount !== undefined) {
    ctx.addIssue({ code: "custom", message: PAN_TO_OR_ANGLE, path: ["to"] });
  }
};

/**
 * One move inside another move's `with`. It shares the outer move's window,
 * so it states no duration of its own, and it cannot carry a `with` of its
 * own: concurrency is one flat group, not a tree.
 */
const cameraMoveMemberSchema = z
  // The `with` key is declared only so a nested group rejects by name rather
  // than as an unknown key. `z.any()` rather than `z.unknown()` so a member
  // stays structurally a camera move for the compiler's own move type; the
  // superRefine below rejects the key outright, so nothing is ever read.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .object({ ...cameraMoveFields, with: z.array(z.any()).optional() })
  .strict()
  .superRefine((member, ctx) => {
    if (member.with !== undefined) {
      ctx.addIssue({ code: "custom", message: MOVE_GROUP_NESTED, path: ["with"] });
    }
    if (
      member.durationSeconds !== undefined ||
      member.durationBeats !== undefined ||
      member.durationBars !== undefined ||
      member.until !== undefined
    ) {
      ctx.addIssue({ code: "custom", message: MOVE_GROUP_MEMBER_DURATION });
    }
    if (member.move === "hold") {
      ctx.addIssue({ code: "custom", message: MOVE_GROUP_HOLD, path: ["move"] });
    }
    rejectPanContradiction(member, ctx);
  });

const cameraMoveSchema = z
  .object({
    ...cameraMoveFields,
    // Gap 10. Moves that run at the same time as this one, in the same window.
    with: z.array(cameraMoveMemberSchema).min(1).max(4).optional(),
  })
  .strict()
  .superRefine(atMostOneMoveLength)
  .superRefine((move, ctx) => {
    rejectPanContradiction(move, ctx);
    if (hasMatchAmount(move)) {
      ctx.addIssue({
        code: "custom",
        message: MATCH_NEEDS_A_TRAVEL,
        path: ["amount"],
      });
    }
    if (!move.with) return;
    if (move.move === "hold") {
      ctx.addIssue({ code: "custom", message: MOVE_GROUP_HOLD, path: ["with"] });
    }
    move.with.forEach((member, index) => {
      if (!hasMatchAmount(member)) return;
      if (member.move !== "zoom") {
        ctx.addIssue({
          code: "custom",
          message: MATCH_IS_A_ZOOM,
          path: ["with", index, "amount"],
        });
        return;
      }
      if (move.move !== "push-in" && move.move !== "pull-back") {
        ctx.addIssue({
          code: "custom",
          message: MATCH_NEEDS_A_TRAVEL,
          path: ["with", index, "amount"],
        });
      }
      if (member.direction !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: MATCH_HAS_NO_DIRECTION,
          path: ["with", index, "direction"],
        });
      }
    });
  });

/**
 * The framing vocabulary, named rather than written inline into the enums
 * below. A surface that shows a director their framing options reads these, so
 * the offered set and the accepted set cannot drift apart — the same reason
 * `CAMERA_MOVE_RULES` and the axis catalogs are exported.
 */
export const DIRECTOR_SHOT_SIZES = [
  "close-up",
  "medium",
  "wide",
  "extreme-wide",
] as const;
export const DIRECTOR_CAMERA_ANGLES = ["low", "eye", "high", "top"] as const;
export const DIRECTOR_CAMERA_POSITIONS = [
  "front",
  "left",
  "right",
  "behind",
] as const;

/**
 * One framing, spelled the same whether it is the scene's only framing or one
 * shot among several. Shared so a shot can never drift from what the top-level
 * camera accepts.
 */
const cameraFramingFields = {
  subject: cameraTargetSchema.optional(),
  shotSize: z.enum(DIRECTOR_SHOT_SIZES).optional(),
  angle: z.enum(DIRECTOR_CAMERA_ANGLES).optional(),
  position: z
    .union([
      z.enum(DIRECTOR_CAMERA_POSITIONS),
      z.object({ degrees: finiteNumber.min(-360).max(360) }).strict(),
    ])
    .optional(),
  moves: z.array(cameraMoveSchema).min(1).max(16).optional(),
};

/** A framing plus how long it stays on screen. Consecutive shots hard-cut. */
const cameraShotSchema = z
  .object({
    ...cameraFramingFields,
    durationSeconds: finiteNumber.positive().optional(),
    durationBeats: finiteNumber.positive().optional(),
    durationBars: durationBarsField,
    /** Gap 15. This shot stays on screen until the named cue. */
    until: cueNameSchema.optional(),
  })
  .strict()
  .superRefine(atMostOneMoveLength);

/**
 * One hand-authored key on one camera channel.
 *
 * Times are seconds from the scene's start. Manual keys deliberately do not
 * accept the beat, bar and cue vocabulary a camera keyframe does: a key placed
 * by dragging it is a statement about a moment, and having it slide when the
 * tempo changed would be a surprise rather than a feature.
 */
const cameraChannelKeySchema = z
  .object({
    atSeconds: finiteNumber.min(0),
    value: finiteNumber,
    interpolation: z.enum(DIRECTOR_INTERPOLATIONS).optional(),
    easing: z.enum(DIRECTOR_EASINGS).optional(),
  })
  .strict();

/**
 * The manual layer, addressed by channel.
 *
 * Present only when something was hand-keyed; absent, not empty, otherwise, so
 * every film written before channels existed resolves byte-identically. A
 * channel named here takes ownership whole (decision D2): its keys replace
 * whatever composed underneath rather than merging with it.
 */
const cameraChannelsSchema = z
  // partialRecord, not record: an enum-keyed `z.record` in Zod 4 is
  // EXHAUSTIVE, so it would demand all eleven channels before accepting one.
  // Hand-keying a single scalar is the whole point of the block.
  .partialRecord(
    z.enum(CAMERA_CHANNEL_IDS),
    z
      .object({ keys: z.array(cameraChannelKeySchema).min(1).max(64) })
      .strict()
  )
  .refine((channels) => Object.keys(channels).length > 0, {
    message:
      "A channels block with nothing in it says nothing. Leave it out instead.",
  });

const cameraSchema = z
  .object({
    preset: z.enum(DIRECTOR_CAMERA_PRESETS).optional(),
    /** Hand-keyed channels, layered over whatever the rest of this camera says. */
    channels: cameraChannelsSchema.optional(),
    target: cameraTargetSchema.optional(),
    orbitDegrees: finiteNumber.min(-720).max(720).optional(),
    keyframes: z.array(cameraKeyframeSchema).min(1).max(32).optional(),
    // Gap 11. Take it off the tripod. Handheld is a modifier on the sampled
    // frame, not a framing, so it combines with framing grammar, shots,
    // presets and raw keyframes alike.
    handheld: z
      .union([
        z.enum(["subtle", "steady", "rough"]),
        z
          .object({
            meters: finiteNumber.min(0).max(0.3),
            degrees: finiteNumber.min(0).max(5),
          })
          .strict(),
      ])
      .optional(),
    ...cameraFramingFields,
    shots: z
      .array(cameraShotSchema)
      .min(2, {
        message:
          "One shot is just a framing. State it directly on camera, or give shots at least two entries to cut between.",
      })
      .max(16)
      .optional(),
  })
  .strict()
  .refine(
    (camera) => camera.preset !== "custom" || Boolean(camera.keyframes?.length),
    {
      message: "A custom camera needs at least one keyframe",
      path: ["keyframes"],
    }
  )
  .refine(
    (camera) =>
      !camera.keyframes ||
      !(
        camera.shotSize ||
        camera.angle ||
        camera.position ||
        camera.moves ||
        camera.subject
      ),
    {
      message: "Raw keyframes and framing grammar are exclusive — use one.",
      path: ["keyframes"],
    }
  )
  .refine(
    (camera) =>
      !camera.preset ||
      camera.preset === "custom" ||
      !(camera.shotSize || camera.angle || camera.position || camera.moves),
    {
      message: "A preset and framing grammar are exclusive — use one.",
      path: ["preset"],
    }
  )
  .refine((camera) => !(camera.subject && camera.target), {
    message:
      'Use "subject" with framing grammar, "target" with presets/keyframes.',
    path: ["subject"],
  })
  // cameraTargetSchema is shared by subject, target, and keyframe targets, so
  // `track` is syntactically sayable in all three. It only means something on
  // `subject`: a preset or a raw keyframe aims exactly where its target says,
  // and silently ignoring the word would read as a camera that refused to move.
  .refine(
    (camera) =>
      !(camera.target?.kind === "performer" && camera.target.track) &&
      !camera.keyframes?.some(
        (frame) => frame.target?.kind === "performer" && frame.target.track
      ),
    {
      message:
        'Tracking is spoken on "subject" with framing grammar. Presets and raw keyframes aim where their targets say.',
      path: ["target"],
    }
  )
  .refine(
    (camera) =>
      !camera.shots ||
      !(
        camera.subject ||
        camera.shotSize ||
        camera.angle ||
        camera.position ||
        camera.moves
      ),
    {
      message:
        'Shots and a single framing are exclusive. Put every framing inside "shots".',
      path: ["shots"],
    }
  )
  .refine((camera) => !(camera.shots && camera.preset), {
    message: "A preset and shots are exclusive. Shots are their own framing.",
    path: ["shots"],
  })
  .refine((camera) => !(camera.shots && camera.keyframes), {
    message: "Raw keyframes and shots are exclusive. Use one.",
    path: ["shots"],
  })
  .refine((camera) => !(camera.shots && camera.target), {
    message: 'Use "subject" inside each shot, not "target".',
    path: ["shots"],
  })
  // Tracking offsets the WHOLE resolved track by a walker's displacement, so
  // it cannot describe a walker followed in one shot and ignored in the next.
  .refine(
    (camera) =>
      !camera.shots?.some(
        (shot) => shot.subject?.kind === "performer" && shot.subject.track
      ),
    {
      message:
        'Tracking and shots do not combine yet. Track a walker with a single framing, or cut between shots without "track".',
      path: ["shots"],
    }
  );

/** How one scene may reach the next. Exported for the same reason as above. */
export const DIRECTOR_TRANSITION_KINDS = [
  "cut",
  "environment-dissolve",
  "fade-through-black",
] as const;

const transitionSchema = z
  .object({
    kind: z.enum(DIRECTOR_TRANSITION_KINDS),
    durationSeconds: finiteNumber.min(0).max(3).optional(),
    // max 32 beats is a syntactic cap, not the real one — see the two-layer
    // contract note on atMostOneTimeUnit above. At a slow bpm, 32 beats can
    // still convert to more than the 3-second ceiling this transition
    // actually enforces; convertSceneBeatTimes catches that at resolve time.
    durationBeats: finiteNumber.min(0).max(32).optional(),
    durationBars: finiteNumber.min(0).max(16).optional(),
  })
  .strict()
  .superRefine(atMostOneTimeUnit);

/**
 * What a scene is chiefly about, for browsing a film that is a reference rather
 * than a watch. Proving Grounds is 23 scenes and each one demonstrates a
 * different part of the language; read end to end it is a three-minute film,
 * and a director looking for the dolly zoom does not want a film.
 *
 * A closed set on purpose. Free-text categories drift into synonyms ("camera",
 * "cameras", "shots") and the index then groups the same subject three ways.
 * The scene index renders these in the order written here, so the list doubles
 * as the reading order: what the frame does, then how the film counts, then
 * where the bodies are, then who they are, then what is in their hands, then
 * how scenes refer to each other.
 */
export const DIRECTOR_SCENE_CATEGORIES = [
  "camera",
  "timing",
  "staging",
  "performers",
  "props",
  "structure",
] as const;

export type DirectorSceneCategory = (typeof DIRECTOR_SCENE_CATEGORIES)[number];

/** Heading shown for each category in the scene index. */
export const DIRECTOR_SCENE_CATEGORY_LABELS: Record<
  DirectorSceneCategory,
  string
> = {
  camera: "Camera",
  timing: "Timing",
  staging: "Staging",
  performers: "Performers",
  props: "Props and effects",
  structure: "Structure",
};

const sceneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    intent: z.string().min(1).optional(),
    /**
     * Which part of the language this scene is chiefly demonstrating. Optional,
     * and ABSENT rather than null once resolved, so the films that are films
     * rather than references resolve byte-identically to their pre-category
     * snapshots — the same convention `extends` and `seedSource` follow.
     */
    category: z.enum(DIRECTOR_SCENE_CATEGORIES).optional(),
    /**
     * Gap 13. The earlier scene this one is a variation of. Already expanded
     * by `expandSceneInheritance` at the input boundary, so what arrives here
     * is a whole scene and this field is only the record of where it came
     * from. That expansion is also why `title` above stays required: a child
     * inherits its parent's title before the schema ever sees it.
     */
    extends: z.string().min(1).optional(),
    /**
     * Gap 14. Draw this scene's seeded directives as if it were the named
     * earlier scene, so a callback picks the same character, prop, and planes
     * the original did. Deliberately NOT implied by `extends`: a second angle
     * on the same moment wants the same draws, while a later verse that reuses
     * a scene's staging usually wants fresh ones. Two different intentions,
     * two separate words.
     */
    seedAs: z.string().min(1).optional(),
    /**
     * Gap 15. Named moments in this scene's own time. A cue name is accepted
     * anywhere a count is spoken, as a move's `until`, as a keyframe's `at`,
     * and as a blocking phase's `startCue`, so one number written once drives
     * the effect change, the cut, and the formation change together.
     */
    cues: z.record(z.string(), cueSchema).optional(),
    durationSeconds: finiteNumber.min(1).max(60).optional(),
    // max 240 beats is a syntactic cap, not the real one — see the
    // two-layer contract note on atMostOneTimeUnit above. At a slow bpm,
    // 240 beats can still convert to more than the scene's 60-second
    // ceiling; convertSceneBeatTimes catches that at resolve time.
    durationBeats: finiteNumber.positive().max(240).optional(),
    durationBars: finiteNumber.positive().max(120).optional(),
    transition: transitionSchema.optional(),
    location: locationSchema.optional(),
    performance: performanceSchema.optional(),
    effectPresets: z
      .record(
        z.string(),
        z.union([
          z.string().min(1),
          z.object({ pick: z.literal("any") }).strict(),
        ])
      )
      .optional(),
    effectOverrides: z
      .record(configurableEffectIdSchema, z.record(z.string(), z.unknown()))
      .optional(),
    camera: cameraSchema.optional(),
  })
  .strict()
  .superRefine(atMostOneTimeUnit)
  .superRefine((scene, ctx) => {
    const names = Object.keys(scene.cues ?? {});
    if (names.length > MAX_SCENE_CUES) {
      ctx.addIssue({
        code: "custom",
        path: ["cues"],
        message: `Scene "${scene.id}" names ${names.length} cues; ${MAX_SCENE_CUES} is the limit.`,
      });
    }
    for (const name of names) {
      if (CUE_NAME_PATTERN.test(name)) continue;
      ctx.addIssue({
        code: "custom",
        path: ["cues", name],
        message: `Scene "${scene.id}" names a cue "${name}". ${CUE_NAME_MESSAGE}`,
      });
    }
  });

const filmDirectorInputSchema = z
  .object({
    // Declarative provenance, not a grammar gate. `version` records which
    // revision of this document a director authored against — it does NOT
    // restrict which grammar that document may use. Newer grammar (beats as
    // a time unit, combined pick+not) is accepted at ANY stated version,
    // exactly as v2/v3 grammar was: a v1-labeled film can freely use v4-era
    // syntax. Don't add version-conditional parsing here; bump the literal
    // set when a new number ships and let the grammar itself decide what's
    // legal.
    version: z.union([
      z.literal(FILM_DIRECTOR_SCHEMA_VERSION_1),
      z.literal(FILM_DIRECTOR_SCHEMA_VERSION_2),
      z.literal(FILM_DIRECTOR_SCHEMA_VERSION_3),
      z.literal(FILM_DIRECTOR_SCHEMA_VERSION_4),
      z.literal(FILM_DIRECTOR_SCHEMA_VERSION),
    ]),
    id: z.string().min(1),
    title: z.string().min(1),
    brief: z.string().min(1).optional(),
    seed: seedSchema.optional(),
    format: z
      .object({
        width: z.number().int().min(640).max(7680).optional(),
        height: z.number().int().min(360).max(4320).optional(),
        fps: z.number().int().min(24).max(120).optional(),
      })
      .strict()
      .optional(),
    playback: z
      .object({
        loop: z.boolean().optional(),
        autoplay: z.boolean().optional(),
      })
      .strict()
      .optional(),
    scenes: z.array(sceneSchema).min(1).max(24),
  })
  .strict();

export const FilmDirectorInputSchema = z.preprocess(
  normalizeFilmDirectorInput,
  filmDirectorInputSchema
);

export type FilmDirectorInput = z.infer<typeof FilmDirectorInputSchema>;
export type DirectorSceneInput = z.infer<typeof sceneSchema>;
export type DirectorCastInput = z.infer<typeof castSchema>;
export type DirectorCameraInput = z.infer<typeof cameraSchema>;
export type DirectorCameraTargetInput = z.infer<typeof cameraTargetSchema>;
export type DirectorPropBuild = z.infer<typeof propBuildSchema>;
export type DirectorBlockingInput = z.infer<typeof blockingSchema>;
export type DirectorSceneBlockingInput = z.infer<typeof sceneBlockingSchema>;
export type DirectorSceneBlockingPhaseInput = z.infer<
  typeof sceneBlockingPhaseSchema
>;
export type DirectorCameraPreset = (typeof DIRECTOR_CAMERA_PRESETS)[number];
export type DirectorInterpolation = (typeof DIRECTOR_INTERPOLATIONS)[number];
export type DirectorEasing = (typeof DIRECTOR_EASINGS)[number];

export interface ResolvedDirectorStepPlane {
  step: number;
  hand: "left" | "right";
  plane: Plane;
}

/**
 * Gap 26. A pair of effects, one per hand. Absent everywhere the director
 * spoke a single effect, so a film written before the pair existed resolves
 * byte-identically to its snapshot.
 */
export interface ResolvedDirectorHandEffects {
  left: EffectType;
  right: EffectType;
}

export interface ResolvedDirectorStepEffect {
  step: number;
  /** The left hand's effect, which is also the whole performer's when no pair was spoken. */
  effect: EffectType;
  handEffects?: ResolvedDirectorHandEffects;
}

export interface ResolvedDirectorStepEffort {
  step: number;
  effort: EffortId;
}

/**
 * Gap 17. One waypoint on a performer's prop-length ramp. `ease` says how the
 * length arrives here from the previous waypoint.
 */
export interface ResolvedDirectorStepStaffLength {
  step: number;
  staffLengthCm: number;
  ease: "cut" | "linear";
}

export interface ResolvedDirectorHold {
  fromStep: number;
  steps: number;
  /**
   * Gap 19. Where inside the frozen step the pose sits, 0 to 1. Absent (not
   * zero) when the director did not say, so a film written before this word
   * existed resolves byte-identically to its snapshot.
   */
  progress?: number;
}

export interface ResolvedDirectorPerformer {
  id: string;
  name: string;
  characterId: CharacterId;
  prop: PropType;
  /**
   * Gap 23. Which build of that prop, merged over the scene package's global
   * build. Absent when the performer takes the global one unchanged.
   */
  propBuild?: DirectorPropBuild;
  /** The left hand's effect, which is also the whole performer's when no pair was spoken. */
  effect: EffectType;
  /** Gap 26. Present only when the director spoke a hand pair. */
  handEffects?: ResolvedDirectorHandEffects;
  effort: EffortId;
  sequence: DirectorPerformerSequence;
  /** Where this performer stands when the scene opens. */
  position: { x: number; z: number };
  /** Which way they face when the scene opens. */
  facingAngle: number;
  /** Their staging for the whole scene, always at least an opening hold. */
  blocking: ResolvedDirectorBlockingKeyframe[];
  beatOffset: number;
  staffLengthCm: number | null;
  leftPlane: Plane;
  rightPlane: Plane;
  stepPlanes: ResolvedDirectorStepPlane[];
  stepEffects: ResolvedDirectorStepEffect[];
  stepEfforts: ResolvedDirectorStepEffort[];
  /**
   * Gap 17. Absent (not an empty array) when the prop keeps one length, so
   * every film written before this word existed resolves as it did.
   */
  stepStaffLengths?: ResolvedDirectorStepStaffLength[];
  holds: ResolvedDirectorHold[];
}

export interface ResolvedDirectorCameraKeyframe {
  atSeconds: number;
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
  /**
   * Horizon tilt in degrees, positive = clockwise as the audience sees the
   * frame. Present only on keyframe streams where a roll move ran, so films
   * that never roll resolve byte-identically to their pre-roll snapshots.
   */
  rollDeg?: number;
  /**
   * How the aim travels from THIS keyframe to the next, the same way
   * `interpolation` governs its own outgoing segment.
   *
   * Absent means the aim point is interpolated where it lives, in world space.
   * That is right for every move that holds a fixed point or carries the aim
   * along with the rig, and it is what every keyframe resolved before this
   * field existed does, so those films are untouched.
   *
   * `"angles"` means the segment interpolates the aim DIRECTION instead, and
   * the aim point is derived. A turn in place needs this: interpolating the
   * point chords across the arc, so the framing distance dips and the angular
   * rate is wrong in the middle of the move.
   */
  aimSpace?: "angles";
  /**
   * Aim yaw in degrees, `atan2(dx, dz)`, present when the compiler knows the
   * turn it authored. Stated rather than recovered because `atan2` cannot tell
   * a turn of 270 degrees from one of -90.
   */
  aimYawDeg?: number;
  /** Aim pitch in degrees above level, present alongside `aimYawDeg`. */
  aimPitchDeg?: number;
  interpolation: DirectorInterpolation;
  easing: DirectorEasing;
}

/**
 * One key of a resolved manual channel. Structurally what
 * `ManualCameraChannel` in `director-camera-channels.ts` consumes; the shape
 * is stated here because this is where resolved documents are described.
 */
export interface ResolvedDirectorCameraChannelKey {
  atSeconds: number;
  value: number;
  interpolation: DirectorInterpolation;
  easing: DirectorEasing;
}

export interface ResolvedDirectorCameraChannel {
  id: CameraChannelId;
  keys: ResolvedDirectorCameraChannelKey[];
}

export interface ResolvedDirectorScene {
  id: string;
  title: string;
  intent: string | null;
  /** See the schema field. Absent, not null, when the scene states none. */
  category?: DirectorSceneCategory;
  /**
   * Gap 13. The earlier scene this one was expanded from. Absent (not null)
   * when the scene stands alone, and likewise for `seedSource` below, so
   * films that use neither resolve byte-identically to their pre-round-2
   * snapshots. Same convention as `camera.tracking` and `camera.handheld`.
   */
  extends?: string;
  /** Gap 14. The scene id this scene's seeded directives were drawn under. */
  seedSource?: string;
  startSeconds: number;
  durationSeconds: number;
  transition: {
    kind: "cut" | "environment-dissolve" | "fade-through-black";
    durationSeconds: number;
  };
  location: {
    environmentId: SceneEnvironmentId;
    showStage: boolean;
    showAudience: boolean;
    sceneFeatures: Record<string, boolean>;
    visiblePlanes: Plane[];
  };
  performance: {
    bpm: number;
    sequence: { source: "demo"; loop: boolean };
    formation: FormationPreset;
    performers: ResolvedDirectorPerformer[];
    /**
     * Gap 16. The count this scene's shared clock opens on. Present only when
     * the scene said `phrase: "continue"`; absent otherwise, which is the zero
     * every earlier film resolved with.
     */
    stepOffset?: number;
    /**
     * Every mark the cast reaches during this scene, opening positions and
     * blocking waypoints alike. The viewer sizes the ground to this instead of
     * to the live positions, so a scene of walking gets one stage rather than
     * one that grows and shrinks under the feet crossing it.
     */
    stageExtent: readonly { x: number; z: number }[];
  };
  effectPresets: Record<string, string>;
  effectOverrides: Record<string, Record<string, unknown>>;
  camera: {
    preset: DirectorCameraPreset;
    /**
     * The preset the scene asked for when it is not approved for this
     * formation and `preset` is a fallback. Null when nothing was
     * substituted. The control surface shows it rather than letting the
     * swap happen silently.
     */
    substitutedFor: DirectorCameraPreset | null;
    keyframes: ResolvedDirectorCameraKeyframe[];
    /**
     * Present only when the scene's subject asked to be tracked. The sampler
     * offsets the compiled camera by this performer's live displacement from
     * their opening mark: "aim" moves the target, "follow" moves target and
     * position together. Absent (not null) on every other scene so films that
     * never track resolve byte-identically to their pre-tracking snapshots.
     */
    tracking?: { performerId: string; mode: "aim" | "follow" };
    /**
     * Present only when the scene took the camera off the tripod. `meters`
     * and `degrees` are the drift envelopes the sampler stays inside;
     * `seed` fixes the noise phases so one film always shakes the same way.
     * Absent (not null) otherwise, so films that never go handheld resolve
     * byte-identically to their earlier snapshots.
     */
    handheld?: ResolvedDirectorHandheld;
    /**
     * The manual layer: channels the director hand-keyed, each owning its
     * scalar outright over whatever the preset, grammar or keyframes below it
     * produced. Absent (not an empty array) when nothing was hand-keyed, so
     * films written before channels existed resolve byte-identically.
     */
    channels?: ResolvedDirectorCameraChannel[];
  };
}

export interface ResolvedDirectorHandheld {
  meters: number;
  degrees: number;
  seed: number;
}

export interface ResolvedFilmDirectorSpec {
  version:
    | typeof FILM_DIRECTOR_SCHEMA_VERSION_1
    | typeof FILM_DIRECTOR_SCHEMA_VERSION_2
    | typeof FILM_DIRECTOR_SCHEMA_VERSION_3
    | typeof FILM_DIRECTOR_SCHEMA_VERSION_4
    | typeof FILM_DIRECTOR_SCHEMA_VERSION;
  id: string;
  title: string;
  brief: string | null;
  format: { width: number; height: number; fps: number };
  playback: { loop: boolean; autoplay: boolean };
  scenes: ResolvedDirectorScene[];
  durationSeconds: number;
}
