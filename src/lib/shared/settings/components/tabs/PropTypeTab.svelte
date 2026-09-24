<!--
  PropTypeTab.svelte - Settings > Props.

  Two cards that share the page height:
  - "Your props": the current props drawn large in the performer's colors,
    the color pair, and the ten presets. The drawing takes whatever height
    the other two leave, so the card fills its column instead of towering
    over the picker.
  - "Select prop": the Cat Dog switch and the prop grid, one grid for both
    hands or one per hand.

  Below 54rem the cards stack and the tab scrolls as one page. From 54rem
  they sit side by side and each card scrolls on its own only when its
  content truly outgrows the screen (the open color editor on a short
  laptop). The layout reads the tab's own width, so it holds in any host.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { AppSettings, PropPreset } from "../../domain/app-settings";
  import {
    defaultPropPresets,
    presetFromSettings,
    presetSettingsPatch,
    presetSlots,
    presetsMatch,
  } from "../../domain/prop-presets";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { resolveViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import CatDogToggle from "./prop-type/CatDogToggle.svelte";
  import PresetChipBar from "./prop-type/PresetChipBar.svelte";
  import PrimaryPropColorSettings from "./prop-type/PrimaryPropColorSettings.svelte";
  import BentoPropGrid from "./prop-type/BentoPropGrid.svelte";
  import { previewPair } from "./prop-type/prop-preview-pair";
  import type {
    ChiralityHand,
    PropChiralityHandState,
    PropChiralitySeam,
  } from "./prop-type/prop-chirality-seam";

  let { settings, onUpdate } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  }>();

  const uid = $props.id();

  let hapticService: HapticFeedback | undefined;
  let hasKeyboard = $state(false);

  // Local mirrors of the settings this tab edits. Every change is written
  // here first and published through onUpdate, so the page answers on the
  // same frame instead of waiting for the settings round trip.
  let selectedLeftPropType = $state(PropType.STAFF);
  let selectedRightPropType = $state(PropType.STAFF);
  let catDogMode = $state(false);
  let leftBuugengFlipped = $state(false);
  let rightBuugengFlipped = $state(false);
  let propPresets = $state<(PropPreset | null)[]>(presetSlots(undefined));
  let selectedPresetIndex = $state(-1);

  // Turning Cat Dog off copies the left prop to the right hand; turning it
  // back on restores the right prop the performer had.
  let rememberedRightProp = $state<PropType | null>(null);

  // Which hand the one visible grid edits when Cat Dog is on and the picker
  // is too narrow for two grids.
  let narrowHand = $state<ChiralityHand>("left");

  onMount(() => {
    hapticService = getHapticFeedback();
    const deviceDetector = getDeviceDetector();
    const readKeyboard = () => {
      hasKeyboard = deviceDetector?.getCapabilities().hasKeyboard ?? false;
    };
    readKeyboard();
    return deviceDetector?.onCapabilitiesChanged(readKeyboard);
  });

  $effect(() => {
    selectedLeftPropType =
      settings.leftPropType || settings.propType || PropType.STAFF;
    selectedRightPropType =
      settings.rightPropType || settings.propType || PropType.STAFF;
    catDogMode = settings.catDogMode ?? false;
    leftBuugengFlipped = settings.leftBuugengFlipped ?? false;
    rightBuugengFlipped = settings.rightBuugengFlipped ?? false;
    propPresets = presetSlots(settings.propPresets);
    selectedPresetIndex = settings.selectedPresetIndex ?? -1;
  });

  const current = $derived(
    presetFromSettings({
      leftPropType: selectedLeftPropType,
      rightPropType: selectedRightPropType,
      catDogMode,
      leftBuugengFlipped,
      rightBuugengFlipped,
    })
  );
  const pair = $derived(previewPair(current));
  const leftName = $derived(getPropTypeDisplayInfo(pair.left).label);
  const rightName = $derived(getPropTypeDisplayInfo(pair.right).label);
  const splitHands = $derived(pair.left !== pair.right);
  const darkMode = $derived(settings.darkMode ?? true);
  const palette = $derived(
    resolveViewerCustomColorPair(settings.primaryPropColors, {
      left: getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"),
      right: getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"),
    })
  );

  function publish(patch: Partial<AppSettings>) {
    for (const [key, value] of Object.entries(patch)) {
      onUpdate?.({ key, value });
    }
  }

  // ── Presets ────────────────────────────────────────────────────────────

  function applyPreset(index: number) {
    const preset = propPresets[index];
    if (!preset) return;
    hapticService?.trigger("selection");
    const patch = presetSettingsPatch(preset, index);
    selectedPresetIndex = patch.selectedPresetIndex;
    selectedLeftPropType = patch.leftPropType;
    selectedRightPropType = patch.rightPropType;
    catDogMode = patch.catDogMode;
    leftBuugengFlipped = patch.leftBuugengFlipped;
    rightBuugengFlipped = patch.rightBuugengFlipped;
    publish(patch);
  }

  function writePresets(next: (PropPreset | null)[], nextSelected: number) {
    propPresets = next;
    selectedPresetIndex = nextSelected;
    // Nulls stay in the array so every preset keeps its slot and its key.
    publish({ propPresets: next, selectedPresetIndex: nextSelected });
  }

  /** Every preset write can be taken back from the toast it raises. */
  function changePresets(
    next: (PropPreset | null)[],
    nextSelected: number,
    message: string
  ) {
    hapticService?.trigger("selection");
    const previous = [...propPresets];
    const previousSelected = selectedPresetIndex;
    writePresets(next, nextSelected);
    showToast({
      message,
      type: "info",
      duration: 6000,
      action: {
        label: t("settings_preset_undo"),
        onClick: () => writePresets(previous, previousSelected),
      },
    });
  }

  function savePreset(index: number) {
    const next = [...propPresets];
    const replaced = next[index] !== null;
    next[index] = { ...current };
    changePresets(
      next,
      index,
      t(replaced ? "settings_preset_updated" : "settings_preset_saved", {
        n: index + 1,
      })
    );
  }

  function clearPreset(index: number) {
    const next = [...propPresets];
    next[index] = null;
    changePresets(
      next,
      selectedPresetIndex === index ? -1 : selectedPresetIndex,
      t("settings_preset_cleared", { n: index + 1 })
    );
  }

  /** Restores the ten starting presets. The props in use stay as they are. */
  function resetPresets() {
    const defaults = defaultPropPresets();
    changePresets(
      defaults,
      defaults.findIndex((preset) => presetsMatch(preset, current)),
      t("settings_presets_reset")
    );
  }

  // ── Prop choice ────────────────────────────────────────────────────────
  // None of these touch the presets. A preset changes only when the
  // performer saves to it; the shelf offers "Update preset N" when the props
  // drift from the one last applied.

  function toggleCatDogMode() {
    hapticService?.trigger("selection");
    const next = !catDogMode;

    if (next) {
      if (rememberedRightProp !== null) {
        selectedRightPropType = rememberedRightProp;
        onUpdate?.({ key: "rightPropType", value: rememberedRightProp });
        rememberedRightProp = null;
      }
    } else {
      if (selectedRightPropType !== selectedLeftPropType) {
        rememberedRightProp = selectedRightPropType;
      }
      selectedRightPropType = selectedLeftPropType;
      onUpdate?.({ key: "rightPropType", value: selectedLeftPropType });
    }

    catDogMode = next;
    onUpdate?.({ key: "catDogMode", value: catDogMode });
  }

  // The left grid, which is also the shared grid when Cat Dog is off.
  function handleInlineSelect(propType: PropType) {
    hapticService?.trigger("selection");
    selectedLeftPropType = propType;
    onUpdate?.({ key: "leftPropType", value: propType });
    if (!catDogMode) {
      selectedRightPropType = propType;
      onUpdate?.({ key: "rightPropType", value: propType });
    }
  }

  function handleInlineSelectRed(propType: PropType) {
    hapticService?.trigger("selection");
    selectedRightPropType = propType;
    onUpdate?.({ key: "rightPropType", value: propType });
  }

  // Buugeng chirality. Written through the tab's own local mirrors rather than
  // the global seam, because this tab keeps $state copies of every setting and
  // publishes them through onUpdate — a direct settings write would leave the
  // mirrors (and the preset row that reads them) stale.
  // Each hand keeps its own handedness even when both hands share a prop
  // type. Two buugeng of the same chirality stay apart; two of opposite
  // chirality nest into one shape, so mirroring left onto right would erase the
  // distinction the setting exists to make.
  function setChirality(hand: ChiralityHand, flipped: boolean) {
    hapticService?.trigger("selection");

    if (hand === "left") {
      leftBuugengFlipped = flipped;
      onUpdate?.({ key: "leftBuugengFlipped", value: leftBuugengFlipped });
    } else {
      rightBuugengFlipped = flipped;
      onUpdate?.({ key: "rightBuugengFlipped", value: rightBuugengFlipped });
    }
  }

  function chiralityHand(hand: ChiralityHand): PropChiralityHandState {
    return {
      hand,
      get flipped() {
        return hand === "left" ? leftBuugengFlipped : rightBuugengFlipped;
      },
    };
  }

  function chiralitySeam(...hands: ChiralityHand[]): PropChiralitySeam {
    return { hands: hands.map(chiralityHand), onChange: setChirality };
  }

  const bothHands = chiralitySeam("left", "right");
  const leftHand = chiralitySeam("left");
  const rightHand = chiralitySeam("right");

  // Side by side (the props-tab query in the styles), the picker card has a
  // definite height, so its grids size their tiles to fill it. Stacked, the
  // tab scrolls and a grid measuring its host would grow what it measures.
  const SIDE_BY_SIDE_REM = 54;
  let tabWidth = $state(0);
  let remPx = $state(16);
  onMount(() => {
    remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  });
  const pickerBounded = $derived(tabWidth >= SIDE_BY_SIDE_REM * remPx);
