import {
  createPaneKeepAlive,
  type PaneKeepAlive,
} from "#lib/shared/sequence-viewer/components/pane-keep-alive.svelte.js";

/**
 * Runs createPaneKeepAlive inside a fresh effect root (the factory registers a
 * $effect, which needs a root to exist at call time) and exposes a writable
 * `active` flag standing in for "this pane is the selected split content".
 */
export function createPaneKeepAliveHarness(initialReady = true): {
  pane: PaneKeepAlive;
  setActive: (value: boolean) => void;
  setReady: (value: boolean) => void;
  dispose: () => void;
} {
  let active = $state(false);
  let ready = $state(initialReady);
  let pane!: PaneKeepAlive;
  const stop = $effect.root(() => {
    pane = createPaneKeepAlive(
      () => active,
      () => ready
    );
  });
  return {
    pane,
    setActive: (value: boolean) => {
      active = value;
    },
    setReady: (value: boolean) => {
      ready = value;
    },
    dispose: stop,
  };
}
