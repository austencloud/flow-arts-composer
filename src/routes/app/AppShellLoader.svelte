<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import LoadingGate from "$lib/shared/components/loading/LoadingGate.svelte";
  import {
    clearModuleChunkRecoveryGuard,
    recoverFromModuleChunkFailure,
    resilientLazyImport,
  } from "$lib/shared/hmr-helper";

  let MainApp = $state<Component | null>(null);
  let loadError = $state<unknown>(null);
  let mainAppLoad: Promise<void> | null = null;

  function loadMainApp(): Promise<void> {
    if (mainAppLoad) return mainAppLoad;

    loadError = null;
    mainAppLoad = resilientLazyImport(
      () => import("$lib/shared/application/components/MainApplication.svelte"),
      4
    )()
      .then((mod) => {
        MainApp = mod.default;
        clearModuleChunkRecoveryGuard("app-shell");
        void import("$lib/shared/analytics/boot-profiler")
          .then(({ bootProfiler }) => bootProfiler.end("shell:main-app-chunk"))
          .catch(() => {});
      })
      .catch((error: unknown) => {
        loadError = error;
        recoverFromModuleChunkFailure("app-shell");
      })
      .finally(() => {
        mainAppLoad = null;
      });

    return mainAppLoad;
  }

  onMount(() => {
    (window as any).__tkaLoadProgress?.(84, "Resolving services...");
    void import("$lib/shared/analytics/boot-profiler")
      .then(({ bootProfiler }) => bootProfiler.mark("shell:main-app-chunk"))
      .catch(() => {});
    void loadMainApp();
  });
</script>

{#if MainApp}
  <MainApp />
{:else if loadError}
  <div class="shell-load-error" role="alert">
    <p>Flow Arts Composer couldn’t finish loading.</p>
    <button type="button" onclick={() => void loadMainApp()}>Try Again</button>
  </div>
{:else}
  <LoadingGate />
{/if}

<!-- Magic-link sign-in confirm step. Self-gated (no-ops unless the URL
     carries a pending Firebase email-sign-in link), mounted here rather than
     MainApplication.svelte so it catches the link before MainApp finishes
     loading. See EmailLinkConfirmModal.svelte for why completion requires an
     explicit click. -->
{#await import("$lib/shared/auth/components/EmailLinkConfirmModal.svelte") then mod}
  <mod.default />
{/await}

<style>
  .shell-load-error {
    display: flex;
    min-height: 100dvh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    color: var(--theme-text);
    text-align: center;
  }

  .shell-load-error p {
    margin: 0;
    font-size: var(--font-size-base);
  }

  .shell-load-error button {
    min-width: 120px;
    min-height: var(--min-touch-target);
    padding: 0.75rem 1.5rem;
    border: 0;
    border-radius: 8px;
    background: var(--theme-accent, #6366f1);
    color: white;
    font: inherit;
    cursor: pointer;
  }

  .shell-load-error button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
</style>
