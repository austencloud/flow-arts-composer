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
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import {
    warmDecoderRuntimes,
    warmSceneCode,
  } from "../scene-boot/scene-prefetch";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";

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
  // A scene can take seconds to build after its tile is tapped. Until it is
  // on screen the old tile stays active and the tapped one shows it is
  // loading, so nobody keeps tapping a tile that already looks finished.
  // A host that owns `value` has no renderer feedback here.
  const pendingEnvironment = $derived(
    value === undefined ? (viewer?.pendingEnvironmentId ?? null) : null
  );
  const shownEnvironment = $derived(
    value ?? viewer?.displayedEnvironmentId ?? currentEnvironment
  );
  const failedLabel = $derived(
    value === undefined && viewer?.failedEnvironmentId
      ? SCENE_ENVIRONMENTS.find(({ id }) => id === viewer.failedEnvironmentId)
          ?.label
      : undefined
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
    // Repeat taps on the loading tile must not restart its load. Tapping any
    // other tile retargets the switch; the renderer drops the earlier request.
    if (environmentId === pendingEnvironment) return;
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
    {@const loading = pendingEnvironment === environment.id}
    <button
      class="scene-tile"
      class:active={shownEnvironment === environment.id}
      class:loading
      onclick={(e) => selectScene(e, environment.id)}
      onpointerenter={() => warmTile(environment.id)}
      onpointerleave={cancelWarm}
      onfocus={() => warmTile(environment.id)}
      onblur={cancelWarm}
      aria-pressed={shownEnvironment === environment.id}
      aria-busy={loading}
      aria-label={loading ? `${environment.label}, loading` : environment.label}
      title={environment.label}
    >
      <i class="fas {environment.icon}" aria-hidden="true"></i>
      <span class="tile-label">{environment.label}</span>
      <!-- The corner slot is always there, so the ring never moves the tile. -->
      <span class="tile-status" aria-hidden="true">
        {#if loading}<ProgressRing
            percent={-1}
            size={14}
            strokeWidth={2}
          />{/if}
      </span>
    </button>
  {/each}
</div>

{#if failedLabel}
  <p class="scene-notice" role="status" transition:growFade>
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    {failedLabel} didn't load. The scene stayed as it was.
  </p>
{/if}

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
    position: relative;
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
    transition:
      background var(--duration-fast) var(--ease-spring),
      border-color var(--duration-fast) var(--ease-spring),
      color var(--duration-fast) var(--ease-spring),
      transform var(--duration-fast) var(--ease-spring),
      box-shadow var(--duration-fast) var(--ease-spring);
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

  /* Loading reads as "on its way": a ring outline on the whole tile and a
     spinner in the corner, without claiming the active fill. */
  .scene-tile.loading {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 35%,
      transparent
    );
    color: rgba(255, 255, 255, 0.9);
    cursor: progress;
  }

  .tile-status {
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-flex;
    width: 14px;
    height: 14px;
    pointer-events: none;
  }

  .scene-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px 0 0;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
    color: rgba(255, 255, 255, 0.75);
  }

  .scene-notice i {
    color: var(--semantic-warning, #f59e0b);
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 12px 0;
  }
</style>
