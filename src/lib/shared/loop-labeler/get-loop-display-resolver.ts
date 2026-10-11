import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceEntry } from "#lib/shared/loop-labeler/domain/sequence-models.js";
import type {
  LOOPSpecWire,
  ReflectionAxis,
} from "@tka/sequence-engine/loop";
import type { LOOPComponent, LOOPDomain } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";

/**
 * Return type of resolveLoopDisplay.
 */
export interface LoopDisplay {
  components: Set<LOOPComponent>;
  componentDomains?: Partial<Record<LOOPComponent, LOOPDomain>>;
  /**
   * Components whose wire spec declares mode "overlay". Icon-strip renderers
   * show these LAST, after a faded separator dot. See the full doc on the
   * canonical LoopDisplay in loop-display-resolver.ts.
   */
  overlayComponents?: Set<LOOPComponent>;
  /** Reflection axis shared by the surfaced reflection components. */
  reflectionAxis?: ReflectionAxis;
  period: number;
  /** @deprecated Use `period` instead. */
  rotationPeriod?: Period;
  /** @deprecated Use `period` instead. */
  inversionPeriod?: Period;
}

export type LoopDisplayInput = (SequenceData | SequenceEntry) & { loopSpec?: LOOPSpecWire };

export type ResolveLoopDisplayFn = (input: LoopDisplayInput) => LoopDisplay;

let resolver: ResolveLoopDisplayFn | null = null;

/**
 * Register the resolveLoopDisplay implementation.
 * Called once from bootstrap.ts to avoid a reverse import (shared/ -> features/).
 */
export function registerLoopDisplayResolver(fn: ResolveLoopDisplayFn): void {
  resolver = fn;
}

export function getLoopDisplayResolver(): ResolveLoopDisplayFn {
  if (!resolver) {
    throw new Error(
      "LoopDisplayResolver not registered. Call registerLoopDisplayResolver() at app startup."
    );
  }
  return resolver;
}

export function tryGetLoopDisplayResolver(): ResolveLoopDisplayFn | null {
  return resolver;
}

let cacheClearer: (() => void) | null = null;

/**
 * Register the resolveLoopDisplay cache-eviction function. Called once from
 * bootstrap.ts alongside registerLoopDisplayResolver, for the same reason:
 * avoids a create-module -> features/loop-labeler reverse import. The
 * resolver's cache is keyed by sequence id, which does not change across a
 * beat mutation, so a stale entry survives a loopSpec strip unless evicted.
 */
export function registerLoopDisplayCacheClearer(fn: () => void): void {
  cacheClearer = fn;
}

export function tryGetLoopDisplayCacheClearer(): (() => void) | null {
  return cacheClearer;
}
