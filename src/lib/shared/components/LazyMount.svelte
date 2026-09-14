<script lang="ts">
  /**
   * LazyMount
   *
   * Defers a component's chunk (and its whole static import subtree) out of the
   * parent's eager graph. The component is dynamically imported the first time
   * `active` flips true, then stays mounted by default (keep-alive) so exit
   * animations and subsequent opens behave exactly as if it had always been
   * there. Set `keepAlive={false}` when inactive state must tear down the
   * component instance while retaining the already-loaded module.
   *
   * Use for action-driven hosts — drawers, editors, dialogs — that render
   * nothing until a trigger fires but were previously imported statically,
   * dragging their dependency tree into first paint.
   *
   *   <LazyMount loader={() => import("./HeavyDrawer.svelte")} active={isOpen} />
   *
   * The loaded component reads its own open state (props or context); LazyMount
   * only governs WHEN its code is fetched, never its visibility.
   *
   * Context flows normally: LazyMount sits in the parent's component tree, so a
   * child mounted here resolves getContext() up through the parent.
   *
   * `prefetch`: warm the chunk during browser idle WITHOUT mounting, so the
   * first `active` flip resolves an already-fetched-and-parsed module instantly
   * instead of paying the network + (in dev) on-demand-transform cost on click.
   * The same `import()` literal is reused, so Vite maps it to the correct hashed
   * chunk in production too (unlike modulepreload source-path hacks).
   *
   * `placeholder`: rendered until the component mounts — including during SSR/
   * prerender, so the static HTML reserves the loaded component's footprint at
   * first paint. Pass a skeleton whose GEOMETRY matches the loaded component
   * exactly (same aspect boxes, same chrome heights); the swap then causes zero
   * layout shift by construction (no-layout-shift.md).
   */
  import { onDestroy, type Component, type Snippet } from "svelte";

  let {
    loader,
    active = false,
    keepAlive = true,
    prefetch = false,
    props = {},
    placeholder,
    error,
    onStatusChange,
    debugName = "component",
    retryKey = undefined,
  }: {
    /** Dynamic import of the component module. */
    loader: () => Promise<{ default: Component<any> }>;
    /** When this first becomes true, the chunk loads and mounts permanently. */
    active?: boolean;
    /** Keep the loaded component instance mounted while inactive. */
    keepAlive?: boolean;
    /** Warm the chunk on idle (no mount) so the first open is instant. */
    prefetch?: boolean;
    /** Props forwarded to the loaded component. */
    props?: Record<string, unknown>;
    /** Same-footprint skeleton shown (and SSR'd) until the component mounts. */
    placeholder?: Snippet;
    /** Visible recovery state for a failed chunk load. */
    error?: Snippet<[unknown, () => void]>;
    /** Mount-attempt lifecycle for truthful parent loading states and queues. */
    onStatusChange?: (status: "loading" | "loaded" | "error") => void;
    /** Identifies the failed chunk in diagnostics without exposing it in the UI. */
    debugName?: string;
    /** A new key retries a failed import without remounting a healthy instance. */
    retryKey?: unknown;
  } = $props();

  let Loaded = $state<Component<any> | null>(null);
  let loadError = $state<unknown>(null);
  let started = false;
  let destroyed = false;
  // Single in-flight import shared by mount + prefetch, so warming the chunk
  // and the eventual mount never double-fetch.
  let modPromise: Promise<{ default: Component<any> }> | null = null;
  let previousRetryKey = retryKey;

  function load(): Promise<{ default: Component<any> }> {
    // Normalize a synchronous loader throw into the same owned rejection path
    // as import(), so neither form can escape the component's error boundary.
    return (modPromise ??= Promise.resolve().then(loader));
  }

  function mountLoadedComponent(): void {
    if (started) return;
    started = true;
    onStatusChange?.("loading");
    void load().then(
      (module) => {
        if (destroyed) return;
        loadError = null;
        Loaded = module.default;
        onStatusChange?.("loaded");
      },
      (caught) => {
        // Dynamic imports cannot be aborted. Their rejection still has an
        // attached handler, but a closed drawer/viewer no longer owns UI state
        // or diagnostics after teardown.
        if (destroyed) return;
        loadError = caught;
        console.error(`[LazyMount] failed to load ${debugName}`, caught);
        onStatusChange?.("error");
      }
    );
  }

  function retry(): void {
    // This can recover application loaders and transient promises. Production
    // stale Vite chunks are recovered by hooks.client.ts's vite:preloadError
    // cache-busted navigation because browsers cache failed module-map entries.
    modPromise = null;
    started = false;
    loadError = null;
    mountLoadedComponent();
  }

  onDestroy(() => {
    destroyed = true;
  });

  $effect(() => {
    if (active && !started) {
      mountLoadedComponent();
    }
  });

  $effect(() => {
    const nextRetryKey = retryKey;
    if (nextRetryKey === previousRetryKey) return;
    previousRetryKey = nextRetryKey;
    if (loadError) retry();
  });

  // Idle-warm the chunk ahead of first open. Skipped once anything has already
  // triggered the import (active flip or a prior prefetch tick).
  $effect(() => {
    if (!prefetch || modPromise || active) return;
    let cancelled = false;
    const warm = () => {
      if (!cancelled && !destroyed && !modPromise) {
        load().catch(() => {
          if (cancelled || destroyed) return;
          // Prefetch is speculative. Let the active mount make a fresh request
          // and own the visible recovery state if the chunk is still missing.
          modPromise = null;
        });
      }
    };

    if (typeof requestIdleCallback !== "undefined") {
      const handle = requestIdleCallback(warm, { timeout: 2000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(handle);
      };
    }

    const handle = setTimeout(warm, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  });
</script>

{#if Loaded && (keepAlive || active)}
  <Loaded {...props} />
{:else if loadError && error}
  {@render error(loadError, retry)}
{:else if placeholder}
  {@render placeholder()}
{/if}
