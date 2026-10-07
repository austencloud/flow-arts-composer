<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { tick } from "svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import HandPropToolbar from "$lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import { localizedPropName } from "$lib/shared/settings/components/tabs/prop-type/localized-prop-name";
  import type { PillId } from "$lib/shared/animation-panel/pill-nav/pill-types";
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
  function sectionTitle(section: PillId | null): string {
    switch (section) {
      case "grid":
        return t("shape_engine_settings_grid");
      case "layers":
        return t("shape_engine_settings_layers");
      case "props":
        return t("shape_engine_props");
      case "effects":
        return t("shape_engine_settings_effects");
      case "motion":
        return t("shape_engine_settings_effort");
      case "effort":
        return t("shape_engine_settings_effort");
      case "playback":
        return t("shape_engine_settings_playback");
      case "display":
        return t("shape_engine_settings_display");
      case "export":
        return t("shape_engine_settings_export");
      default:
        return "";
    }
  }
  const title = $derived(
    propsOpen ? t("shape_engine_props") : sectionTitle(animation.activeSection)
  );
  const theory = $derived(app.surface === "theory");
  const theoryEffects = ["trails", ...CANVAS2D_HOSTED_EFFECTS] as const;
  // The pair when cat dog is on ("Staff / Fan"), the one prop otherwise.
  const selectedName = $derived(
    app.catDog
      ? `${localizedPropName(app.leftPropType)} / ${localizedPropName(app.rightPropType)}`
      : localizedPropName(app.leftPropType)
  );
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
  aria-label={propsOpen
    ? t("shape_engine_choose_prop")
    : t("shape_engine_settings_for", { name: title })}
>
  {#snippet doneButton()}
    <PanelButton variant="primary" bind:ref={done} onclick={close}>
      <i class="fas fa-check" aria-hidden="true"></i>
      {t("shape_engine_done")}
    </PanelButton>
  {/snippet}
  {#if propsOpen}
    <!-- Its own row above the grid, not the heading: the heading shares its
         line with the Standard/Big size toggle and Done, which leaves no
         room for the chip and hand segments at phone width. -->
    <HandPropToolbar handProps={app.handProps} />
    <BentoPropGrid
      selectedPropType={app.addressedPropType}
      onSelect={(next, look) => void app.setPropType(next, undefined, look)}
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
        fillPages
        presentation="content"
        controlledSection={animation.activeSection}
        isPlaying={animation.playing}
        bpm={animation.bpm}
        playbackMode={animation.playbackMode}
        onPlaybackToggle={animation.togglePlaying}
        onBpmChange={animation.setBpm}
        showTempoControls={false}
        showEffectsPlayback={false}
        selectedPropType={app.addressedPropType}
        onPropChange={(next, look) =>
          void app.setPropType(next, undefined, look)}
        handProps={app.handProps}
        sequence={theory ? null : animation.previewSequence}
        showPathShape={false}
        showMotionVisibility={true}
        showSequenceMarks={!theory}
        availableEffects={theory ? theoryEffects : undefined}
        regionLabel={t("shape_engine_settings_for", { name: title })}
      />
    </div>
  {/if}
</section>

<style>
  .focus-workspace {
    display: flex;
    /* The props branch stacks the hand toolbar above the grid; the settings
       branch switches to grid below and ignores this. */
    flex-direction: column;
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
  /* The rail keeps the room it needs for readable tiles, and the colours
     below it scroll into view on a short phone instead of squeezing it. */
  .focus-workspace:not(.settings) {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .focus-workspace:not(.settings) > :global(.prop-grid-root) {
    flex: 1 0 16rem;
    min-height: 16rem;
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
  .selection {
    display: block;
    min-width: 0;
    font-size: var(--font-size-min, 0.875rem);
    overflow-wrap: anywhere;
  }
</style>
