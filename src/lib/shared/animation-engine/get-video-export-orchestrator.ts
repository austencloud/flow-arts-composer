import type { IVideoExportOrchestrator } from "#lib/shared/compose/domain/video-export-types.js";

let instance: IVideoExportOrchestrator | null = null;
let factory: (() => IVideoExportOrchestrator) | null = null;

/**
 * Register the factory that creates VideoExportOrchestrator.
 * Called once from features/compose at app startup to avoid a reverse import
 * (shared/ must not import from features/).
 */
export function registerVideoExportOrchestratorFactory(
  fn: () => IVideoExportOrchestrator
): void {
  factory = fn;
}

export function getVideoExportOrchestrator(): IVideoExportOrchestrator {
  const orchestrator = tryGetVideoExportOrchestrator();
  if (!orchestrator) {
    throw new Error(
      "VideoExportOrchestrator factory not registered. " +
      "Ensure registerVideoExportOrchestratorFactory() is called at app startup."
    );
  }
  return orchestrator;
}

/**
 * Non-throwing variant for callers that can degrade gracefully when the
 * deferred registration hasn't run yet (it loads via requestIdleCallback).
 */
export function tryGetVideoExportOrchestrator(): IVideoExportOrchestrator | null {
  if (!instance && factory) {
    instance = factory();
  }
  return instance;
}

/**
 * Resolve the orchestrator, loading the composition root's deferred
 * registrations first if they haven't run yet.
 *
 * The factory registers as a side effect of
 * composition-root/deferred-registrations, which the root layout schedules via
 * requestIdleCallback (2s timeout). Any host that can reach a video export
 * before that idle slot arrives — the Browse animation sheet, the sequence
 * viewer shell's export panel, the Create export drawer — must await this
 * instead of grabbing the orchestrator eagerly, otherwise the resolution races
 * the bootstrap and throws.
 *
 * The dynamic import is module-cached, so repeat calls are free and concurrent
 * calls share one load. Importing dynamically (not statically) also keeps
 * deferred-registrations' heavy graph — mediabunny, WebCodecs, Firestore — out
 * of this module's import cost, and avoids a static cycle with
 * deferred-registrations, which imports this file.
 */
export async function ensureVideoExportOrchestrator(): Promise<IVideoExportOrchestrator> {
  if (!factory) {
    await import("#lib/shared/composition-root/deferred-registrations.js");
  }
  return getVideoExportOrchestrator();
}
