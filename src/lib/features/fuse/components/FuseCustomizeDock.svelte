<!--
  Customize where Fuse has no room for a side column: a dock under the combined
  preview, in place of its button row, so the result stays in view while it is
  changed. It is the shared AnimationPanel in its phone-dock arrangement, the
  one the Shape Engine docks under its player, with one page at a time: the
  effects, how hard the props move, and what the canvas shows. While an effect
  is tuned, this header carries the tune view's back button, name and power
  button in place of the page tabs, so the dock body keeps its whole height for
  the controls.
-->
<script lang="ts">
  import { tick, untrack } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import AnimationPanel from "#lib/shared/animation-panel/components/AnimationPanel.svelte";
  import type { PillId } from "#lib/shared/animation-panel/pill-nav/pill-types";
  import ActiveEffectChip from "#lib/shared/animation-engine/components/effects-panel/ActiveEffectChip.svelte";
  import { effectCatalogLooks } from "#lib/shared/animation-engine/components/effects-panel/effect-catalog-looks.js";
  import type { EffectTuneHeading } from "#lib/shared/animation-engine/components/effects-panel/effect-tune-heading.js";
  import { setAnimationVisibilityContext } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getFuseContext } from "../context/fuse-context";
  import { getFuseDisplay } from "../state/fuse-display";
  import { fuseRecipePanel } from "../state/fuse-recipe-panel.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const { state: fuseState } = getFuseContext();
  const settings = getSettings();
  const effects = getEffectsConfigContext();
  setAnimationVisibilityContext(getFuseDisplay());

  let tuning = $state<EffectTuneHeading | null>(null);
  let doneButton = $state<HTMLButtonElement | null>(null);
  /** Done's width beside the tabs, kept while the tune heading replaces them. */
  let doneWidth = $state<number | null>(null);

  const PAGES = ["effects", "effort", "display"] as const;
  type DockPage = (typeof PAGES)[number];
  // The wide column's Motion page holds Effort, so the two share a page.
  const page = $derived<DockPage>(
    fuseRecipePanel.section === "motion"
      ? "effort"
      : (PAGES.find((id) => id === fuseRecipePanel.section) ?? "effects")
  );
  const pageOptions = $derived([
    { value: "effects" as const, label: t("viewer_ui_effects") },
    { value: "effort" as const, label: t("viewer_ui_effort") },
    { value: "display" as const, label: t("viewer_ui_display") },
  ]);
  const tunedLook = $derived(
    tuning && effects ? effectCatalogLooks(effects).get(tuning.effectId) : null
  );

  // EffectsPanel calls this from its own effect, so reading the width here
  // without untrack would make that effect rerun on every write: a loop.
  function showTuneHeading(heading: EffectTuneHeading | null): void {
    untrack(() => {
      doneWidth = heading
        ? (doneWidth ?? doneButton?.offsetWidth ?? null)
        : null;
    });
    tuning = heading;
  }

  function openPage(next: PillId): void {
    fuseRecipePanel.section = next;
  }

  // The dock replaces the button that opened it, so focus moves to Done.
  $effect(() => {
    void tick().then(() => doneButton?.focus({ preventScroll: true }));
  });
</script>

