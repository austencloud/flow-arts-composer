<script lang="ts">
  import { onDestroy } from "svelte";
  import SceneSelectorPopover from "../SceneSelectorPopover.svelte";
  import FormationPopover from "../controls/FormationPopover.svelte";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import { markSceneStudioSetupSeen } from "#lib/shared/onboarding/state/viewer3d-intro-state.js";
  import { scene3dCollectionState } from "#lib/features/scene-3d-collection/state/scene-3d-collection-state.svelte.js";
  import { applyScene3DLookLive } from "#lib/features/scene-3d-collection/services/open-3d-scene.js";
  import type { Collected3DScene } from "#lib/features/scene-3d-collection/domain/scene-3d-collection-types.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { resolveSceneControlLayout } from "#lib/shared/3d/domain/scene-control-layout.js";

  interface Props {
    onSettingChange?: ViewerControlSink;
    force?: boolean;
    onDismiss?: () => void;
  }

  type StepId = "scene" | "performers" | "formation" | "presets";
  type PerformerCount = "1" | "2" | "4" | "8";

  let { onSettingChange, force = false, onDismiss }: Props = $props();

  const viewer = getViewer3DContext();
  const performerOptions: Array<{ value: PerformerCount; label: string }> = [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "4", label: "4" },
    { value: "8", label: "8" },
  ];
  const headings: Record<StepId, string> = {
    scene: "Pick your stage",
    performers: "How many performers?",
    formation: "Arrange your performers",
    presets: "Save and reload setups",
  };

  let currentStepId = $state<StepId>("scene");
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let cardWidth = $state(0);
  let restoredFrame = false;

  const performerCount = $derived(viewer.performerManager.performers.length);
  const selectedPerformerCount = $derived(
    String(performerCount) as PerformerCount
  );
  const reachableSteps = $derived<StepId[]>(
    performerCount === 1
      ? ["scene", "performers", "presets"]
      : ["scene", "performers", "formation", "presets"]
  );
  const currentStepIndex = $derived(reachableSteps.indexOf(currentStepId));
  const scenes = $derived(scene3dCollectionState.collection);
  const presentation = $derived(
    resolveSceneControlLayout(workspaceWidth, workspaceHeight, false)
      .presentation
  );

  $effect(() => {
    const uid = authState.user?.uid;
    if (uid) scene3dCollectionState.ensureStarted(uid);
    else scene3dCollectionState.initLocal();
  });

  $effect(() => {
    if (currentStepId === "formation" && performerCount === 1) {
      currentStepId = "presets";
    }
  });

  $effect(() => {
    if (presentation === "compact" || viewer.disposed) return;
    if (workspaceWidth <= 0 || workspaceHeight <= 0 || cardWidth <= 0) return;
    viewer.frameAllPerformers(
      Math.max(1, workspaceWidth - cardWidth) / workspaceHeight,
      true
    );
  });

  function reportProgress(
    setting: "step_next" | "step_back" | "skip" | "done",
    previous: StepId | null,
    next: StepId | null
  ): void {
    reportViewerControlChange(
      onSettingChange,
      "scene_studio_setup",
      setting,
      previous,
      next,
      { count: true }
    );
  }

  function restoreFullFrame(): void {
    if (restoredFrame || presentation === "compact" || viewer.disposed) return;
    restoredFrame = true;
    if (workspaceWidth > 0 && workspaceHeight > 0) {
      viewer.frameAllPerformers(workspaceWidth / workspaceHeight, true);
    }
  }

  function dismiss(kind: "skip" | "done"): void {
    reportProgress(kind, currentStepId, null);
    if (!force) markSceneStudioSetupSeen();
    restoreFullFrame();
    onDismiss?.();
  }

  function moveStep(direction: -1 | 1): void {
    const index = reachableSteps.indexOf(currentStepId);
    const next = reachableSteps[index + direction];
    if (!next) return;
    const previous = currentStepId;
    currentStepId = next;
    reportProgress(direction === 1 ? "step_next" : "step_back", previous, next);
  }

  function setPerformerCount(value: PerformerCount): void {
    viewer.setPerformerCountFromUI(Number(value));
  }

  function applyScene(scene: Collected3DScene): void {
    if (viewer.disposed) return;
    try {
      applyScene3DLookLive(scene, viewer);
    } catch {
      showToast({ message: "Couldn't apply preset", type: "error" });
      return;
    }
    reportViewerControlChange(
      onSettingChange,
      "scene_studio_setup",
      "preset_apply",
      null,
      scene.id,
      { count: true }
    );
  }

  onDestroy(restoreFullFrame);
</script>

<div
  class="intro-workspace"
  bind:clientWidth={workspaceWidth}
  bind:clientHeight={workspaceHeight}
