/**
 * Stage 3 — Closure. The stage the 2026-08-04 engine never had.
 *
 * Hand it a candidate unit's realized `(startPlacement, endPlacement)` and it
 * answers with every way that pair becomes a LOOP. A unit admitting none is
 * freeform and is DROPPED, not demoted — that ruling is the whole reason for
 * the redesign.
 *
 * **The app answers, not this file.** Admissibility for a named LOOP type is
 * `isLOOPValidForPlacementPair` from
 * `packages/sequence-engine/src/loop/validation/LOOPValidator.ts`, and the
 * number of passes a closure needs is the app's own
 * `getLOOPSpecExpansionMultiplier` over `loopSpecFromLegacy`. A local
 * reimplementation of the closing group exists in
 * `scripts/combinator-research/enumerate.mjs`; it is a research instrument and
 * is deliberately not imported here.
 *
 * **Both periods, for every unit that can tell them apart.** `HALVED_LOOPS` is
 * built from a 180-degree placement map and `QUARTERED_LOOPS` from the 90-degree
 * CW/CCW maps, and the validator picks the set by period. Asking only at the
 * default halved period hides every quartered LOOP — which is A+G's entire
 * 16-count bucket, i.e. every mixed-crossing combination this feature exists to
 * find (verified live: alpha3 -> alpha5 answers `rewound` only at halved, and
 * `rotated` + `rotated_inverted` + `rotated_swapped` at quartered).
 *
 * The converse matters just as much and is easy to miss: for a type carrying no
 * ROTATED component the validator IGNORES the period argument, so a second query
 * returns the identical boolean while `getLOOPSpecExpansionMultiplier` doubles
 * the circle. Emitting that pair would invent a quartered closure the validator
 * never asserted. Measured on A+G: querying period-blind types at both periods
 * moves the 16/20/24 buckets from 12/50/54 to 32/80/144 — 110 phantom rows.
 * `quarteredPeriodBlindTypes` exists so that behaviour can be turned on
 * deliberately, and it is off.
 *
 * Spec: `docs/superpowers/specs/2026-08-05-sequence-combinator-redesign-design.md`
 * Oracle: `scripts/combinator-research/by-count.mjs`
 */

import {
  ALL_LOOP_TYPES,
  LOOPComponent,
  LOOPType,
  LOOP_TYPE_LABELS,
  Period,
  getLOOPSpecExpansionMultiplier,
  isLOOPValidForPlacementPair,
  loopSpecFromLegacy,
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
  VERTICAL_MIRROR_PLACEMENT_MAP,
} from "@tka/sequence-engine/loop";

import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

import type {
  AdmissibleClosure,
  ClosureReflectionAxis,
} from "../domain/closure-types";

/**
 * What Stage 3 is allowed to count as a closure.
 *
 * Every default is the setting that reproduces the published oracle
 * (`scripts/combinator-research/by-count.mjs`, A+G: 4:10 5:18 6:60 8:32 10:80
 * 12:144 16:12 20:50 24:54). Each flag documents what it costs to flip.
 */
export interface ClosureOptions {
  /**
   * Count `rewound` as a closure. OFF by default, and the reason is not taste:
   * `isLOOPValidForPlacementPair` returns `true` for REWOUND at EVERY placement
   * pair, because any sequence can be played backwards. It therefore carries no
   * admissibility information at all — with it on, no walk is ever freeform and
   * the discard rule that this whole stage exists to enforce becomes vacuous.
   */
  readonly includeRewound?: boolean;
  /**
   * Count the compound LOOP types whose expansion is 4x or 16x
   * (`mirrored_rotated`, `mirrored_inverted_rotated`, `mirrored_rotated_swapped`,
   * `mirrored_rotated_inverted_swapped`). OFF by default.
   *
   * They are real app LOOP types, but they are not a single closing transform:
   * the validator admits them as the CONJUNCTION of two independent conditions
   * and the executor plays a pass per combination, so the circle is the product
   * of two expansions rather than the order of one transform. The design's
   * bucket law is "circle length = unit length x the order of the closing
   * transform", which is the one-transform model. Measured on A+G: turning them
   * on moves 16/20/24 from 12/50/54 to 32/80/144.
   */
  readonly includeCompoundLOOPs?: boolean;
  /**
   * Ask period-blind LOOP types (everything with no ROTATED component) at the
   * quartered period too, and take the 4x multiplier when they answer. OFF by
   * default — see the module comment; the validator's answer does not change,
   * only the circle length, so the extra rows assert a period the app never
   * checked.
   */
  readonly quarteredPeriodBlindTypes?: boolean;
  /**
   * Count a reflection across a DIAGONAL axis (NE-SW, NW-SE). ON by default.
   *
   * TKA canon has four reflection axes; the engine ships all four location maps
   * but only builds placement-pair validation sets for north-south (MIRRORED) and
   * east-west (FLIPPED). The diagonal answer is composed here from the engine's
   * OWN placement maps — a vertical mirror after a quarter rotation IS the
   * diagonal reflection — so no new geometry is introduced. Turning it off costs
   * A+G's 8/10/12 buckets 12/50/54 words respectively, all of them mixed
   * crossings.
   */
  readonly includeDiagonalReflections?: boolean;
}

const DEFAULTS: Required<ClosureOptions> = {
  includeRewound: false,
  includeCompoundLOOPs: false,
  quarteredPeriodBlindTypes: false,
  includeDiagonalReflections: true,
};

/** A reflection is an involution: two passes and the material is home. */
const REFLECTION_MULTIPLIER = 2;

/** Above this the type is a conjunction of transforms, not one transform. */
const SINGLE_TRANSFORM_MULTIPLIER_CEILING = 2;

