<script lang="ts">
  import { tick } from "svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { getEscapeLayerManager } from "$lib/shared/keyboard/get-escape-layer-manager";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { getShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import { CANVAS2D_HOSTED_EFFECTS } from "$lib/shared/effects/services/canvas2d-effect-host";

  const app = getShapeMatrixAppContext();
  const animation = getShapeMatrixAnimationContext();
  const propsOpen = $derived(
    app.propPickerOpen || animation.activeSection === "props"
  );
  const title = $derived(
    propsOpen
      ? "Props"
      : animation.activeSection === "motion"
        ? "Effort"
        : (animation.activeSection?.charAt(0).toUpperCase() ?? "") +
          (animation.activeSection?.slice(1) ?? "")
  );
  const theory = $derived(app.surface === "theory");
  const theoryEffects = ["trails", ...CANVAS2D_HOSTED_EFFECTS] as const;
  const selectedName = $derived(getPropTypeDisplayInfo(app.propType).label);
  let done: HTMLButtonElement | null = $state(null);

  function close(): void {
    app.closePropPicker();
    animation.showRelationships();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    getEscapeLayerManager().dismissTopLayer();
  }

  $effect(() => {
    const origin = document.activeElement;
    const unregister = getEscapeLayerManager().register({
      id: "shape-matrix:focus-workspace",
      canDismiss: () => true,
      dismiss: close,
    });
    void tick().then(() => done?.focus({ preventScroll: true }));
    return () => {
      unregister();
      void tick().then(() => {
        if (origin instanceof HTMLElement && origin.isConnected)
          origin.focus({ preventScroll: true });
      });
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<section
  class="focus-workspace"
  class:settings={!propsOpen}
  aria-label={propsOpen ? "Choose a prop" : `${title} settings`}
>
  {#snippet doneButton()}
    <PanelButton variant="primary" bind:ref={done} onclick={close}>
      <i class="fas fa-check" aria-hidden="true"></i>
      Done
    </PanelButton>
  {/snippet}
  {#if propsOpen}
    <BentoPropGrid
      selectedPropType={app.propType}
      onSelect={(next) => void app.setPropType(next)}
      variant="inline"
      accessMode="educational"
      flat
      tileDensity="comfortable"
      layout="rail"
    >
      {#snippet heading()}
        <strong class="selection" aria-live="polite">{selectedName}</strong>
      {/snippet}
      {#snippet actions()}
        {@render doneButton()}
      {/snippet}
    </BentoPropGrid>
  {:else}
    <header class="toolbar">
      <strong>{title}</strong>{@render doneButton()}
    </header>
    <div
      class="settings-body"
      class:effort={animation.activeSection === "effort" ||
        animation.activeSection === "motion"}
    >
      <AnimationPanel
        isExporting={false}
        layout="bottom"
        presentation="content"
        controlledSection={animation.activeSection}
        isPlaying={animation.playing}
        bpm={animation.bpm}
        playbackMode={animation.playbackMode}
        onPlaybackToggle={animation.togglePlaying}
        onPlaybackModeChange={animation.setPlaybackMode}
        onBpmChange={animation.setBpm}
        showEffectsPlayback={false}
        selectedPropType={app.propType}
        onPropChange={(next) => void app.setPropType(next)}
        sequence={theory ? null : animation.previewSequence}
        showPathShape={false}
        showMotionVisibility={true}
        showSequenceMarks={!theory}
        availableEffects={theory ? theoryEffects : undefined}
        regionLabel={`${title} controls`}
      />
    </div>
  {/if}
</section>

<style>
  .focus-workspace {
    display: flex;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 20px 20px 0 0;
    background: var(--theme-panel-bg, #0a0f14);
  }
  .focus-workspace.settings {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    padding: 0.375rem 0.75rem;
    font-size: var(--font-size-min, 14px);
  }
  .settings-body {
    min-height: 0;
    overflow: hidden;
  }
  .settings-body.effort :global(.section-pad) {
    height: 100%;
  }
  .settings-body.effort :global(.effort-grid) {
    flex: 1;
    grid-auto-rows: minmax(56px, 1fr);
  }
  .settings-body.effort :global(.effort-btn) {
    font-size: var(--font-size-min, 14px);
  }
  @container shape-matrix-app (max-width: 30rem) {
    .settings-body.effort :global(.effort-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .selection {
    display: block;
    min-width: 0;
    font-size: var(--font-size-min, 0.875rem);
    overflow-wrap: anywhere;
  }
</style>