<section class="customize-dock" aria-label={t("shape_engine_customize_aria")}>
  <header
    class="dock-head"
    style:--done-width={doneWidth ? `${doneWidth}px` : undefined}
  >
    {#if tuning}
      <div class="tune-heading" style:--effect-accent={tuning.accent}>
        <button type="button" class="tune-back" onclick={tuning.back}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{tuning.backLabel}</span>
        </button>
        <strong class="tune-name">
          <ActiveEffectChip
            effectId={tuning.effectId}
            look={tunedLook ?? undefined}
          />
          <span>{tuning.label}</span>
        </strong>
        <button
          type="button"
          class="tune-power"
          aria-label={tuning.turnOffLabel}
          title={tuning.turnOffLabel}
          onclick={tuning.turnOff}
        >
          <i class="fas fa-power-off" aria-hidden="true"></i>
        </button>
      </div>
    {:else}
      <div class="page-tabs">
        <SegmentedControl
          options={pageOptions}
          value={page}
          onchange={openPage}
          size="phone"
          density="tight"
          color="accent"
          semantics="tabs"
          ariaLabel={t("shape_engine_customize")}
        />
      </div>
    {/if}
    <PanelButton
      variant="primary"
      size="compact"
      bind:ref={doneButton}
      onclick={onClose}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>{t("shape_engine_done")}</span>
    </PanelButton>
  </header>
  <div class="dock-body">
    <AnimationPanel
      isExporting={false}
      layout="bottom"
      presentation="content"
      fillPages
      controlledSection={page}
      onEffectTuneHeading={showTuneHeading}
      isPlaying={fuseState.clockRunning}
      bpm={fuseState.bpm}
      onPlaybackToggle={() => fuseState.toggleClock()}
      onBpmChange={(value) => fuseState.setBpm(value)}
      showTempoControls={false}
      showEffectsPlayback={false}
      showPathShape={false}
      showWordToggle={false}
      showProgressToggle={false}
      selectedPropType={settings.leftPropType}
      sequence={fuseState.previewSequence}
      regionLabel={t("shape_engine_customize_aria")}
    />
  </div>
</section>

<style>
  .customize-dock {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    flex: 0 0 auto;
    /* Phone tap size for every control in here: the stage asks for 48px, which
       pushed the Tune row out of the bottom of the dock. */
    --min-touch-target: var(--alt-touch-target, 36px);
    /* Two rows of Display tiles fill the body as the Effort tiles do. */
    --vis-row-max: 120px;
    /* EffectsPanel's dock arrangement is drawn for about 360 x 215-310px, and
       draws its effects as pictures from about a 250px body, which is 303px
       with the header and border. */
    height: clamp(310px, 43dvh, 360px);
    min-width: 0;
    overflow: hidden;
    container: fuse-customize-dock / inline-size;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.04));
  }

  .dock-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    min-width: 0;
    padding: 0.125rem 0.5rem;
  }

  /* Each tab is as wide as its own words: in equal thirds Italian
     "Visualizzazione" and Russian "Отображение" ran over their neighbours. The
     tabs take what their words need and grow into the rest; a name of two
     words may use two lines. */
  .page-tabs {
    flex: 1 0 auto;
    width: min-content;
  }

  .page-tabs :global(.ui-segments.segmented-control.phone button) {
    flex: 1 1 auto;
    min-width: min-content;
    line-height: 1.15;
    text-align: center;
  }

  /* Done gives way to the tabs: where its word does not fit beside them, the
     word wraps under the check, out of the button's height, and stays its
     accessible name. */
  .dock-head :global(.panel-btn) {
    flex: 0 1 var(--done-width, auto);
    flex-wrap: wrap;
    align-content: flex-start;
    row-gap: 0;
    overflow: hidden;
  }

  .dock-head :global(.panel-btn > *) {
    flex: none;
    line-height: calc(var(--alt-touch-target, 36px) - 2px);
  }

  .tune-heading {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .tune-back,
  .tune-power {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: var(--alt-touch-target, 36px);
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.04));
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }

  .tune-back {
    padding: 0 0.625rem;
  }

  .tune-back i {
    color: var(--effect-accent);
  }

  .tune-power {
    width: var(--alt-touch-target, 36px);
    color: var(--theme-text-dim, rgb(255 255 255 / 0.6));
  }

  .tune-back:hover,
  .tune-power:hover {
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.2));
    background: var(--theme-card-hover-bg, rgb(255 255 255 / 0.07));
  }

  .tune-back:focus-visible,
  .tune-power:focus-visible {
    outline: 2px solid var(--effect-accent);
    outline-offset: 2px;
  }

  .tune-name {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
  }

  .tune-name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The panel keeps its content out of its own height (size containment), so
     a tune view taller than the dock, with Fine tuning open, scrolls here, as
     it does under the Shape Engine's player. */
  .dock-body {
    min-height: 0;
    overflow: hidden auto;
  }

  /* The shortest phones keep the height for the result: 270px is the header,
     the border and the 216px the one-line effect tiles need. */
  @container fuse (max-height: 35.5rem) {
    .customize-dock {
      height: 270px;
    }
  }

  /* On a phone the back label would squeeze the effect's name down to one
     letter, so the back button keeps only its arrow and the label stays as
     its accessible name. */
  @container fuse-customize-dock (max-width: 26rem) {
    .tune-back {
      width: var(--alt-touch-target, 36px);
      padding: 0;
    }

    .tune-back span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tune-back,
    .tune-power {
      transition: none;
    }
  }
</style>
