/**
 * LOOPSpec — Compositional LOOP type specification
 *
 * Single source of truth for per-prop, per-component LOOP definitions.
 * Replaces the flat LOOPType string enum for new compositional logic.
 *
 * Phase 1 of the LOOPSpec compositional migration.
 * Nothing imports this file yet — pure type definitions and utilities.
 */

import {
  DEFAULT_FLIPPED_AXIS,
  DEFAULT_MIRRORED_AXIS,
  isReflectionAxis,
  type ReflectionAxis,
} from "./placement-maps/strict-loop-placement-maps.js";


/**
 * The space in which a LOOP component operates.
 *
 * - `location`: grid locations transform between passes (classic LOOPs)
 * - `orientation`: orientations transform between passes (locations stay pinned)
 * - `both`: detected in both spaces simultaneously
 */
export type LOOPDomain = "location" | "orientation" | "both";


/**
 * Canonical LOOP component primitives.
 *
 * The 6 user-facing transformation primitives plus 3 reserved orientation
 * primitives that are detected internally but never surfaced to UI consumers.
 * Filter reserved values via RESERVED_ORIENTATION_PRIMITIVES.
 */
export enum LOOPComponent {
  // --- User-facing transformation primitives ---
  ROTATED = "rotated", // 180° or 90° location rotation
  MIRRORED = "mirrored", // Reflection; legacy default is the north-south axis
  FLIPPED = "flipped", // Reflection; legacy default is the east-west axis
  SWAPPED = "swapped", // Left/right hand exchange
  INVERTED = "inverted", // PRO ↔ ANTI motion direction flip
  REWOUND = "rewound", // Time reversal (plays backward)

  // Detected by the engine but NEVER surfaced to UI consumers.
  // Use RESERVED_ORIENTATION_PRIMITIVES to filter these out.
  ZONE_HOLD_INVERT = "zone_hold_invert", // all steps stay in the same radial zone; orientations invert in-zone
  ZONE_HOLD_FLIP = "zone_hold_flip", // all steps stay in the same nonradial zone; orientations flip in-zone
  ZONE_CROSS = "zone_cross", // steps alternate radial/nonradial zones across the cycle
}

/**
 * LOOP components that are detected internally but never surfaced to UI.
 * Introduced as a reserved taxonomy for orientation primitives not yet
 * fully explored. UI consumers should filter these out.
 */
export const RESERVED_ORIENTATION_PRIMITIVES = new Set<LOOPComponent>([
  LOOPComponent.ZONE_HOLD_INVERT,
  LOOPComponent.ZONE_HOLD_FLIP,
  LOOPComponent.ZONE_CROSS,
]);


/** How a component is applied: expand multiplies length by `period`;
 *  overlay applies in place over the final sequence (x1 length).
 *  Absent = "expand" (all pre-existing specs unchanged). */
export type ComponentMode = "expand" | "overlay";

/**
 * A single component active on a prop, paired with its operating domain
 * and the period (number of passes) at which this component cycles.
 *
 * The component itself is the KEY in the Map — it is NOT stored here redundantly.
 */
export interface ComponentSpec {
  readonly period: number;
  readonly domain?: LOOPDomain;
  readonly mode?: ComponentMode;
  readonly reflectionAxis?: ReflectionAxis;
}

/**
 * Per-prop LOOP specification (runtime form).
 *
 * Uses ReadonlyMap<LOOPComponent, ComponentSpec> for type-safe runtime access.
 * Not directly JSON-serializable — use the wire format for persistence.
 */
export interface PropLOOPSpec {
  readonly components: ReadonlyMap<LOOPComponent, ComponentSpec>;
}

/**
 * Full compositional LOOP specification for a sequence.
 *
 * Specifies independent per-prop transformations for left and right.
 * When both props have the same components and periods, the LOOP is symmetric.
 * Both props are optional — a spec may apply to only one prop.
 */
export interface LOOPSpec {
  readonly left?: PropLOOPSpec;
  readonly right?: PropLOOPSpec;
}

// WIRE FORMAT TYPES (JSON / Firestore safe)

/**
 * Wire form of a single component spec (plain object, JSON-serializable).
 * The component key is NOT stored here — it is the key in PropLOOPSpecWire.
 */
export interface ComponentSpecWire {
  period: number;
  domain?: LOOPDomain;
  mode?: ComponentMode;
  reflectionAxis?: ReflectionAxis;
}

/**
 * Wire form of a per-prop LOOP spec.
 * Flat Record — keys are LOOPComponent string values, values are ComponentSpecWire.
 * Firestore shape: { "rotated": { "period": 4 } }
 */
