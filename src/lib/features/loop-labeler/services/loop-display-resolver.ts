import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceEntry } from "$lib/shared/loop-labeler/domain/sequence-models";
import type { ComponentId } from "../domain/constants/loop-components";
import {
  LOOPComponent,
  RESERVED_ORIENTATION_PRIMITIVES,
  type LOOPDomain,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import type {
  LOOPSpecWire,
  ReflectionAxis,
} from "@tka/sequence-engine/loop";
import {
  Period,
  type LOOPType,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { loopDetector } from "./loop-detector";
import { convert as convertSequenceToEntry } from "$lib/features/choreo-card/services/sequence-to-entry-converter";
import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
import { canonicalJSON } from "$lib/shared/foundation/utils/canonical-json";

export interface LoopDisplay {
  components: Set<LOOPComponent>;
  /**
   * Per-component domain annotation. "location" | "orientation" | "both"
   */
  componentDomains?: Partial<Record<LOOPComponent, LOOPDomain>>;
  /**
   * Components whose wire spec declares mode "overlay" (applied in place
   * over the fully-expanded sequence, rather than expanding its length).
   * Icon-strip renderers show these LAST, after a faded separator dot.
   * Absent/empty when nothing is in overlay mode (the common case).
   */
  overlayComponents?: Set<LOOPComponent>;
  /** Reflection axis shared by the surfaced reflection components. */
  reflectionAxis?: ReflectionAxis;
  /**
   * Integer LOOP period: 1, 2, 4, or 8.
   */
  period: number;
  /**
   * @deprecated Use `period` instead.
   */
  rotationPeriod?: Period;
  /**
   * @deprecated Use `period` instead.
   */
  inversionPeriod?: Period;
}

export type LoopDisplayInput = (SequenceData | SequenceEntry) & { loopSpec?: LOOPSpecWire };

/**
 * Telemetry payload fired when the stored loopSpec certificate's component
 * set disagrees with what live detection would find on the same steps.
 * The spec ALWAYS wins for display — this is observation only (D3).
 */
export type LoopDisplayMismatch = {
  sequenceId: string | null;
  specComponents: string[];
  detectedComponents: string[];
};

let mismatchHandler: ((m: LoopDisplayMismatch) => void) | null = null;

/**
 * Register a hook fired when resolveLoopDisplay detects the spec/detection
 * disagreement described above. Does not affect what resolveLoopDisplay
 * returns.
 */
export function onLoopDisplayMismatch(handler: (m: LoopDisplayMismatch) => void): void {
  mismatchHandler = handler;
}

function toLoopComponent(id: ComponentId): LOOPComponent | null {
  switch (id) {
    case "rotated":
      return LOOPComponent.ROTATED;
    case "mirrored":
      return LOOPComponent.MIRRORED;
    case "flipped":
      return LOOPComponent.FLIPPED;
    case "swapped":
      return LOOPComponent.SWAPPED;
    case "inverted":
      return LOOPComponent.INVERTED;
    case "rewound":
      return LOOPComponent.REWOUND;
    default:
      return null;
  }
}

function mapRotationInterval(
  interval: number | undefined
): Period | undefined {
  if (interval === 2) return Period.HALVED;
  if (interval === 4) return Period.QUARTERED;
  return undefined;
}

function onlyReflectionAxis(
  axes: ReadonlySet<ReflectionAxis>
): ReflectionAxis | undefined {
  return axes.size === 1 ? axes.values().next().value : undefined;
}

function reflectionAxisForComponents(
  components: ReadonlySet<LOOPComponent>
): ReflectionAxis | undefined {
  const axes = new Set<ReflectionAxis>();
  if (components.has(LOOPComponent.MIRRORED)) axes.add("north-south");
  if (components.has(LOOPComponent.FLIPPED)) axes.add("east-west");
  return onlyReflectionAxis(axes);
}

function isSequenceData(input: LoopDisplayInput): input is SequenceData {
  return Array.isArray((input as SequenceData).steps);
}

function getSequenceCacheKey(input: LoopDisplayInput): string | undefined {
  if (!input.id) return undefined;

  // Library variations can intentionally share an ID. The display contract
  // depends on the full sequence (or its certificate), not that label alone.
  return canonicalJSON(input);
}

function hasEnoughSteps(input: LoopDisplayInput): boolean {
  if (isSequenceData(input)) {
    return (input.steps?.length ?? 0) >= 2;
  }
  const raw = input.fullMetadata?.sequence ?? [];
  const actualSteps = raw.filter(
    (el) => typeof el.beat === "number" && el.beat >= 1
  );
  return actualSteps.length >= 2;
}

function toSequenceEntry(input: LoopDisplayInput): SequenceEntry {
  if (isSequenceData(input)) {
    return convertSequenceToEntry(input);
  }
  return input;
}

const displayCache = new Map<string, LoopDisplay>();

export function clearLoopDisplayCache(): void {
  displayCache.clear();
}

/**
 * Resolve active LOOP components and period.
 * On-demand path (actual steps) takes precedence over stored metadata.
 */
export function resolveLoopDisplay(input: LoopDisplayInput): LoopDisplay {
  const cacheKey = getSequenceCacheKey(input);
  const inputHasSteps = hasEnoughSteps(input);

  if (cacheKey) {
    const cached = displayCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const result = computeLoopDisplay(input);

  if (cacheKey && inputHasSteps) {
    displayCache.set(cacheKey, result);
  }
  return result;
}

/**
 * Compare the spec-derived component set against live detection on the same
 * steps and fire the mismatch hook when they disagree. Telemetry only — the
 * spec-derived display always wins (D3); a detection throw here must never
 * propagate and break display.
 */
function reportSpecDetectionMismatch(
  input: LoopDisplayInput,
  specComponents: Set<LOOPComponent>
): void {
  try {
    if (!hasEnoughSteps(input)) return;
    const entry = toSequenceEntry(input);
    const detection = loopDetector.detectLOOP(entry);

    const detectedComponents = new Set<LOOPComponent>();
    const detailed = detection.componentsDetailed ?? [];
    if (detailed.length > 0) {
      for (const d of detailed) {
        if (!RESERVED_ORIENTATION_PRIMITIVES.has(d.component)) detectedComponents.add(d.component);
      }
    } else {
      for (const id of detection.components) {
        const mapped = toLoopComponent(id);
        if (mapped && !RESERVED_ORIENTATION_PRIMITIVES.has(mapped)) detectedComponents.add(mapped);
      }
    }

    const specSorted = [...specComponents].sort();
    const detectedSorted = [...detectedComponents].sort();
    const agree =
      specSorted.length === detectedSorted.length &&
      specSorted.every((c, i) => c === detectedSorted[i]);
    if (agree) return;

    const mismatch: LoopDisplayMismatch = {
      sequenceId: input.id ?? null,
      specComponents: specSorted,
      detectedComponents: detectedSorted,
    };
    if (import.meta.env?.DEV) {
      console.debug("[loop-display-resolver] spec/detection mismatch", mismatch);
    }
    mismatchHandler?.(mismatch);
  } catch {
    // Detection failure must never break spec-derived display.
  }
}

function computeLoopDisplay(input: LoopDisplayInput): LoopDisplay {
  if (input.loopSpec) {
    const components = new Set<LOOPComponent>();
    const componentDomains = new Map<LOOPComponent, LOOPDomain>();
    const overlayComponents = new Set<LOOPComponent>();
    const reflectionAxes = new Set<ReflectionAxis>();
    let maxPeriod = 1;
    let rotationInterval: number | undefined;
    let inversionInterval: number | undefined;

    for (const prop of [input.loopSpec.left, input.loopSpec.right]) {
      if (!prop) continue;
      for (const [compKey, cSpec] of Object.entries(prop)) {
        const comp = compKey as LOOPComponent;
        if (RESERVED_ORIENTATION_PRIMITIVES.has(comp)) continue;
        components.add(comp);
        if (cSpec.domain) componentDomains.set(comp, cSpec.domain);
        else if (cSpec.mode === "overlay") componentDomains.set(comp, "orientation");
        if (cSpec.mode === "overlay") overlayComponents.add(comp);
        if (comp === LOOPComponent.MIRRORED) {
          reflectionAxes.add(cSpec.reflectionAxis ?? "north-south");
        } else if (comp === LOOPComponent.FLIPPED) {
          reflectionAxes.add(cSpec.reflectionAxis ?? "east-west");
        }
        maxPeriod = Math.max(maxPeriod, cSpec.period);
        if (comp === LOOPComponent.ROTATED) rotationInterval = cSpec.period;
        if (comp === LOOPComponent.INVERTED) inversionInterval = cSpec.period;
      }
    }

    reportSpecDetectionMismatch(input, components);

    return {
      components,
      period: maxPeriod,
      componentDomains: Object.fromEntries(componentDomains) as Partial<Record<LOOPComponent, LOOPDomain>>,
      overlayComponents: overlayComponents.size > 0 ? overlayComponents : undefined,
      reflectionAxis: onlyReflectionAxis(reflectionAxes),
      rotationPeriod: mapRotationInterval(rotationInterval),
      inversionPeriod: mapRotationInterval(inversionInterval),
    };
  }

  if (hasEnoughSteps(input)) {
    try {
      const entry = toSequenceEntry(input);
      const detection = loopDetector.detectLOOP(entry);

      const components = new Set<LOOPComponent>();
      const componentDomains: Partial<Record<LOOPComponent, LOOPDomain>> = {};

      const detailed = detection.componentsDetailed ?? [];
      if (detailed.length > 0) {
        for (const entry of detailed) {
          if (RESERVED_ORIENTATION_PRIMITIVES.has(entry.component)) continue;
          components.add(entry.component);
          if (entry.domain) {
            componentDomains[entry.component] = entry.domain;
          }
        }
      } else {
        for (const id of detection.components) {
          const mapped = toLoopComponent(id);
          if (mapped && !RESERVED_ORIENTATION_PRIMITIVES.has(mapped)) {
            components.add(mapped);
            componentDomains[mapped] = "location";
          }
        }
      }

      if (components.size > 0) {
        const period = detection.period ?? 2;
        return {
          components,
          componentDomains,
          period,
          reflectionAxis: reflectionAxisForComponents(components),
          rotationPeriod: components.has(LOOPComponent.ROTATED)
            ? mapRotationInterval(
                detection.transformationIntervals?.rotation
              ) ??
              (period === 4
                ? Period.QUARTERED
                : period === 2
                  ? Period.HALVED
                  : undefined)
            : undefined,
          inversionPeriod: components.has(LOOPComponent.INVERTED)
            ? mapRotationInterval(
                detection.transformationIntervals?.invert
              ) ??
              (period === 4
                ? Period.QUARTERED
                : period === 2
                  ? Period.HALVED
                  : undefined)
            : undefined,
        };
      }
    } catch {
      // Fall through
    }
  }

  if (isSequenceData(input) && input.components && input.components.length > 0) {
    const components = new Set<LOOPComponent>();
    const componentDomains: Partial<Record<LOOPComponent, LOOPDomain>> = {};
    for (const c of input.components) {
      if (!RESERVED_ORIENTATION_PRIMITIVES.has(c)) {
        components.add(c);
        const domain = input.componentDomains?.[c];
        if (domain) componentDomains[c] = domain;
        else componentDomains[c] = "location";
      }
    }
    if (components.size > 0) {
      const period = input.period ?? 2;
      return {
        components,
        componentDomains,
        period,
        reflectionAxis: reflectionAxisForComponents(components),
        rotationPeriod: components.has(LOOPComponent.ROTATED)
          ? period === 4 ? Period.QUARTERED : period === 2 ? Period.HALVED : undefined
          : undefined,
        inversionPeriod: components.has(LOOPComponent.INVERTED)
          ? period === 4 ? Period.QUARTERED : period === 2 ? Period.HALVED : undefined
          : undefined,
      };
    }
  }

  const storedLoopType = input.loopType as LOOPType | null | undefined;
  if (storedLoopType) {
    const parsed = parseLoopComponents(storedLoopType);
    const components = new Set<LOOPComponent>();
    const componentDomains: Partial<Record<LOOPComponent, LOOPDomain>> = {};
    for (const c of parsed) {
      if (!RESERVED_ORIENTATION_PRIMITIVES.has(c)) {
        components.add(c);
        componentDomains[c] = "location";
      }
    }
    if (components.size > 0) {
      const sd = isSequenceData(input) ? input : undefined;
      const period = sd?.period ?? (sd?.orientationCycleCount === 4 ? 4 : 2);
      return {
        components,
        componentDomains,
        period,
        reflectionAxis: reflectionAxisForComponents(components),
        rotationPeriod: components.has(LOOPComponent.ROTATED)
          ? period === 4 ? Period.QUARTERED : period === 2 ? Period.HALVED : undefined
          : undefined,
        inversionPeriod: components.has(LOOPComponent.INVERTED)
          ? period === 4 ? Period.QUARTERED : period === 2 ? Period.HALVED : undefined
          : undefined,
      };
    }
  }

  return {
    components: new Set<LOOPComponent>(),
    period: 1,
    rotationPeriod: undefined,
    inversionPeriod: undefined,
  };
}
