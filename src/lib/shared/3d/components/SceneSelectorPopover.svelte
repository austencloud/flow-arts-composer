<script lang="ts">
  import { onDestroy } from "svelte";
  import SceneFeatureTiles from "../scene-features/components/SceneFeatureTiles.svelte";
  import { tryGetSceneFeatureContext } from "../scene-features/context/scene-feature-context";
  import { tryGetViewer3DContext } from "../context/viewer-3d-context";
  import {
    DEFAULT_SCENE_ENVIRONMENT_ID,
    SCENE_ENVIRONMENTS,
    type SceneEnvironmentId,
  } from "../environments/domain/scene-environment";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import {
    warmDecoderRuntimes,
    warmSceneCode,
  } from "../scene-boot/scene-prefetch";

  interface Props {
    value?: SceneEnvironmentId;
    onchange?: (environmentId: SceneEnvironmentId) => void;
    onSettingChange?: ViewerControlSink;
  }
  let { value, onchange, onSettingChange }: Props = $props();

  const viewer = tryGetViewer3DContext();
  const currentEnvironment = $derived(
    value ?? viewer?.environmentId ?? DEFAULT_SCENE_ENVIRONMENT_ID
  );
  const hasSceneFeatures = tryGetSceneFeatureContext() !== undefined;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelWarm() {
    if (warmTimer !== null) clearTimeout(warmTimer);
    warmTimer = null;
  }

  onDestroy(cancelWarm);

  // Switching scenes starts with a cold module fetch, then the models that
  // module asks for, and only after both does anything render. Pointing at a
  // tile is the earliest honest signal of which scene that will be, so the
  // download starts there rather than on click. Opening the picker at all is
  // enough to justify the decoders, which every scene needs and no scene picks.
  $effect(() => {
    warmDecoderRuntimes();
  });

  // A brief pause or keyboard focus signals intent. The worker can hand its
  // bounded model cache directly to the loader; legacy viewers still warm code.
  function warmTile(environmentId: SceneEnvironmentId) {
    cancelWarm();
    if (environmentId === currentEnvironment) return;
    warmTimer = setTimeout(() => {
      warmTimer = null;
      if (viewer?.prepareEnvironment(environmentId)) return;
      const rendererKey = SCENE_ENVIRONMENTS.find(
        ({ id }) => id === environmentId
      )?.rendererKey;
      if (rendererKey !== undefined) warmSceneCode(rendererKey);
    }, 180);
  }

  function selectScene(e: MouseEvent, environmentId: SceneEnvironmentId) {
    e.stopPropagation();
    cancelWarm();
    const previous = currentEnvironment;
    if (onchange) onchange(environmentId);
    else viewer?.setEnvironmentId(environmentId);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_scene",
      "environment",
      previous ?? null,
      environmentId
    );
  }
</script>

<div class="scene-grid">
  {#each SCENE_ENVIRONMENTS as environment}
    <button
      class="scene-tile"
      class:active={currentEnvironment === environment.id}
      onclick={(e) => selectScene(e, environment.id)}
      onpointerenter={() => warmTile(environment.id)}
      onpointerleave={cancelWarm}
      onfocus={() => warmTile(environment.id)}
      onblur={cancelWarm}
      aria-pressed={currentEnvironment === environment.id}
      aria-label={environment.label}
      title={environment.label}
    >
      <i class="fas {environment.icon}" aria-hidden="true"></i>
      <span class="tile-label">{environment.label}</span>
    </button>
  {/each}
</div>

{#if hasSceneFeatures}
  <div class="section-divider"></div>
  <SceneFeatureTiles {onSettingChange} />
{/if}

<style>
  .scene-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  @container (min-width: 24rem) {
    .scene-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  .scene-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 4px;
    min-height: 72px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: all 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
  }

  .scene-tile:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
    transform: translateY(-1px);
  }

  .scene-tile.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 50%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 40%, #ffffff);
    box-shadow: 0 2px 12px
      color-mix(in srgb, var(--theme-accent, #4a9eff) 20%, transparent);
  }

  .scene-tile i {
    font-size: 20px;
  }

  .scene-tile.active i {
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 60%, #ffffff);
  }

  .tile-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.03em;
    text-align: center;
    line-height: 1.2;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 12px 0;
  }
</style>
