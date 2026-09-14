/**
 * LOOP Type Utility Functions
 *
 * Standalone pure functions extracted from the deleted LOOPTypeResolver class.
 * - parseLoopComponents: parse a LOOPType string into a Set of LOOPComponents
 * - generateLOOPType: map a Set of LOOPComponents to a LOOPType, or null when
 *   no implemented LOOP type matches that exact combination
 * - canExtendCombo / isImplementedCombo: combo-builder gating helpers
 * - formatLOOPTypeForDisplay: human-readable formatting of a LOOPType string
 */

import { LOOPType, ROTATED_LOOP_TYPES } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  DEFAULT_HAND_RELATIONSHIP,
  isHandRelationship,
  relationshipReflectionAxis,
} from "$lib/shared/create/domain/hand-relationship";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  getLOOPSpecExpansionMultiplier,
  loopSpecFromWire,
  type LOOPSpecWire,
  type PropLOOPSpecWire,
  type ReflectionAxis,
} from "@tka/sequence-engine/loop";

/**
 * Parse a LOOPType string into a Set of LOOPComponent values.
 * Uses substring matching against the 6 transformation primitives.
 */
export function parseLoopComponents(loopType: LOOPType | string | null | undefined): Set<LOOPComponent> {
  const components = new Set<LOOPComponent>();
  if (!loopType) return components;

  if (loopType.includes("rotated")) components.add(LOOPComponent.ROTATED);
  if (loopType.includes("mirrored")) components.add(LOOPComponent.MIRRORED);
  if (loopType.includes("flipped")) components.add(LOOPComponent.FLIPPED);
  if (loopType.includes("swapped")) components.add(LOOPComponent.SWAPPED);
  if (loopType.includes("inverted")) components.add(LOOPComponent.INVERTED);
  if (loopType.includes("rewound")) components.add(LOOPComponent.REWOUND);

  return components;
}

/**
 * The single source of truth for which component combinations have a real,
 * generatable LOOP type behind them. Anything not in this table is not
 * offered by the combo builder and must never be silently coerced.
 *
 * The UI models spatial reflection as MIRRORED plus an explicit axis.
 * FLIPPED remains here as a legacy single-component alias for east-west
 * reflection; it is not a second independent reflection component in new
 * combinations. REWOUND remains temporal and standalone. Every subset of
 * {MIRRORED, ROTATED, SWAPPED, INVERTED} is implemented; ROTATED_SWAPPED_INVERTED (the
 * former sole gap) is valid per MCP compositional LOOP theory: ROTATE is
 * inner, SWAP/INVERT compose as outer, and all beta positions are swap
 * fixed points (inversion is position-free).
 */
const IMPLEMENTED_COMBOS: ReadonlyArray<readonly [ReadonlySet<LOOPComponent>, LOOPType]> = [
  [new Set([LOOPComponent.ROTATED]), LOOPType.ROTATED],
  [new Set([LOOPComponent.MIRRORED]), LOOPType.MIRRORED],
  [new Set([LOOPComponent.FLIPPED]), LOOPType.FLIPPED],
  [new Set([LOOPComponent.SWAPPED]), LOOPType.SWAPPED],
  [new Set([LOOPComponent.INVERTED]), LOOPType.INVERTED],
  [new Set([LOOPComponent.REWOUND]), LOOPType.STRICT_REWOUND],
  [new Set([LOOPComponent.MIRRORED, LOOPComponent.INVERTED]), LOOPType.MIRRORED_INVERTED],
  [new Set([LOOPComponent.ROTATED, LOOPComponent.INVERTED]), LOOPType.ROTATED_INVERTED],
  [new Set([LOOPComponent.SWAPPED, LOOPComponent.INVERTED]), LOOPType.SWAPPED_INVERTED],
  [new Set([LOOPComponent.MIRRORED, LOOPComponent.ROTATED]), LOOPType.MIRRORED_ROTATED],
  [new Set([LOOPComponent.MIRRORED, LOOPComponent.SWAPPED]), LOOPType.MIRRORED_SWAPPED],
  [new Set([LOOPComponent.ROTATED, LOOPComponent.SWAPPED]), LOOPType.ROTATED_SWAPPED],
  [
    new Set([LOOPComponent.MIRRORED, LOOPComponent.INVERTED, LOOPComponent.ROTATED]),
    LOOPType.MIRRORED_INVERTED_ROTATED,
  ],
  [
    new Set([LOOPComponent.MIRRORED, LOOPComponent.ROTATED, LOOPComponent.SWAPPED]),
    LOOPType.MIRRORED_ROTATED_SWAPPED,
  ],
  [
    new Set([LOOPComponent.MIRRORED, LOOPComponent.SWAPPED, LOOPComponent.INVERTED]),
    LOOPType.MIRRORED_SWAPPED_INVERTED,
  ],
  [
    new Set([LOOPComponent.ROTATED, LOOPComponent.SWAPPED, LOOPComponent.INVERTED]),
    LOOPType.ROTATED_SWAPPED_INVERTED,
  ],
  [
    new Set([
      LOOPComponent.MIRRORED,
      LOOPComponent.ROTATED,
      LOOPComponent.INVERTED,
      LOOPComponent.SWAPPED,
    ]),
    LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  ],
];

