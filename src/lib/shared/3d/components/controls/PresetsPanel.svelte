<!--
  PresetsPanel — the in-rail "Presets" tool. A load + save-current surface for
  saved 3D scenes: pin a "Save current setup" action at the top, then a list of
  saved scenes that apply live to the mounted viewer on click. Full management
  (rename, delete, reproduce-in-Studio) stays in Browse → My Collections
  (Scene3DCollectionModule.svelte) — this panel is deliberately thin.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { scene3dCollectionState } from "#lib/features/scene-3d-collection/state/scene-3d-collection-state.svelte.js";
  import { applyScene3DLookLive } from "#lib/features/scene-3d-collection/services/open-3d-scene.js";
  import type { Collected3DScene } from "#lib/features/scene-3d-collection/domain/scene-3d-collection-types.js";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import { loadedAuthState } from "#lib/shared/auth/state/loaded-auth-state.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

  interface Props {
    onOpenSaveScene?: () => void;
    onSettingChange?: ViewerControlSink;
  }
  let { onOpenSaveScene, onSettingChange }: Props = $props();

  const viewer = getViewer3DContext();
  const scenes = $derived(scene3dCollectionState.collection);
  let appliedSceneId = $state<string | null>(null);
  let appliedClearTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const uid = loadedAuthState.userId;
    if (uid) scene3dCollectionState.ensureStarted(uid);
    else scene3dCollectionState.initLocal();
  });

  function applyScene(scene: Collected3DScene): void {
    if (viewer.disposed) return;

    if (appliedClearTimer !== undefined) clearTimeout(appliedClearTimer);
    appliedClearTimer = undefined;
    appliedSceneId = null;

    try {
      applyScene3DLookLive(scene, viewer);
    } catch {
      showToast({
        message: "Couldn't apply preset",
        type: "error",
      });
      return;
    }

    appliedSceneId = scene.id;
    appliedClearTimer = setTimeout(() => {
      appliedSceneId = null;
      appliedClearTimer = undefined;
    }, 2500);

    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_presets",
      "preset_apply",
      null,
      scene.id,
      { count: true }
    );
  }

  onDestroy(() => {
    if (appliedClearTimer !== undefined) clearTimeout(appliedClearTimer);
  });
</script>

<div class="presets-panel">
  <div class="pinned-action">
    <PanelButton
      variant="primary"
      fullWidth
      onclick={() => onOpenSaveScene?.()}
    >
      <i class="fas fa-bookmark" aria-hidden="true"></i>
      <span>Save current setup</span>
    </PanelButton>
  </div>

  <div class="presets-list" aria-label="Saved scenes">
    {#if scene3dCollectionState.loading && scenes.length === 0}
      {#each { length: 3 } as _, i (i)}
        <div class="preset-row preset-row--skeleton" aria-hidden="true">
          <div class="preset-thumb skeleton-block"></div>
          <div class="preset-name skeleton-block skeleton-text"></div>
        </div>
      {/each}
    {:else if scenes.length === 0}
      <div class="empty-state">
        <i class="fas fa-swatchbook empty-icon" aria-hidden="true"></i>
        <p class="empty-title">Nothing saved yet</p>
        <p class="empty-hint">Build a setup you like, then save it.</p>
      </div>
    {:else}
      {#each scenes as scene (scene.id)}
        <button
          type="button"
          class="preset-row"
          class:preset-row--applied={appliedSceneId === scene.id}
          onclick={() => applyScene(scene)}
          title={scene.name}
        >
          <span class="preset-thumb">
            {#if scene.poster}
              <img src={scene.poster} alt="" loading="lazy" />
            {:else}
              <i class="fas fa-cube thumb-fallback" aria-hidden="true"></i>
            {/if}
          </span>
          <span class="preset-name">{scene.name}</span>
          {#if appliedSceneId === scene.id}
            <i class="fas fa-check applied-check" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .presets-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .pinned-action {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .presets-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .preset-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
    cursor: pointer;
    text-align: left;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      transform 160ms ease;
  }

  .preset-row:not(.preset-row--skeleton):hover,
  .preset-row:not(.preset-row--skeleton):focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .preset-row--applied {
    border-color: var(--theme-accent, #4a9eff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 14%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.03))
    );
  }

  .preset-row:not(.preset-row--skeleton):active {
    transform: scale(0.99);
  }

  .preset-row:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }

  .preset-row--skeleton {
    cursor: default;
    pointer-events: none;
  }

  .preset-thumb {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 0.5rem;
    background: var(--theme-panel-bg, #000);
  }

  .preset-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-fallback {
    font-size: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .preset-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 500;
  }

  .applied-check {
    flex: none;
    color: var(--theme-accent, #4a9eff);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .skeleton-block {
    background: linear-gradient(
      90deg,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05)) 25%,
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1)) 50%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05)) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
    border-radius: 0.5rem;
  }

  .skeleton-text {
    flex: 1;
    height: 0.875rem;
    border-radius: 0.25rem;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.5rem 1rem;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .empty-icon {
    font-size: 1.75rem;
    opacity: 0.4;
  }

  .empty-title {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
  }

  .empty-hint {
    margin: 0;
    max-width: 24ch;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .preset-row {
      transition: none;
    }

    .preset-row:not(.preset-row--skeleton):active {
      transform: none;
    }

    .skeleton-block {
      animation: none;
    }
  }
</style>