</script>

<div class="prop-type-tab" bind:clientWidth={tabWidth}>
  <div class="tab-grid">
    <section class="card setup-card" aria-labelledby="{uid}-setup">
      <h3 class="card-title" id="{uid}-setup">
        {t("settings_props_your_props")}
      </h3>

      <figure class="stage">
        <div class="stage-art" aria-hidden="true">
          <PropCompositionPreview
            propType={pair.left}
            rightPropType={pair.right}
            size={256}
            pairedGlyph
            darkBackground={darkMode}
            colors={settings.primaryPropColors}
            leftFlipped={pair.leftFlipped}
            rightFlipped={pair.rightFlipped}
          />
        </div>
        <figcaption class="stage-caption">
          <Crossfade key={splitHands ? `${leftName}|${rightName}` : leftName}>
            {#if splitHands}
              <span class="hand-names">
                <span class="hand-name">
                  <span class="hand-dot" style:background={palette.left}></span>
                  <span class="visually-hidden"
                    >{t("settings_props_left_hand")}:</span
                  >
                  {leftName}
                </span>
                <span class="hand-name">
                  <span class="hand-dot" style:background={palette.right}
                  ></span>
                  <span class="visually-hidden"
                    >{t("settings_props_right_hand")}:</span
                  >
                  {rightName}
                </span>
              </span>
            {:else}
              <span class="setup-name">{leftName}</span>
            {/if}
          </Crossfade>
        </figcaption>
      </figure>

      <PrimaryPropColorSettings
        colors={settings.primaryPropColors}
        {darkMode}
        onchange={(value) => onUpdate?.({ key: "primaryPropColors", value })}
      />

      <PresetChipBar
        slots={propPresets}
        {current}
        selectedIndex={selectedPresetIndex}
        colors={settings.primaryPropColors}
        {darkMode}
        showShortcuts={hasKeyboard}
        onApply={applyPreset}
        onSave={savePreset}
        onClear={clearPreset}
        onResetAll={resetPresets}
      />
    </section>

    <section class="card picker-card" aria-labelledby="{uid}-picker">
      <header class="picker-head">
        <div class="picker-title">
          <h3 class="card-title" id="{uid}-picker">
            {t("settings_props_select_prop")}
          </h3>
          <span class="mode-hint">
            <Crossfade key={catDogMode}>
              {catDogMode
                ? t("settings_different_props")
                : t("settings_same_props")}
            </Crossfade>
          </span>
        </div>
        <CatDogToggle {catDogMode} onToggle={toggleCatDogMode} />
      </header>

      {#if catDogMode}
        <div class="hand-switch" transition:growFade>
          <SegmentedControl
            options={[
              { value: "left", label: t("settings_props_left_hand"), tone: "blue" },
              { value: "right", label: t("settings_props_right_hand"), tone: "red" },
            ]}
            value={narrowHand}
            onchange={(hand) => {
              hapticService?.trigger("selection");
              narrowHand = hand;
            }}
            color="accent"
            size="sm"
          />
        </div>
      {/if}

      <!-- The left grid stays mounted across the Cat Dog switch; the right
           grid grows in beside it (or is picked with the switch above when
           the card is narrow). -->
      <div class="hand-grids" data-hand={catDogMode ? narrowHand : "left"}>
        <div class="hand-grid left">
          {#if catDogMode}
            <h4 class="hand-heading" transition:growFade>
              <span class="hand-dot" style:background={palette.left}></span>
              {t("settings_props_left_hand")}
            </h4>
          {/if}
          <BentoPropGrid
            variant="inline"
            selectedPropType={selectedLeftPropType}
            color="blue"
            title={catDogMode
              ? t("settings_props_left_hand")
              : t("settings_props_select_prop")}
            onSelect={handleInlineSelect}
            chirality={catDogMode ? leftHand : bothHands}
            fill={pickerBounded}
          />
        </div>
        {#if catDogMode}
          <div class="hand-grid right" transition:growFade={{ axis: "x" }}>
            <h4 class="hand-heading">
              <span class="hand-dot" style:background={palette.right}></span>
              {t("settings_props_right_hand")}
            </h4>
            <BentoPropGrid
              variant="inline"
              selectedPropType={selectedRightPropType}
              color="red"
              title={t("settings_props_right_hand")}
              onSelect={handleInlineSelectRed}
              chirality={rightHand}
              fill={pickerBounded}
            />
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  /* The tab is the page's scroller while the cards stack. Side by side, the
     grid below fits it exactly and each card owns its own overflow. */
  .prop-type-tab {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    max-width: var(--shell-w, 100%);
    min-height: 0;
    margin: 0 auto;
    overflow-y: auto;
    box-sizing: border-box;
    container: props-tab / inline-size;
  }

  .tab-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.75rem;
    flex: 0 0 auto;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    padding: 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    box-sizing: border-box;
  }

  .card-title {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
  }

  /* ── Your props ── */

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 0;
  }

  /* The drawing is square and as large as the stage allows, capped so a
     tall column does not blow a two-prop glyph up past what reads well. */
  .stage-art {
    display: grid;
    place-items: center;
    width: 100%;
    height: 9rem;
    min-height: 0;
    container-type: size;
  }

  .stage-art :global(.prop-composition-preview) {
    width: min(100cqi, 100cqb, 26rem);
    height: min(100cqi, 100cqb, 26rem);
  }

  /* A landscape phone keeps the controls within the first screen. */
  @media (max-height: 30rem) {
    .stage-art {
      height: 6rem;
    }
  }

  .stage-caption {
    display: flex;
    justify-content: center;
    min-height: 1.5rem;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
  }

  .hand-names {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem 1rem;
  }

  .hand-name,
  .hand-heading {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hand-dot {
    flex: 0 0 auto;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
  }

  /* ── Select prop ── */

  .picker-card {
    padding: 0;
    gap: 0;
    container: props-picker / inline-size;
  }

  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1rem 0.25rem 1.125rem;
  }

  .picker-title {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .mode-hint {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .hand-switch {
    padding: 0.5rem 1rem 0;
  }

  .hand-grids {
    display: flex;
    min-height: 0;
  }

  .hand-grid {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  /* The left grid takes whatever the right one leaves, so the right grid's
     width animation reads as the card splitting in two. */
  .hand-grid.left {
    flex: 1 1 0;
  }

  .hand-grid.right {
    flex: 0 0 auto;
    width: 50%;
    border-left: 1px solid var(--theme-stroke);
  }

  .hand-heading {
    margin: 0;
    padding: 0.75rem 1.125rem 0;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
  }

  /* Two grids only once each can show a hand's props without scrolling;
     narrower, one grid and the switch picks its hand. */
  @container props-picker (width < 70rem) {
    .hand-grid.right {
      width: 100%;
    }

    .hand-grids[data-hand="left"] .hand-grid.right,
    .hand-grids[data-hand="right"] .hand-grid.left {
      display: none;
    }

    .hand-grid.right {
      border-left: none;
    }

    .hand-heading {
      display: none;
    }
  }

  @container props-picker (width >= 70rem) {
    .hand-switch {
      display: none;
    }
  }

  /* ── Side by side ── */

  @container props-tab (min-width: 54rem) {
    .tab-grid {
      flex: 1 1 0;
      min-height: 0;
      grid-template-columns: clamp(22rem, 34cqi, 28rem) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      gap: 1.25rem;
      padding: 1rem;
    }

    .card {
      min-height: 0;
    }

    /* The gutter is always reserved, so a scrollbar appearing never narrows
       the color editor below its two-column width and keeps itself there.
       The inline padding plus a gutter on each side reads as 1.25rem. */
    .setup-card {
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-gutter: stable both-edges;
      padding: 1.25rem 0.75rem;
      gap: 1.25rem;
    }

    /* The stage absorbs the card's spare height and gives it back when the
       color editor opens, down to the art's floor; past that the card
       scrolls. Art and name stay together, centred in whatever is spare. */
    .stage {
      flex: 1 1 auto;
    }

    .stage-art {
      flex: 1 1 9rem;
      height: auto;
      min-height: 7rem;
      max-height: 26rem;
    }

    .picker-card {
      overflow: hidden;
    }

    .hand-grids {
      flex: 1 1 0;
    }
  }

  /* Wide enough for the color editor's two-column layout (42rem inside the
     card's padding and gutters) while the picker keeps eight columns. */
  @container props-tab (min-width: 97.5rem) {
    .tab-grid {
      grid-template-columns: 46rem minmax(0, 1fr);
    }
  }
</style>
