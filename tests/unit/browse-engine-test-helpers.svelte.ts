import { createBrowseEngine } from "#lib/shared/browse/engine/create-browse-engine.svelte.js";

type BrowseEngineConfig = Parameters<typeof createBrowseEngine>[0];
export type BrowseEngine = ReturnType<typeof createBrowseEngine>;

/**
 * Create a browse engine inside a fresh effect root and return both the engine
 * and a teardown function. Tests use this instead of calling the factory
 * directly because the factory registers $effect internally — that requires a
 * component or an effect root to exist at call time.
 */
export function createBrowseEngineForTest(config: BrowseEngineConfig): {
  engine: BrowseEngine;
  dispose: () => void;
} {
  let engine!: BrowseEngine;
  const stop = $effect.root(() => {
    engine = createBrowseEngine(config);
  });
  return { engine, dispose: stop };
}