export type PropLOOPSpecWire = Record<string, ComponentSpecWire>;

/**
 * Wire form of a full LOOPSpec (JSON / Firestore safe).
 * Left and right are optional — a spec may apply to only one prop.
 */
export interface LOOPSpecWire {
  left?: PropLOOPSpecWire;
  right?: PropLOOPSpecWire;
}

// WIRE ↔ RUNTIME CONVERTERS

function propSpecToWire(spec: PropLOOPSpec): PropLOOPSpecWire {
  const wire: PropLOOPSpecWire = {};
  for (const [key, value] of spec.components) {
    const entry: ComponentSpecWire = { period: value.period };
    if (value.domain !== undefined) {
      entry.domain = value.domain;
    }
    if (value.mode !== undefined) {
      entry.mode = value.mode;
    }
    if (value.reflectionAxis !== undefined) {
      entry.reflectionAxis = value.reflectionAxis;
    }
    wire[key] = entry;
  }
  return wire;
}

function propSpecFromWire(wire: PropLOOPSpecWire): PropLOOPSpec {
  const components = new Map<LOOPComponent, ComponentSpec>();
  for (const [key, value] of Object.entries(wire)) {
    const spec: ComponentSpec = {
      period: value.period,
      ...(value.domain !== undefined ? { domain: value.domain } : {}),
      ...(value.mode !== undefined ? { mode: value.mode } : {}),
      ...(value.reflectionAxis !== undefined
        ? { reflectionAxis: value.reflectionAxis }
        : {}),
    };
    components.set(key as LOOPComponent, spec);
  }
  return { components };
}

/**
 * Serialize a LOOPSpec to its wire form for JSON / Firestore storage.
 */
export function loopSpecToWire(spec: LOOPSpec): LOOPSpecWire {
  const wire: LOOPSpecWire = {};
  if (spec.left !== undefined) wire.left = propSpecToWire(spec.left);
  if (spec.right !== undefined) wire.right = propSpecToWire(spec.right);
  return wire;
}

/**
 * Deserialize a LOOPSpec from its wire form.
 */
export function loopSpecFromWire(
  wire: LOOPSpecWire & {
    /** @deprecated Legacy display-color key for the left hand. */
    blue?: PropLOOPSpecWire;
    /** @deprecated Legacy display-color key for the right hand. */
    red?: PropLOOPSpecWire;
  }
): LOOPSpec {
  const left = wire.left ?? wire.blue;
  const right = wire.right ?? wire.red;
  return {
    ...(left !== undefined ? { left: propSpecFromWire(left) } : {}),
    ...(right !== undefined ? { right: propSpecFromWire(right) } : {}),
  };
}


/** Two-pass cycle (180° rotation or any halved pattern). */
export const PERIOD_HALVED = 2;

/** Four-pass cycle (90° rotation or quartered pattern). */
export const PERIOD_QUARTERED = 4;

/** Eight-pass cycle (45° rotation or octaved pattern). */
export const PERIOD_OCTAVED = 8;

/** Greatest common divisor (Euclidean). Module-private. */
function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** Least common multiple. Module-private. */
function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

/**
 * Compute the overall period of a LOOPSpec.
 *
 * The spec period is the LCM of all active component periods across both props.
 * Returns 1 for empty specs (no active components).
 */
export function loopSpecPeriod(spec: LOOPSpec): number {
  const periods: number[] = [];

  if (spec.left !== undefined) {
    for (const compSpec of spec.left.components.values()) {
      periods.push(compSpec.period);
    }
  }
  if (spec.right !== undefined) {
    for (const compSpec of spec.right.components.values()) {
      periods.push(compSpec.period);
    }
  }

  if (periods.length === 0) return 1;
  return periods.reduce(lcm, 1);
}


/**
 * Build a PropLOOPSpec with a single active component at the given period.
 */
export function singleComponent(
  component: LOOPComponent,
  period: number,
  domain?: LOOPDomain
): PropLOOPSpec {
  const spec: ComponentSpec =
    domain !== undefined ? { period, domain } : { period };
  return { components: new Map([[component, spec]]) };
}

/**
 * Build a symmetric LOOPSpec where left and right share identical specs.
 */
export function symmetricSpec(
  components: ReadonlyMap<LOOPComponent, ComponentSpec>
): LOOPSpec {
  const prop: PropLOOPSpec = { components };
  return { left: prop, right: prop };
}