function setsEqual(a: ReadonlySet<LOOPComponent>, b: ReadonlySet<LOOPComponent>): boolean {
  if (a.size !== b.size) return false;
  for (const c of a) if (!b.has(c)) return false;
  return true;
}

function isSuperset(superset: ReadonlySet<LOOPComponent>, subset: ReadonlySet<LOOPComponent>): boolean {
  for (const c of subset) if (!superset.has(c)) return false;
  return true;
}

/**
 * Map a set of LOOPComponents to a LOOPType enum value.
 *
 * Returns null when no implemented LOOP type matches the exact combination —
 * callers must treat that as "not supported", never coerce it to a default.
 * An empty set keeps the legacy ROTATED default (the "loop off" placeholder).
 */
export function generateLOOPType(components: Set<LOOPComponent>): LOOPType | null {
  if (components.size === 0) return LOOPType.ROTATED;

  for (const [combo, loopType] of IMPLEMENTED_COMBOS) {
    if (setsEqual(combo, components)) return loopType;
  }

  return null;
}

/** True when the exact component set maps to an implemented LOOP type. */
export function isImplementedCombo(components: Set<LOOPComponent>): boolean {
  return generateLOOPType(components) !== null;
}

/**
 * Combo-builder gating: can `candidate` be added to the current selection and
 * still lead to SOME implemented combo (as an intermediate or final state)?
 *
 * Superset reachability, not exact match, so a user building toward the
 * 4-component combo can pass through unmapped intermediates like
 * {rotated, inverted, swapped}. The Apply button separately requires the
 * final set to map exactly (isImplementedCombo).
 */
export function canExtendCombo(
  current: ReadonlySet<LOOPComponent>,
  candidate: LOOPComponent
): boolean {
  const target = new Set(current);
  target.add(candidate);

  for (const [combo] of IMPLEMENTED_COMBOS) {
    if (isSuperset(combo, target)) return true;
  }

  return false;
}

export interface LoopRhythm {
  rotationInterval?: 2 | 4; // default 2
  inversionInterval?: 2 | 4; // default 2
  inversionMode?: "expand" | "overlay"; // default "expand"
  reflectionAxis?: ReflectionAxis; // default depends on the legacy LOOP type
}

/**
 * Build a symmetric wire-form LOOPSpec from the UI component set + rhythm.
 * Returns null for combos with no implemented mapping (same gate as
 * generateLOOPType — the combo overlay's gating stays the single source
 * of truth for which component SETS are allowed).
 */
export function buildLoopSpec(
  components: Set<LOOPComponent>,
  rhythm: LoopRhythm
): LOOPSpecWire | null {
  if (components.size === 0) return null;
  if (generateLOOPType(components) === null) return null;

  const prop: PropLOOPSpecWire = {};
  for (const comp of components) {
    if (comp === LOOPComponent.ROTATED) {
      prop.rotated = { period: rhythm.rotationInterval ?? 2 };
    } else if (comp === LOOPComponent.INVERTED) {
      prop.inverted = {
        period: rhythm.inversionInterval ?? 2,
        ...(rhythm.inversionMode === "overlay" ? { mode: "overlay" as const } : {}),
      };
    } else if (
      comp === LOOPComponent.MIRRORED ||
      comp === LOOPComponent.FLIPPED
    ) {
      prop[comp] = {
        period: 2,
        reflectionAxis:
          rhythm.reflectionAxis ??
          (comp === LOOPComponent.FLIPPED ? "east-west" : "north-south"),
      };
    } else {
      prop[comp] = { period: 2 };
    }
  }
  return { left: prop, right: prop };
}

export interface ResolvedLoopConfig {
  /** Effective period after gating quartered→halved for non-rotation types. */
  period: "halved" | "quartered";
  /** Wire spec with the correct expander multiplier, or undefined for combos with no implemented mapping. */
  loopSpecWire: LOOPSpecWire | undefined;
  /** The rhythm the wire was built from (provenance / UI echo). */
  loopRhythm: LoopRhythm;
}