interface LOOPTypeFacts {
  readonly loopType: LOOPType;
  /** The validator's answer depends on the period (the type has a ROTATED component). */
  readonly periodSensitive: boolean;
  readonly halvedMultiplier: number;
  readonly quarteredMultiplier: number;
  readonly compound: boolean;
}

/**
 * Everything Stage 3 needs to know about the LOOP catalogue, read out of the
 * app's own spec machinery once.
 *
 * `periodSensitive` is derived from the spec rather than from the type's name:
 * `loopSpecFromLegacy` is what decides a legacy type's components, so asking it
 * whether ROTATED is present cannot drift from the validator's own `switch`.
 */
const LOOP_TYPE_FACTS: readonly LOOPTypeFacts[] = ALL_LOOP_TYPES.map(
  (loopType) => {
    const halved = loopSpecFromLegacy(loopType, 2);
    const quartered = loopSpecFromLegacy(loopType, 4);
    const halvedMultiplier = getLOOPSpecExpansionMultiplier(halved);
    return {
      loopType,
      periodSensitive:
        halved.left?.components.has(LOOPComponent.ROTATED) ?? false,
      halvedMultiplier,
      quarteredMultiplier: getLOOPSpecExpansionMultiplier(quartered),
      compound: halvedMultiplier > SINGLE_TRANSFORM_MULTIPLIER_CEILING,
    };
  }
);

function labelFor(loopType: LOOPType, period: Period): string {
  const base = LOOP_TYPE_LABELS[loopType] ?? String(loopType);
  return period === Period.QUARTERED ? `${base} (quartered)` : base;
}

/**
 * The two diagonal reflections, expressed as a composite of placement maps the
 * engine already exports: a vertical mirror after a quarter turn IS a reflection
 * about a diagonal.
 *
 * Which diagonal, checked on locations rather than assumed: mirror(rotCW(n)) =
 * mirror(e) = w, and `NORTHWEST_SOUTHEAST_REFLECTION_LOCATION_MAP` maps n to w —
 * so CW composes to NW-SE and CCW to NE-SW. (Getting these the wrong way round
 * labels every diagonal result with the opposite axis while leaving the counts
 * identical, which is exactly the kind of error a bucket profile cannot catch.)
 */
const DIAGONAL_REFLECTIONS: readonly {
  readonly axis: ClosureReflectionAxis;
  readonly label: string;
  readonly map: (start: string) => string | undefined;
}[] = [
  {
    axis: "northeast-southwest",
    label: "Mirrored (NE-SW)",
    map: (start) =>
      VERTICAL_MIRROR_PLACEMENT_MAP[QUARTER_PLACEMENT_MAP_CCW[start] ?? ""],
  },
  {
    axis: "northwest-southeast",
    label: "Mirrored (NW-SE)",
    map: (start) =>
      VERTICAL_MIRROR_PLACEMENT_MAP[QUARTER_PLACEMENT_MAP_CW[start] ?? ""],
  },
];

/**
 * Every admissible closure for a realized placement pair, in a stable order:
 * plain first, then the LOOP catalogue in the app's own order, then the
 * diagonal reflections.
 *
 * An empty array means the walk is FREEFORM — it may return to its own start
 * seam, but no transform in the app's vocabulary turns it into a LOOP. Callers
 * drop those.
 */
export function admissibleClosures(
  startPlacement: GridPlacement | string,
  endPlacement: GridPlacement | string,
  options: ClosureOptions = {}
): readonly AdmissibleClosure[] {
  const opts = { ...DEFAULTS, ...options };
  const start = String(startPlacement);
  const end = String(endPlacement);
  const placementPair = `${start},${end}`;
  const closures: AdmissibleClosure[] = [];

  // The unit already closes. No transform is needed and none is asserted: one
  // pass of the unit IS the circle.
  if (start === end) {
    closures.push({
      id: "plain",
      family: "plain",
      loopType: null,
      period: null,
      reflectionAxis: null,
      label: "Plain",
      circleMultiplier: 1,
    });
  }

  for (const facts of LOOP_TYPE_FACTS) {
    if (!opts.includeRewound && facts.loopType === LOOPType.REWOUND) continue;
    if (!opts.includeCompoundLOOPs && facts.compound) continue;

    const periods =
      facts.periodSensitive || opts.quarteredPeriodBlindTypes
        ? [Period.HALVED, Period.QUARTERED]
        : [Period.HALVED];

    for (const period of periods) {
      if (!isLOOPValidForPlacementPair(facts.loopType, placementPair, period)) {
        continue;
      }

      closures.push({
        id: `${facts.loopType}@${period}`,
        family: "loop",
        loopType: facts.loopType,
        period,
        reflectionAxis: null,
        label: labelFor(facts.loopType, period),
        circleMultiplier:
          period === Period.QUARTERED
            ? facts.quarteredMultiplier
            : facts.halvedMultiplier,
      });
    }
  }

  if (opts.includeDiagonalReflections) {
    for (const { axis, label, map } of DIAGONAL_REFLECTIONS) {
      if (map(start) !== end) continue;
      closures.push({
        id: `mirrored:${axis}`,
        family: "reflection",
        loopType: null,
        period: null,
        reflectionAxis: axis,
        label,
        circleMultiplier: REFLECTION_MULTIPLIER,
      });
    }
  }

  return closures;
}

/**
 * True when no transform in the app's vocabulary closes this pair — the
 * definition of the freeform output the redesign exists to stop emitting.
 */
export function isFreeformPair(
  startPlacement: GridPlacement | string,
  endPlacement: GridPlacement | string,
  options: ClosureOptions = {}
): boolean {
  return admissibleClosures(startPlacement, endPlacement, options).length === 0;
}