/**
 * Merge all active components across both props, keeping the max period per component.
 */
export function allActiveComponents(
  spec: LOOPSpec
): ReadonlyMap<LOOPComponent, ComponentSpec> {
  const result = new Map<LOOPComponent, ComponentSpec>();
  for (const prop of [spec.left, spec.right]) {
    if (!prop) continue;
    for (const [comp, cSpec] of prop.components) {
      const existing = result.get(comp);
      if (!existing || existing.period < cSpec.period) {
        result.set(comp, cSpec);
      }
    }
  }
  return result;
}

/**
 * Returns true if the LOOPSpec has no active components on either prop.
 */
export function isEmptySpec(spec: LOOPSpec): boolean {
  const leftEmpty = !spec.left || spec.left.components.size === 0;
  const rightEmpty = !spec.right || spec.right.components.size === 0;
  return leftEmpty && rightEmpty;
}

/**
 * Returns true if two PropLOOPSpecs are structurally equal
 * (same components, same periods, same domains).
 */
export function specsAreEqual(
  a: PropLOOPSpec | undefined,
  b: PropLOOPSpec | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.components.size !== b.components.size) return false;
  for (const [key, aSpec] of a.components) {
    const bSpec = b.components.get(key);
    if (!bSpec) return false;
    if (aSpec.period !== bSpec.period) return false;
    if (aSpec.domain !== bSpec.domain) return false;
    if (aSpec.mode !== bSpec.mode) return false;
    if (aSpec.reflectionAxis !== bSpec.reflectionAxis) return false;
  }
  return true;
}

/**
 * Resolve the axis for a reflection component.
 *
 * Missing axes preserve existing serialized behavior: MIRRORED uses the
 * north-south axis and FLIPPED uses the east-west axis.
 */
export function getReflectionAxis(
  component: LOOPComponent,
  componentSpec: ComponentSpec
): ReflectionAxis | null {
  if (component === LOOPComponent.MIRRORED) {
    return componentSpec.reflectionAxis ?? DEFAULT_MIRRORED_AXIS;
  }
  if (component === LOOPComponent.FLIPPED) {
    return componentSpec.reflectionAxis ?? DEFAULT_FLIPPED_AXIS;
  }
  return null;
}

/**
 * Apply an explicit reflection axis to every reflection component in a spec.
 */
export function loopSpecWithReflectionAxis(
  spec: LOOPSpec,
  reflectionAxis: ReflectionAxis
): LOOPSpec {
  const updateProp = (
    prop: PropLOOPSpec | undefined
  ): PropLOOPSpec | undefined => {
    if (!prop) return undefined;
    const components = new Map(prop.components);
    for (const component of [
      LOOPComponent.MIRRORED,
      LOOPComponent.FLIPPED,
    ]) {
      const componentSpec = components.get(component);
      if (componentSpec) {
        components.set(component, { ...componentSpec, reflectionAxis });
      }
    }
    return { components };
  };

  const left = updateProp(spec.left);
  const right = updateProp(spec.right);
  return {
    ...(left ? { left } : {}),
    ...(right ? { right } : {}),
  };
}

/**
 * A PropLOOPSpec with no active components.
 */
export const EMPTY_PROP_SPEC: PropLOOPSpec = { components: new Map() };


/**
 * Convert a legacy flat LOOPType string + integer period to a compositional LOOPSpec.
 *
 * Uses string.includes() parsing to detect which components are present.
 * Both left and right receive the same PropLOOPSpec (symmetric by definition
 * for all legacy LOOP types).
 *
 * @param loopType  A LOOPType enum value or its string equivalent
 * @param period    Integer period (2 = halved, 4 = quartered, 8 = octaved)
 */
export function loopSpecFromLegacy(loopType: string, period: number): LOOPSpec {
  const components = new Map<LOOPComponent, ComponentSpec>();

  // REWOUND is a standalone type — not combined with positional transforms.
  if (loopType === "rewound") {
    components.set(LOOPComponent.REWOUND, { period });
    return symmetricSpec(components);
  }

  if (loopType.includes("rotated")) {
    components.set(LOOPComponent.ROTATED, { period });
  }
  if (loopType.includes("mirrored")) {
    components.set(LOOPComponent.MIRRORED, { period });
  }
  if (loopType.includes("flipped")) {
    components.set(LOOPComponent.FLIPPED, { period });
  }
  if (loopType.includes("swapped")) {
    components.set(LOOPComponent.SWAPPED, { period });
  }
  if (loopType.includes("inverted")) {
    components.set(LOOPComponent.INVERTED, { period });
  }

  return symmetricSpec(components);
}