>
  <!-- Compact viewports skip the guided setup; the mobile treatment is a follow-up. -->
  {#if workspaceWidth > 0 && workspaceHeight > 0 && presentation !== "compact"}
    <section
      class="intro-card"
      bind:clientWidth={cardWidth}
      aria-labelledby="viewer-3d-intro-heading"
    >
      <header class="intro-header">
        <div class="step-dots" aria-label="Setup progress">
          {#each reachableSteps as step, index (step)}
            <span
              class:active={step === currentStepId}
              class="step-dot"
              aria-label="Step {index + 1} of {reachableSteps.length}"
              aria-current={step === currentStepId ? "step" : undefined}
            ></span>
          {/each}
        </div>
        <button
          class="skip-button"
          type="button"
          onclick={() => dismiss("skip")}>Skip</button
        >
      </header>

      <h2 id="viewer-3d-intro-heading">{headings[currentStepId]}</h2>

      <div class="intro-body">
        <Crossfade key={currentStepId} fill duration={DURATION.normal}>
          <div class="step-content">
            {#if currentStepId === "scene"}
              <SceneSelectorPopover {onSettingChange} />
            {:else if currentStepId === "performers"}
              <SegmentedControl
                options={performerOptions}
                value={selectedPerformerCount}
                onchange={setPerformerCount}
                color="accent"
                semantics="radiogroup"
                ariaLabel="Number of performers"
              />
              <p>Everyone performs this sequence.</p>
            {:else if currentStepId === "formation"}
              <FormationPopover {onSettingChange} />
            {:else if scene3dCollectionState.loading && scenes.length === 0}
              <div class="preset-strip" aria-label="Loading saved setups">
                {#each Array(3) as _}
                  <div class="preset-poster preset-skeleton"></div>
                {/each}
              </div>
            {:else if scenes.length > 0}
              <!-- Compact presentation of the presets capability; behavior owner is scene3dCollectionState + applyScene3DLookLive, full presentation is PresetsPanel.svelte -->
              <div class="preset-strip" aria-label="Saved setups">
                {#each scenes as scene (scene.id)}
                  <button
                    type="button"
                    class="preset-poster"
                    onclick={() => applyScene(scene)}
                    aria-label="Apply {scene.name}"
                    title={scene.name}
                  >
                    {#if scene.poster}
                      <img src={scene.poster} alt="" loading="lazy" />
                    {:else}
                      <i class="fas fa-cube" aria-hidden="true"></i>
                    {/if}
                  </button>
                {/each}
              </div>
            {:else}
              <p class="preset-empty">
                Build something you like, then tap the bookmark in the rail to
                save it. Your saved setups will appear here and in the Presets
                panel.
              </p>
            {/if}
          </div>
        </Crossfade>
      </div>

      <footer class="intro-footer">
        <div class="back-slot">
          {#if currentStepIndex > 0}
            <PanelButton onclick={() => moveStep(-1)}>Back</PanelButton>
          {/if}
        </div>
        {#if currentStepIndex === reachableSteps.length - 1}
          <PanelButton variant="primary" onclick={() => dismiss("done")}
            >Done</PanelButton
          >
        {:else}
          <PanelButton variant="primary" onclick={() => moveStep(1)}
            >Next</PanelButton
          >
        {/if}
      </footer>
    </section>
  {/if}
</div>

<style>
  .intro-workspace {
    position: absolute;
    inset: 0;
    z-index: 28;
    min-width: 0;
    min-height: 0;
    pointer-events: none;
    container-type: size;
  }

  .intro-card {
    container-type: inline-size;
    position: absolute;
    left: clamp(0.75rem, 2cqw, 1.5rem);
    /* The transport owns the bottom edge of the viewer — the same
       reservation SceneControlRail and the Record Scene pill make.
       Anchoring to the raw bottom laid the card over the play/BPM
       controls, because the workspace runs behind the transport. */
    bottom: max(5rem, calc(5rem + env(safe-area-inset-bottom)));
    display: flex;
    flex-direction: column;
    width: min(28rem, calc(100% - 1.5rem));
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: var(--theme-panel-shadow, 0 1.25rem 4rem rgba(0, 0, 0, 0.62));
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
    pointer-events: auto;
  }

  .intro-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.625rem 0.25rem 1rem;
  }

  .step-dots {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .step-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
  }

  .step-dot.active {
    background: var(--theme-accent, #4a9eff);
  }

  .skip-button {
    min-width: 3.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    cursor: pointer;
  }

  .skip-button:hover,
  .skip-button:focus-visible {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .intro-card h2 {
    margin: 0;
    padding: 0 1rem 0.75rem;
    font-size: 1.125rem;
    line-height: 1.25;
  }

  .intro-body {
    position: relative;
    height: 10.75rem;
    min-height: 0;
    padding: 0 1rem;
  }

  .step-content {
    height: 100%;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .step-content > :global(*) {
    width: 100%;
  }

  .step-content p {
    margin: 0.75rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .preset-strip {
    display: flex;
    gap: 0.625rem;
    overflow-x: auto;
    padding: 0.125rem 0.125rem 0.625rem;
    scrollbar-width: thin;
  }

  .preset-poster {
    flex: 0 0 7rem;
    aspect-ratio: 4 / 3;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .preset-poster:hover,
  .preset-poster:focus-visible {
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
  }

  .preset-poster img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preset-skeleton {
    cursor: default;
    background: var(--theme-card-hover-bg);
    animation: preset-pulse 1.4s ease-in-out infinite alternate;
  }

  @keyframes preset-pulse {
    from {
      opacity: 0.45;
    }
    to {
      opacity: 0.85;
    }
  }

  .intro-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.875rem 1rem 1rem;
  }

  .back-slot {
    min-width: 5rem;
    min-height: var(--min-touch-target, 44px);
  }

  @container (max-height: 29rem) {
    .intro-card {
      /* Still clears the transport; only the card's own padding tightens. */
      bottom: max(5rem, calc(5rem + env(safe-area-inset-bottom)));
    }

    .intro-header {
      padding-top: 0.25rem;
    }

    .intro-card h2 {
      padding-bottom: 0.5rem;
    }

    .intro-body {
      height: 8rem;
    }

    .intro-footer {
      padding-block: 0.5rem;
    }
  }
</style>
