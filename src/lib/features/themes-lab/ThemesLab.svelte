<script lang="ts">
  import { onMount } from "svelte";
  import { setSceneLabContext } from "#lib/features/lab/tabs/scene-lab/context/scene-lab-context.js";
  import { applyThemeForBackground } from "#lib/shared/settings/utils/background-theme-calculator.js";
  import { createThemesLabState } from "./state/themes-lab-state.svelte";
  import ThemeStrip from "./components/ThemeStrip.svelte";
  import ThemeHeader from "./components/ThemeHeader.svelte";
  import ThemeControlsPanel from "./components/ThemeControlsPanel.svelte";
  import ScenePreview from "#lib/features/lab/tabs/scene-lab/components/ScenePreview.svelte";
  import type { Component } from "svelte";
  import type { ThemeId } from "./domain/theme-types";
  import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
  import { createComposerSaveState } from "#lib/shared/3d/scene-composer/composer-save-state.svelte.js";
  import "#lib/shared/3d/scene-composer/register-scene-lab-composer-plugins.js";

  import OceanLab from "#lib/features/background-builder/components/OceanLab.svelte";
  import CosmicLab from "#lib/features/background-builder/components/CosmicLab.svelte";
  import ForestLab from "#lib/features/background-builder/components/ForestLab.svelte";
  import BlossomLab from "#lib/features/background-builder/components/BlossomLab.svelte";
  import PrideLab from "#lib/features/background-builder/components/PrideLab.svelte";
  import EmberLab from "#lib/features/background-builder/components/EmberLab.svelte";
  import WinterLab from "#lib/features/background-builder/components/WinterLab.svelte";
  import AutumnLab from "#lib/features/background-builder/components/AutumnLab.svelte";
  import CelestialLab from "#lib/features/background-builder/components/CelestialLab.svelte";
  import VoidLab from "#lib/features/background-builder/components/VoidLab.svelte";

  const state = createThemesLabState();
  const composerSave = createComposerSaveState({
    getPlugin: () => composerRegistry.get(state.sceneState.sceneId),
    getPlacements: () => state.composerState.placements,
    onSaved: () => state.composerState.markClean(),
    context: { module: "lab", tab: "themes" },
  });
  const activePlugin = $derived(composerRegistry.get(state.sceneState.sceneId));

  setSceneLabContext(state.sceneLabContext);

  const labComponents: Partial<Record<ThemeId, Component>> = {
    ocean: OceanLab,
    cosmic: CosmicLab,
    forest: ForestLab,
    blossom: BlossomLab,
    rainbow: PrideLab,
    ember: EmberLab,
    winter: WinterLab,
    autumn: AutumnLab,
    celestial: CelestialLab,
    void: VoidLab,
  };

  const CurrentLabComponent = $derived(labComponents[state.themeId] ?? null);

  function handleThemeSelect(id: ThemeId) {
    state.setTheme(id);
    const option = state.currentTheme;
    if (option) {
      applyThemeForBackground(option.backgroundType);
    }
  }

  onMount(() => {
    const option = state.currentTheme;
    if (option) {
      applyThemeForBackground(option.backgroundType);
    }
  });
</script>

<div class="themes-lab">
  <ThemeStrip
    themes={state.themeOptions}
    activeId={state.themeId}
    onSelect={handleThemeSelect}
  />

  <ThemeHeader
    label={state.currentTheme?.label ?? ""}
    color={state.currentTheme?.color ?? "#888"}
    mode={state.mode}
    onModeChange={(m) => state.setMode(m)}
  />

  <div
    class="content"
    class:mode-3d={state.mode === "3d"}
    class:composer-active={state.composerState.active}
  >
    {#if state.mode === "2d"}
      {#if CurrentLabComponent}
        <CurrentLabComponent />
      {:else}
        <div class="placeholder">
          <i class="fas fa-paint-brush"></i>
          <p>
            2D background coming soon for {state.currentTheme?.label ??
              "this theme"}
          </p>
        </div>
      {/if}
    {:else}
      <div class="preview-pane">
        <ScenePreview onComposerSave={composerSave.save} />
      </div>
      <aside class="controls-pane">
        <ThemeControlsPanel
          themeId={state.themeId}
          sceneState={state.sceneState}
          composerState={state.composerState}
          plugin={activePlugin}
          composerSaveStatus={composerSave.status}
          onComposerSave={composerSave.save}
        />
      </aside>
    {/if}
  </div>
</div>

<style>
  .themes-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px 20px 20px;
    overflow: hidden;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    gap: 8px;
    container: themes-lab / inline-size;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .content.mode-3d {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 16px;
    overflow: hidden;
  }

  .preview-pane {
    position: relative;
    min-height: 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .controls-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    padding: 14px;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 400px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.35);
  }

  .placeholder i {
    font-size: 3rem;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .placeholder p {
    font-size: 0.875rem;
  }

  @container themes-lab (max-width: 900px) {
    .content.mode-3d {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(300px, 1fr) auto;
    }

    .controls-pane {
      max-height: 50vh;
    }

    .content.mode-3d.composer-active {
      grid-template-rows: minmax(180px, 1fr) minmax(340px, 55vh);
    }

    .content.mode-3d.composer-active .controls-pane {
      max-height: none;
    }
  }

  @media (max-height: 599px) {
    @container themes-lab (max-width: 900px) {
      .content.mode-3d,
      .content.mode-3d.composer-active {
        grid-template-columns: minmax(0, 1fr) minmax(260px, 36vw);
        grid-template-rows: 1fr;
        gap: 8px;
      }

      .controls-pane,
      .content.mode-3d.composer-active .controls-pane {
        max-height: none;
        padding: 10px;
      }
    }
  }
</style>