/**
 * Convert a legacy flat LOOPType + requested rotation rhythm to the canonical
 * compositional spec used by sequence generation.
 *
 * Rotation is the only legacy component with a genuine period-4 orbit.
 * Mirror, flip, swap, and inversion remain period-2 transforms even when the
 * requested rhythm is quartered. Rewound is likewise always a two-pass cycle.
 *
 * `loopSpecFromLegacy` intentionally keeps its uniform-period compatibility
 * behavior. New generation paths should use this converter instead.
 */
export function loopSpecFromLegacyRhythm(
  loopType: string,
  rotationPeriod: number
): LOOPSpec {
  const spec = loopSpecFromLegacy(loopType, 2);
  const propSpec = spec.left ?? spec.right;

  if (
    rotationPeriod === 2 ||
    !propSpec?.components.has(LOOPComponent.ROTATED)
  ) {
    return spec;
  }

  const components = new Map(propSpec.components);
  components.set(LOOPComponent.ROTATED, { period: rotationPeriod });
  return symmetricSpec(components);
}


/**
 * A validation error from validateLOOPSpec.
 */
export interface LOOPSpecValidationError {
  readonly rule: string;
  readonly message: string;
}

/**
 * Validate a LOOPSpec for structural and semantic consistency.
 *
 * Checks:
 * - minimum_period: every active component must have a period >= 2
 * - rewound_exclusivity: REWOUND cannot be combined with other components
 * - swapped_symmetry: SWAPPED must be active on both props or neither,
 *   and when active on both, both must have the same period
 *
 * Returns an empty array if the spec is valid.
 */
export function validateLOOPSpec(spec: LOOPSpec): LOOPSpecValidationError[] {
  const errors: LOOPSpecValidationError[] = [];

  const activePropEntries = (
    [
      ["left", spec.left],
      ["right", spec.right],
    ] as Array<["left" | "right", PropLOOPSpec | undefined]>
  ).filter(
    (entry): entry is ["left" | "right", PropLOOPSpec] => entry[1] !== undefined
  );

  for (const [propName, propSpec] of activePropEntries) {
    for (const [comp, compSpec] of propSpec.components) {
      if (compSpec.period < 2) {
        errors.push({
          rule: "minimum_period",
          message: `${propName}.${comp}: period must be >= 2, got ${compSpec.period}`,
        });
      }

      if (compSpec.mode === "overlay" && comp !== LOOPComponent.INVERTED) {
        errors.push({
          rule: "overlay_legality",
          message: `${propName}.${comp}: overlay mode is only supported for INVERTED (location-preserving)`,
        });
      }

      if (
        compSpec.reflectionAxis !== undefined &&
        comp !== LOOPComponent.MIRRORED &&
        comp !== LOOPComponent.FLIPPED
      ) {
        errors.push({
          rule: "reflection_axis_component",
          message: `${propName}.${comp}: reflectionAxis is only valid for MIRRORED or FLIPPED`,
        });
      }

      if (
        compSpec.reflectionAxis !== undefined &&
        !isReflectionAxis(compSpec.reflectionAxis)
      ) {
        errors.push({
          rule: "reflection_axis_value",
          message: `${propName}.${comp}: unknown reflection axis "${String(compSpec.reflectionAxis)}"`,
        });
      }
    }

    if (
      propSpec.components.has(LOOPComponent.REWOUND) &&
      propSpec.components.size > 1
    ) {
      errors.push({
        rule: "rewound_exclusivity",
        message: `${propName}: REWOUND cannot compose with other components`,
      });
    }
  }

  const leftHasSwap = spec.left?.components.has(LOOPComponent.SWAPPED) ?? false;
  const rightHasSwap = spec.right?.components.has(LOOPComponent.SWAPPED) ?? false;
  if (leftHasSwap !== rightHasSwap) {
    errors.push({
      rule: "swapped_symmetry",
      message: "SWAPPED must be present in both props or neither",
    });
  }
  if (leftHasSwap && rightHasSwap) {
    const leftPeriod = spec.left!.components.get(LOOPComponent.SWAPPED)!.period;
    const rightPeriod = spec.right!.components.get(LOOPComponent.SWAPPED)!.period;
    if (leftPeriod !== rightPeriod) {
      errors.push({
        rule: "swapped_symmetry",
        message: `SWAPPED period mismatch: left=${leftPeriod}, right=${rightPeriod}`,
      });
    }
  }

  return errors;
}
