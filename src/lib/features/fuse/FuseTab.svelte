<script lang="ts">
  /**
   * Fuse Tab Root
   *
   * Owns its own state (does not participate in CreateModuleState).
   * Creates the fuse state factory, sets context, and renders the layout.
   * The fused result opens in the shared sequence viewer drawer, so there
   * is no result phase here.
   */

  import { browser } from "$app/env";
  import { onDestroy } from "svelte";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import { deriveLettersForSequence } from "#lib/shared/navigation/services/letter-deriver.js";
  import { createFuseState } from "./state/fuse-state.svelte";
  import { setFuseContext } from "./context/fuse-context";
  import { generateSoloLoop } from "./services/solo-loop-generator";
  import FuseLayout from "./components/FuseLayout.svelte";

  type FuseInitResult =
    | { state: ReturnType<typeof createFuseState>; error: null }
    | { state: null; error: string | null };

  function init(): FuseInitResult {
    if (!browser) return { state: null, error: null };

    try {
      const state = createFuseState({
        browseLoader: getBrowseLoader(),
        deriveLetters: deriveLettersForSequence,
        errorHandler: getErrorHandler(),
        generateSoloLoop,
      });
      setFuseContext({ state });
      void state.initialize();
      return { state, error: null };
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      getErrorHandler().showUserError({
        message: "Fuse couldn't start",
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: { module: "create", tab: "fuse", action: "initialize" },
      });
      return { state: null, error: "Close Create and open it again." };
    }
  }

  const { state: fuseState, error: initError } = init();

  onDestroy(() => {
    fuseState?.dispose();
  });

  function handleVisibilityChange(): void {
    fuseState?.handleDocumentVisibility(document.hidden);
  }
</script>

<svelte:document onvisibilitychange={handleVisibilityChange} />

{#if initError}
  <div class="fuse-error" role="alert">
    <p>Fuse tab failed to load</p>
    <p class="error-detail">{initError}</p>
  </div>
{:else if fuseState}
  <div class="fuse-view">
    <FuseLayout />
  </div>
{:else}
  <div class="fuse-error" role="status">
    <p>Fuse tab initializing...</p>
  </div>
{/if}

<style>
  .fuse-view {
    height: 100%;
    width: 100%;
  }

  .fuse-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    padding: var(--spacing-lg, 24px);
    text-align: center;
  }

  .error-detail {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #fca5a5);
    max-width: 400px;
    word-break: break-word;
  }
</style>