/**
 * THE single source of truth for turning a LOOP type + requested period into
 * the effective period + compositional wire spec. Shared by the interactive
 * generator (config-mapper) and EVERY deck/preview generation path so none of
 * them can silently skip the two length-invariance guards:
 *
 *  1. Quartered is coerced to halved for non-ROTATED loop types. Only rotation
 *     has a genuine period-4 orbit; the period-2 transforms (mirror / flip /
 *     swap / invert) asked as quartered extend to a byte-identical double that
 *     reduceToMinimalLoop strips back to HALF the requested length — the deck's
 *     "I asked for 16 and got 8" bug.
 *  2. The wire spec makes the orchestrator divide the requested length by the
 *     TRUE expander multiplier (expanderMultiplier), not the raw period (2/4).
 *     Without it, mirror+rotated (true period 4) overshoots to 2× on the halved
 *     path (a requested 16 comes back 32).
 *
 * Even with both guards, a degenerate seed can still reduce below the requested
 * length occasionally (e.g. a 2-step quartered-rotation seed); the exact-length
 * generator's step-count re-roll is the backstop for that residual.
 */
export function resolveLoopConfig(
  loopType: LOOPType | string,
  requestedPeriod: string | undefined,
  rhythmOpts?: {
    inversionInterval?: 2 | 4;
    inversionMode?: "expand" | "overlay";
    reflectionAxis?: ReflectionAxis;
    /**
     * A reflection hand relationship (Mirrored, Flipped) only survives LOOP
     * transforms that commute with it. Quartered rotation and the diagonal
     * axes do not, so they are coerced here rather than blocked: the LOOP
     * card, the length stepper and the engine all read this one resolved
     * value. Accepts the raw config field, so an unknown string reads as free.
     */
    handRelationship?: string | null;
  },
): ResolvedLoopConfig {
  const requestedRelationship = rhythmOpts?.handRelationship;
  const relationship = isHandRelationship(requestedRelationship)
    ? requestedRelationship
    : DEFAULT_HAND_RELATIONSHIP;
  const keptAxis = relationshipReflectionAxis(relationship);
  const supportsQuartered =
    ROTATED_LOOP_TYPES.has(loopType as LOOPType) && keptAxis === null;
  const period: "halved" | "quartered" =
    supportsQuartered && requestedPeriod === "quartered" ? "quartered" : "halved";
  const requestedAxis: ReflectionAxis =
    rhythmOpts?.reflectionAxis ??
    (String(loopType).includes("flipped") ? "east-west" : "north-south");
  const diagonal =
    requestedAxis === "northeast-southwest" ||
    requestedAxis === "northwest-southeast";
  const loopRhythm: LoopRhythm = {
    rotationInterval: period === "quartered" ? 4 : 2,
    inversionInterval: rhythmOpts?.inversionInterval ?? 2,
    inversionMode: rhythmOpts?.inversionMode ?? "expand",
    reflectionAxis: keptAxis && diagonal ? keptAxis : requestedAxis,
  };
  const loopSpecWire =
    buildLoopSpec(parseLoopComponents(loopType), loopRhythm) ?? undefined;
  return { period, loopSpecWire, loopRhythm };
}

/**
 * Total length multiplier of the spec's EXPANDER stages (overlay contributes
 * x1). Seed length = total / this.
 *
 * Mirrors the engine's stage semantics in spec-executor.ts exactly — the
 * naive product-of-periods formula is WRONG (Task 4 finding):
 *  - Fuseable expanders (mirrored/flipped/swapped/inverted) grouped by
 *    period run as ONE FusedExecutor stage per period group (x period once
 *    per group, not per component).
 *  - ROTATED runs as a separate stage ONLY when no fuseable group shares
 *    its period, OR a mirror/flip shares its period. When only swap/invert
 *    share rotation's period, FusedExecutor absorbs the rotation
 *    (fuseableAtSamePeriod branch) — rotation contributes x1.
 */
export function expanderMultiplier(wire: LOOPSpecWire): number {
  return getLOOPSpecExpansionMultiplier(loopSpecFromWire(wire));
}

/**
 * True when the wire spec declares INVERTED in "expand" mode (mode absent or
 * "expand") rather than "overlay". Used by the orchestrator's degenerate-seed
 * guard: an expand-mode inversion multiplies length by its period, so a
 * 1-step half-seed carries no visible pro/anti flip for it to invert (a
 * single step is dash-only at the seed boundary). Overlay-mode inversion
 * applies in place over the fully-expanded sequence and has no such
 * constraint, so it does not trigger the guard.
 */
export function specHasExpandInversion(wire: LOOPSpecWire): boolean {
  const prop = wire.left ?? wire.right;
  if (!prop) return false;
  const inverted = prop.inverted;
  return !!inverted && inverted.mode !== "overlay";
}

/**
 * Format a LOOPType string for human-readable UI display.
 */
export function formatLOOPTypeForDisplay(loopType: LOOPType | string): string {
  const readable = loopType
    .replace(/^strict_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l: string) => l.toUpperCase());

  if (readable.length > 20) {
    const parts = readable.split(" ");
    if (parts.length > 2) {
      return `${parts[0]} + ${parts.length - 1} more`;
    }
  }

  return readable;
}
