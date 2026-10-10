<script lang="ts">
  import type { SceneLabState } from "#lib/features/lab/tabs/scene-lab/state/scene-lab-state.svelte.js";
  import type { ThemeId } from "../domain/theme-types";
  import WinterControls from "#lib/features/lab/tabs/scene-lab/components/WinterControls.svelte";
  import ForestControls from "#lib/features/lab/tabs/scene-lab/components/ForestControls.svelte";
  import CosmicControls from "#lib/features/lab/tabs/scene-lab/components/CosmicControls.svelte";
  import OceanControls from "#lib/features/lab/tabs/scene-lab/components/OceanControls.svelte";
  import AutumnControls from "#lib/features/lab/tabs/scene-lab/components/AutumnControls.svelte";
  import EmberControls from "#lib/features/lab/tabs/scene-lab/components/EmberControls.svelte";
  import BlossomControls from "#lib/features/lab/tabs/scene-lab/components/BlossomControls.svelte";
  import CelestialControls from "#lib/features/lab/tabs/scene-lab/components/CelestialControls.svelte";
  import RainbowControls from "#lib/features/lab/tabs/scene-lab/components/RainbowControls.svelte";
  import VoidControls from "#lib/features/lab/tabs/scene-lab/components/VoidControls.svelte";
  import ComposerPickerPanel from "#lib/shared/3d/scene-composer/ComposerPickerPanel.svelte";
  import type { ComposerEditorState } from "#lib/shared/3d/scene-composer/composer-editor-state.svelte.js";
  import type { SceneComposerPlugin } from "#lib/shared/3d/scene-composer/types.js";

  interface Props {
    themeId: ThemeId;
    sceneState: SceneLabState;
    composerState: ComposerEditorState;
    plugin: SceneComposerPlugin | undefined;
    composerSaveStatus: "idle" | "saving" | "saved" | "error";
    onComposerSave: () => void | Promise<void>;
  }

  let {
    themeId,
    sceneState,
    composerState,
    plugin,
    composerSaveStatus,
    onComposerSave,
  }: Props = $props();

  let copyStatus = $state<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await sceneState.copyCurrentToClipboard();
      copyStatus = "copied";
      setTimeout(() => (copyStatus = "idle"), 1500);
    } catch {
      copyStatus = "error";
      setTimeout(() => (copyStatus = "idle"), 2000);
    }
  }

  function handleReset() {
    if (confirm("Reset this scene's config to defaults?")) {
      sceneState.resetCurrent();
    }
  }
</script>

<div class="controls-panel">
  <div class="actions">
    {#if composerState.active}
      <button class="action-btn" onclick={() => composerState.setActive(false)}>
        <i class="fas fa-arrow-left"></i> Controls
      </button>
      <button
        class="action-btn primary"
        class:success={composerSaveStatus === "saved"}
        class:error={composerSaveStatus === "error"}
        disabled={composerSaveStatus === "saving"}
        onclick={onComposerSave}
      >
        {#if composerSaveStatus === "saving"}
          <i class="fas fa-spinner fa-spin"></i> Saving
        {:else if composerSaveStatus === "saved"}
          <i class="fas fa-check"></i> Saved
        {:else if composerSaveStatus === "error"}
          <i class="fas fa-xmark"></i> Save failed
        {:else}
          <i class="fas fa-save"></i> Save
        {/if}
        {#if composerState.dirty}<span class="dirty-dot"></span>{/if}
      </button>
    {:else}
      <button
        class="action-btn"
        onclick={handleReset}
        title="Reset to defaults"
      >
        <i class="fas fa-undo"></i> Reset
      </button>
      <button
        class="action-btn primary"
        class:success={copyStatus === "copied"}
        class:error={copyStatus === "error"}
        onclick={handleCopy}
        title="Copy TypeScript config to clipboard"
      >
        {#if copyStatus === "copied"}
          <i class="fas fa-check"></i> Copied
        {:else if copyStatus === "error"}
          <i class="fas fa-xmark"></i> Failed
        {:else}
          <i class="fas fa-copy"></i> Copy config
        {/if}
      </button>
    {/if}
  </div>

  <div class="controls-scroll">
    {#if composerState.active && plugin}
      <ComposerPickerPanel
        catalog={plugin.catalog}
        sceneName={plugin.displayName}
        placedCount={composerState.composedObjectCount}
        activeItemKey={composerState.activeCatalogItem?.key ?? null}
        onSelectItem={(def) => composerState.startPlacement(def)}
        onDeselectItem={() => composerState.stopPlacement()}
        onClose={() => composerState.setActive(false)}
      />
    {:else if themeId === "winter"}
      <WinterControls />
    {:else if themeId === "forest"}
      <ForestControls />
    {:else if themeId === "cosmic"}
      <CosmicControls />
    {:else if themeId === "ocean"}
      <OceanControls />
    {:else if themeId === "autumn"}
      <AutumnControls />
    {:else if themeId === "ember"}
      <EmberControls />
    {:else if themeId === "blossom"}
      <BlossomControls />
    {:else if themeId === "celestial"}
      <CelestialControls />
    {:else if themeId === "rainbow"}
      <RainbowControls />
    {:else if themeId === "void"}
      <VoidControls />
    {/if}
  </div>
</div>

<style>
  .controls-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .action-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .action-btn.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 18%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 35%,
      transparent
    );
    color: var(--theme-accent, #38bdf8);
  }

  .action-btn.primary:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 28%,
      transparent
    );
  }

  .action-btn.success {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 22%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 40%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 70%, white);
  }

  .action-btn.error {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 22%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
  }

  .controls-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
    }
  }
</style>
