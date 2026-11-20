<script lang="ts">
  import { flushSync, setContext, type Snippet, type Component } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { effectUiLabel } from "./effect-ui-label";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import {
    isEffectId,
    type EffectId,
  } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import EffectSelector from "./EffectSelector.svelte";
  import { chooseHandBarStep, type HandBarStep } from "./hand-bar-step.js";
  import HandPropToolbar, {
    type HandPropToolbarProps,
    type PropHandChoice,
  } from "#lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import type { PropEffectTarget } from "#lib/shared/effects/domain/per-prop-effects.js";
  import EffectsInspector from "./EffectsInspector.svelte";
  import LedCustomize from "./customize/LedCustomize.svelte";
  import EffectDock from "./EffectDock.svelte";
  import { EFFECTS, EFFECT_LABELS, getRegistration } from "./effect-registry";
  import type { EffectRegistration } from "./effect-registry";
  import EffectPresetThumbnail from "./EffectPresetThumbnail.svelte";
  import { formatForPictureWidth } from "./picture-format";
  import { effectCatalogLooks } from "./effect-catalog-looks";
  import {
    fitEffectCatalog,
    fitEffectPicker,
    fitEffectPictures,
    fitEffectRoster,
    holdEffectRoster,
  } from "#lib/shared/animation-engine/domain/effect-catalog-fit.js";
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    matchPresetId,
    pickedPresetId,
    valuesEqual,
  } from "./presets/match-preset";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { Crossfade, flexPresence } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { startMorph } from "#lib/shared/transitions/results-morph.js";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import EffectTuneStrip from "#lib/shared/effects/components/EffectTuneStrip.svelte";
  import { primaryControls } from "#lib/shared/effects/domain/effect-control-manifest.js";
  import { createEffectControlOverrides } from "#lib/shared/effects/effect-control-fields.js";
  import {
    animationSettings,
    type AnimationSettingsState,
  } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import EffectsPlaybackBar from "./EffectsPlaybackBar.svelte";
  import type { EffectTuneHeading } from "./effect-tune-heading";
  import { effectInk } from "./effect-ink";
  import { getThemeMode } from "#lib/shared/theme/state/theme-mode-state.svelte.js";
  import {
    LED_CUSTOMIZE_PAGE_CONTEXT,
    type LedCustomizePageState,
  } from "./led-customize-page-context";

  /** Synthetic chip id for the factory default look (not a named preset). */
  const DEFAULT_CHIP_ID = "__default__";
  /** Synthetic chip id for the user's auto-captured custom look. */
  const CUSTOM_CHIP_ID = "__custom__";
  import type { PrimaryParamSpec } from "./effect-primary-param";

  interface Props {
    bpm: number;
    onBpmChange: (bpm: number) => void;
    isPlaying: boolean;
    onPlaybackToggle: () => void;
    onStepForward?: () => void;
    onStepBackward?: () => void;
    onHalfStepForward?: () => void;
    onHalfStepBackward?: () => void;
    showPlayback?: boolean;
    showTransport?: boolean;
    showExportControls?: boolean;
    layout?: "sidebar" | "strip" | "grid";
    /** Off when the host already titles this page "Effects". */
    showHeading?: boolean;
    /**
     * The host sets this panel's height from something else on screen (the
     * motion-paths studio card matches its canvas) and wants the page to use
     * all of it. While no effect is on, the roster turns into a catalog of
     * pictures that fills the card. Sidebar layout only.
     */
    fill?: boolean;
    /**
     * With the strip layout and `fill`: the box is all there is and nothing
     * scrolls. Every effect and Off share it (`fitEffectPicker`), and an effect's
     * page holds its looks and headline slider. Deep tuning stays in the hosts
     * that have the room for it, so this page has no Tune button.
     */
    fitRoom?: boolean;
    /**
     * The host's sequence has two props. With the strip layout, the bar gains
     * a Both / Left / Right row at its far end (while it fits on the bar's one
     * line), and the tiles set the chosen prop. The tray opens on Both and the
     * choice is its own. Omit for a host with one prop.
     */
    handProps?: HandPropToolbarProps;
    /**
     * With the sidebar layout: a phone's bottom dock under the player, about
     * 360 x 215-310px. The roster is sixteen one-line tiles with a single row
     * under them (Tune, power, Reset all); the looks and sliders live only in
     * the tune view, which is one compact row per control.
     */
    dock?: boolean;
    /** With `dock`: the host's own header row carries the tune view's back
     *  button, name and power button (see effect-tune-heading.ts). Without
     *  it, the tune view draws that row itself. */
    onTuneHeading?: (heading: EffectTuneHeading | null) => void;
    /** Post Studio can show the roster beside looks and tuning when its panel is wide. */
    wideWorkspace?: boolean;
    /**
     * With the sidebar layout and `fill`: the host's pane is this page and
     * nothing else (the Shape Engine's Customize workspace). One head row (the
     * Effects switch, Reset all), the effects as pictures four across, and
     * under them the looks as one row of equal cards with the everyday slider.
     * The pictures take every pixel the looks leave, and all of it when
     * effects are off. No footer.
     */
    page?: boolean;
    /** Post Studio opens an already chosen effect's looks and tuning first. */
    preferSelectedDetail?: boolean;
    pagedRichDetail?: boolean;
    /** Restrict the roster to what the host can draw. Omit for everything. */
    availableEffects?: readonly string[];
    animationSettingsState?: AnimationSettingsState;
    children?: Snippet;
    onSettingChange?: (
      setting: string,
      previousValue: string | number | boolean | null,
      value: string | number | boolean | null,
      coalesce?: boolean
    ) => void;
  }

  const {
    bpm,
    onBpmChange,
    isPlaying,
    onPlaybackToggle,
    onStepForward,
    onStepBackward,
    onHalfStepForward,
    onHalfStepBackward,
    showPlayback = true,
    showTransport = true,
    showExportControls = false,
    layout = "sidebar",
    showHeading = true,
    fill = false,
    fitRoom = false,
    handProps,
    dock = false,
    onTuneHeading,
    wideWorkspace = false,
    page = false,
    preferSelectedDetail = false,
    pagedRichDetail = false,
    availableEffects,
    animationSettingsState = animationSettings,
    children,
    onSettingChange,
  }: Props = $props();

  const effectsConfigState = getEffectsConfigContext()!;
  const ledCustomizePage = $state<LedCustomizePageState>({
    current: "pattern",
  });
  setContext(LED_CUSTOMIZE_PAGE_CONTEXT, ledCustomizePage);

  let customizeOpen = $state(false);
  let customizeLoadingEffect = $state<EffectId | null>(null);
  let customizeFailedEffect = $state<EffectId | null>(null);
  let customizeRequest = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CustomizeComponent = $state<Component<any> | null>(null);

  /** The effect the two props share (the left prop's while they differ). */
  const primaryEffect = $derived(effectsConfigState.activeEffect);
  /** Set while the tray's tuning page is open for the other prop's effect, so
   *  every part of that page reads the effect it was opened for. Tuning is per
   *  effect, not per prop. */
  let tuneOverride = $state<EffectId | null>(null);
  const activeEffect = $derived(tuneOverride ?? primaryEffect);
  const leftEffect = $derived(effectsConfigState.effectForHand(0));
  const rightEffect = $derived(effectsConfigState.effectForHand(1));
  const differ = $derived(effectsConfigState.effectsDiffer());

  // ── Which prop the tray sets ───────────────────────────────────────────────
  // The Both / Left / Right row sits at the far end of the strip's bar when the
  // sequence has two props and the row fits on the bar's one line beside the
  // short Off chip. It opens on Both and the choice is the tray's own. Where
  // the row is not shown the tray stays on Both, and a mix still shows: a dot
  // per hand on the tiles, and no tile lit.
  let trayHand = $state<PropHandChoice>("both");
  let barWidth = $state(0);
  let handRowEl = $state<HTMLElement | null>(null);
  /** An unseen copy of the chip in its word form, so its natural width is
   *  known whichever form is on the bar. */
  let wordChipEl = $state<HTMLElement | null>(null);
  let wordChipWidth = $state(0);
  /** The row at word-sized tracks: its narrowest width that keeps every word
   *  whole. */
  let handRowMinWidth = $state(0);
  const BAR_GAP = 8;
  /** The icon-only chip's width (CSS `.off-chip.icon-only`). */
  const ICON_CHIP_WIDTH = 44;
  const rowWanted = $derived(
    !!handProps && layout === "strip" && !fitRoom && !dock
  );
  // Decided from natural widths alone, so no form can flicker into another.
  // The row is on the bar whenever the sequence has two props. Until all are
  // measured the word form is shown, then judged.
  const measured = $derived(
    barWidth > 0 && wordChipWidth > 0 && handRowMinWidth > 0
  );
  const barStep = $derived<HandBarStep>(
    measured
      ? chooseHandBarStep({
          wordChip: wordChipWidth,
          iconChip: ICON_CHIP_WIDTH,
          rowMin: handRowMinWidth,
          bar: barWidth,
          gap: BAR_GAP,
        })
      : "words"
  );
  const rowShown = $derived(rowWanted);
  const iconOnly = $derived(rowShown && barStep !== "words");
  const wordsHidden = $derived(rowShown && barStep === "pictures");
  // Measured after paint. The word chip's copy is always in the page (out of
  // the flow). The row's word-sized width is read with its words shown and its
  // width at min-content, then put back in the same frame. Nothing here
  // changes the bar's height.
  $effect(() => {
    void barWidth;
    void t("viewer_ui_both");
    void t("viewer_ui_left");
    void t("viewer_ui_right");
    void t("effect_deep_off");
    if (handRowEl) {
      const hid = handRowEl.classList.contains("words-hidden");
      const width = handRowEl.style.width;
      if (hid) handRowEl.classList.remove("words-hidden");
      handRowEl.style.width = "min-content";
      handRowMinWidth = handRowEl.offsetWidth;
      handRowEl.style.width = width;
      if (hid) handRowEl.classList.add("words-hidden");
    }
    if (wordChipEl) wordChipWidth = wordChipEl.offsetWidth;
  });
  $effect(() => {
    // Leaving the tuning page, or a mix that no longer holds that effect,
    // puts it back on the primary effect.
    if (
      tuneOverride &&
      ((!detailOpen && !customizeOpen) ||
        (tuneOverride !== leftEffect && tuneOverride !== rightEffect))
    )
      tuneOverride = null;
  });
  const handNow = $derived<PropHandChoice>(rowShown ? trayHand : "both");
  const trayTarget = $derived<PropEffectTarget>(
    handNow === "both" ? "both" : handNow === "left" ? 0 : 1
  );
  /** The effect the chosen prop wears, which the lit tile shows. Both with the
   *  props apart lights no tile: the dots say where each one is. */
  const shownEffect = $derived<string>(
    handNow === "both"
      ? differ
        ? ""
        : primaryEffect
      : handNow === "left"
        ? leftEffect
        : rightEffect
  );
  /** The chosen prop wears an effect: the Off chip's pressed state. */
  const handOn = $derived(
    handNow === "both"
      ? primaryEffect !== "none"
      : (handNow === "left" ? leftEffect : rightEffect) !== "none"
  );
  /** Dots per hand while the props differ; `null` names the lit tile "both
   *  props" for a two-prop host; undefined for a host with one prop. */
  const tilePair = $derived<{ left: string; right: string } | null | undefined>(
    differ
      ? { left: leftEffect, right: rightEffect }
      : handProps
        ? null
        : undefined
  );
  /** The short Off chip: the row is on the bar, or the props differ so no one
   *  effect can be named. */
  const shortChip = $derived(rowShown || differ);
  const trayHandProps = $derived<HandPropToolbarProps | null>(
    handProps
      ? {
          hand: trayHand,
          leftPropType: handProps.leftPropType,
          rightPropType: handProps.rightPropType,
          onHandChange: (next) => (trayHand = next),
        }
      : null
  );
  $effect(() => {
    if (activeEffect !== "led") ledCustomizePage.current = "pattern";
  });
  const registration = $derived<EffectRegistration | undefined>(
    activeEffect !== "none" ? getRegistration(activeEffect) : undefined
  );
  // Always opens on the roster, even when an effect is already active from a
  // previous session. The inspector is somewhere you choose to go, never where
  // the panel drops you - landing in it is the same trap as navigating on
  // select, just triggered by boot instead of a click.
  let sidebarDetailOpen = $state(preferSelectedDetail);
  let detailOpen = $state(preferSelectedDetail);

  // ── Catalog and roster (fill hosts) ────────────────────────────────────────
  // In a card wide enough for four pictures across, every tile shows a picture
  // of its effect's look, whether or not an effect is on (effect-catalog-fit.ts
  // has the rule). With nothing on there is no dock, so the roster is the whole
  // page and its tiles fill it (or, in a card too narrow for pictures, the names
  // fill it as a list). Once an effect is on, the roster takes the height its
  // tiles need and the dock the rest. That height depends on the width alone,
  // so while you compare effects the grid stays still under the pointer (see
  // .sb-footer). Only turning effects on or off changes the arrangement, and
  // morphRoster carries the same tiles from one arrangement to the other.
  // Fractional sizes, floored once at the end: a panel 736.5px tall reports a
  // clientHeight of 737, and a catalog sized from that overflows by half a
  // pixel and puts a scrollbar on the host.
  let panelRect = $state<DOMRectReadOnly>();
  let wideRosterRect = $state<DOMRectReadOnly>();
  let footerBox = $state<ResizeObserverSize[]>();
  /** .sb-section padding, the row holding the Off button, and the gap under
   *  it. The catalog grid gets what is left of the section. */
  const CATALOG_CHROME_Y = 12 * 2 + 44 + 10;
  const CATALOG_CHROME_X = 16 * 2;
  const rosterCount = $derived(
    availableEffects
      ? EFFECTS.filter((effect) => availableEffects.includes(effect.id)).length
      : EFFECTS.length
  );
  // The panel is size-contained in fill mode, so its height comes from the
  // host alone and the catalog sized from it cannot feed back into it.
  const catalogRoom = $derived(
    Math.max(
      0,
      Math.floor((panelRect?.height ?? 0) - (footerBox?.[0]?.blockSize ?? 0))
    )
  );
  // Both bounded and intrinsic sidebars use the same visual roster. Only a
  // bounded page can size the inactive catalog against the remaining height.
  // The phone dock has no room for pictures: its tiles are one line each.
  const pictureHost = $derived(!showPlayback && !children && !dock);
  const rosterWidth = $derived(
    Math.floor(
      wideWorkspace ? (wideRosterRect?.width ?? 0) : (panelRect?.width ?? 0)
    ) - CATALOG_CHROME_X
  );
  /** The arrangement the roster takes whenever nothing is on. */
  const restingCatalogFit = $derived(
    fill && pictureHost && !page
      ? fitEffectCatalog({
          width: rosterWidth,
          height: catalogRoom - CATALOG_CHROME_Y,
          count: rosterCount,
        })
      : null
  );
  const catalogFit = $derived(
    activeEffect === "none" ? restingCatalogFit : null
  );
  // Pictures that are showing keep showing until the card loses more than a
  // scrollbar's width (holdEffectRoster). In a scrolling host such as the
  // effect tuner's column, their extra height brings in the scrollbar that
  // would otherwise turn them back into icons, and the grid would flicker.
  let rosterShowsPictures = false;
  const rosterFit = $derived.by(() => {
    const box = { width: rosterWidth, count: rosterCount };
    const fit = !pictureHost
      ? null
      : rosterShowsPictures
        ? holdEffectRoster(box)
        : fitEffectRoster(box);
    rosterShowsPictures = fit !== null;
    return fit;
  });

  // The pictures page (`page`): the grid's box is whatever the head row and
  // the looks leave, measured, so its rows add up to the pane.
  let pageGridRect = $state<DOMRectReadOnly>();
  const pageFit = $derived(
    page
      ? fitEffectPictures({
          width: Math.floor(pageGridRect?.width ?? 0),
          height: Math.floor(pageGridRect?.height ?? 0),
          count: rosterCount,
        })
      : null
  );

  // The strip page of a host that never scrolls: one arrangement for both
  // states, from the box it was given, with Off as one more tile.
  let stripRect = $state<DOMRectReadOnly>();
  const pickerFit = $derived(
    fitRoom
      ? fitEffectPicker({
          width: Math.floor(stripRect?.width ?? 0),
          height: Math.floor(stripRect?.height ?? 0),
          count: rosterCount + 1,
        })
      : null
  );

  /** The look each tile shows (effect-catalog-looks). The list arrangement
   *  has names only. */
  const catalogLooks = $derived(
    (
      page
        ? pageFit
        : fitRoom
          ? pickerFit?.portrait
          : catalogFit
            ? catalogFit.portrait
            : rosterFit
    )
      ? effectCatalogLooks(effectsConfigState)
      : null
  );

  const pictureWidth = $derived(
    (fitRoom
      ? pickerFit?.portrait
      : catalogFit
        ? catalogFit.portrait
        : rosterFit?.portrait) ?? 0
  );
  /** The pictures page paints the 6:5 picture for a box near that shape, and
   *  the 8:3 one (tile or card by width, as everywhere else) for a wide one. */
  const paintedWidth = $derived(pageFit ? pageFit.pictureWidth : pictureWidth);
  const pictureFormat = $derived(
    pageFit?.shape === "tall"
      ? ("tall" as const)
      : formatForPictureWidth(paintedWidth)
  );
  /** The phone tray has no catalog; it shows each effect's current look as a
   *  tile-format picture over its name (EffectSelector `trayPictures`). */
  const trayLooks = $derived(
    layout === "strip" && !fitRoom
      ? effectCatalogLooks(effectsConfigState)
      : null
  );

  const sidebarView = $derived(
    !wideWorkspace &&
      sidebarDetailOpen &&
      activeEffect !== "none" &&
      registration
      ? `detail-${activeEffect}`
      : catalogFit
        ? "catalog"
        : "browser"
  );

  // ── Roster morph ──────────────────────────────────────────────────────────
  // The catalog and the roster are one grid in two arrangements, so turning an
  // effect on or off moves and resizes the tiles you were looking at instead
  // of fading them out and a smaller copy in. A same-document view transition
  // does the carrying: while it runs, each tile's box, picture, icon and name
  // claim names (EffectSelector) and travel on their own, the section's box
  // stretches with them, and the dock, the tune badge and the Off button's
  // label swap where they sit (view-transitions.css). No arrangement change,
  // no morph: switching from one effect to another leaves the grid where it
  // is.
  //
  // The view Crossfade keeps one key across a carried change. Any other way
  // the arrangement changes (a keyboard shortcut, the canvas menu, reduced
  // motion, a browser without view transitions) moves the key on, and the
  // Crossfade fades between the two arrangements as before.
  const componentId = $props.id();
  const morphId = componentId.replace(/[^\w-]/g, "");
  let rosterMorphs = $state(0);
  const rosterMorphName = $derived(rosterMorphs > 0 ? `fx-${morphId}` : null);
  let carryingArrangement = false;
  let rosterEpoch = 0;
  let shownArrangement: string | null = null;
  const rosterKey = $derived.by(() => {
    const arrangement = catalogFit ? "catalog" : "browser";
    if (
      shownArrangement !== null &&
      arrangement !== shownArrangement &&
      !carryingArrangement
    ) {
      rosterEpoch += 1;
    }
    shownArrangement = arrangement;
    return `roster-${rosterEpoch}`;
  });
  const sidebarKey = $derived(
    sidebarView.startsWith("detail-") ? sidebarView : rosterKey
  );
  const ROSTER_MORPH_CLASS = "effect-roster-morph-active";

  function carry(mutate: () => void): void {
    carryingArrangement = true;
    try {
      flushSync(mutate);
    } finally {
      carryingArrangement = false;
    }
  }

  /** Run a change that turns effects on or off, carrying the tiles across. */
  function morphRoster(mutate: () => void): void {
    if (sidebarView.startsWith("detail-") || !restingCatalogFit) {
      mutate();
      return;
    }
    // A second toggle while the first is still moving: rearranging the live
    // grid retargets the running transition, so the tiles turn around
    // mid-flight instead of fading.
    if (rosterMorphs > 0) {
      carry(mutate);
      return;
    }

    const root = document.documentElement;
    root.classList.add(ROSTER_MORPH_CLASS);
    // The names have to be on the tiles before the browser captures them.
    flushSync(() => (rosterMorphs += 1));
    const finish = () => {
      rosterMorphs -= 1;
      root.classList.remove(ROSTER_MORPH_CLASS);
    };
    const transition = startMorph(
      () => {
        carryingArrangement = true;
        mutate();
      },
      async () => {
        carryingArrangement = false;
      }
    );
    if (!transition) {
      // Ran plainly: the Crossfade takes it.
      carryingArrangement = false;
      finish();
      return;
    }
    void transition.finished.catch(() => {}).finally(finish);
  }

  // Trails and fire keep a few values outside their effect intent. Both viewer
  // surfaces use the same adapters so their FX controls display and edit the
  // same values.
  const tuneOverrides = $derived(
    isEffectId(activeEffect)
      ? createEffectControlOverrides(
          activeEffect,
          effectsConfigState,
          animationSettingsState
        )
      : undefined
  );

  // Honest highlight. Priority:
  //   0. the look you clicked, while the config still carries it
  //   1. live config == factory default            → Default chip (canonical anchor)
  //   2. live config matches a named preset's patch → that preset
  //   3. live config == your captured custom look   → Custom chip
  // Tuning away from all of these lights nothing.
  const activePresetId = $derived.by(() => {
    if (activeEffect === "none" || !registration) return null;
    const fx = activeEffect as EffectId;
    const effectConfig = effectsConfigState.effect(fx) as unknown as Record<
      string,
      unknown
    >;
    // 0. The clicked look. A Classic that equals the factory default would
    //    otherwise light the Default chip instead.
    const picked = pickedPresetId(
      registration.presetGroup,
      effectConfig,
      effectsConfigState.activePresets[fx]
    );
    if (picked) return picked;
    // 1. The factory default look → the synthetic Default chip.
    const factory = (
      DEFAULT_EFFECTS_CONFIG as unknown as Record<string, unknown>
    )[fx];
    if (valuesEqual(effectConfig, factory)) return DEFAULT_CHIP_ID;
    // 2. A named preset whose static patch the live config matches.
    const matched = matchPresetId(registration.presetGroup, effectConfig);
    if (matched) return matched;
    // 3. Your captured custom look → the synthetic Custom chip.
    const custom = effectsConfigState.personalDefault(fx) as unknown as Record<
      string,
      unknown
    > | null;
    if (
      custom &&
      effectsConfigState.hasCustom(fx) &&
      valuesEqual(effectConfig, custom)
    )
      return CUSTOM_CHIP_ID;
    return null;
  });

  const currentSummary = $derived.by(() => {
    if (!registration) return "";
    return registration.presetGroup.getSummary(effectsConfigState);
  });

  const primarySpec = $derived<PrimaryParamSpec | undefined>(
    registration?.primaryParam
  );
  const primaryValue = $derived.by(() => {
    if (!primarySpec) return 0;
    return primarySpec.get(effectsConfigState);
  });

  type SettingValue = string | number | boolean | null;
  function reportSetting(
    setting: string,
    previousValue: SettingValue,
    value: SettingValue,
    coalesce = false
  ): void {
    if (previousValue === value) return;
    onSettingChange?.(setting, previousValue, value, coalesce);
  }

  function primitiveSnapshot(effectId: EffectId): Record<string, SettingValue> {
    const current = effectsConfigState.effect(effectId) as unknown as Record<
      string,
      unknown
    >;
    const snapshot: Record<string, SettingValue> = {};

    function collect(path: string, value: unknown): void {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        snapshot[path] = value;
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => collect(`${path}_${index + 1}`, item));
        return;
      }
      if (value && typeof value === "object") {
        for (const [field, item] of Object.entries(value)) {
          collect(`${path}_${field}`, item);
        }
      }
    }

    for (const [field, value] of Object.entries(current)) {
      collect(field, value);
    }
    return snapshot;
  }

  // Rich customize components (including LED) mutate effects state directly.
  // Observe them whenever their controls are visible so scoped hosts can save
  // the edit and update their preview.
  let observedCustomizationEffect: EffectId | null = null;
  let customizationSnapshot: Record<string, SettingValue> | null = null;
  function syncCustomizationSnapshot(): void {
    if (activeEffect === "none" || !isEffectId(activeEffect)) return;
    observedCustomizationEffect = activeEffect;
    customizationSnapshot = primitiveSnapshot(activeEffect);
  }
  $effect(() => {
    void effectsConfigState.version;
    const richTuningVisible =
      activeEffect !== "none" &&
      isEffectId(activeEffect) &&
      primaryControls(activeEffect, "2d").length === 0 &&
      ((layout === "sidebar" && (wideWorkspace || sidebarDetailOpen)) ||
        (layout === "strip" && detailOpen));
    if (
      !onSettingChange ||
      (!customizeOpen && !richTuningVisible) ||
      activeEffect === "none" ||
      !isEffectId(activeEffect)
    ) {
      observedCustomizationEffect = null;
      customizationSnapshot = null;
      return;
    }

    const current = primitiveSnapshot(activeEffect);
    if (customizationSnapshot && observedCustomizationEffect === activeEffect) {
      for (const [field, value] of Object.entries(current)) {
        const previous = customizationSnapshot[field];
        if (previous !== undefined && previous !== value) {
          reportSetting(
            `tuning_${activeEffect}_${field}`,
            previous,
            value,
            true
          );
        }
      }
    }
    observedCustomizationEffect = activeEffect;
    customizationSnapshot = current;
  });

  function handleEffectSelect(effectId: string): void {
    // The lit tile is the one effect both props wear; with a mix none is lit.
    if (effectId === shownEffect) {
      void handleCustomizeOpen();
      return;
    }
    if (!isEffectId(effectId)) return;
    const previous = activeEffect;
    customizeOpen = false;
    CustomizeComponent = null;
    effectsConfigState.setActiveEffect(effectId);
    reportSetting("active_effect", previous, effectId);
  }

  function handleGridDisable(): void {
    const previous = activeEffect;
    customizeOpen = false;
    CustomizeComponent = null;
    effectsConfigState.setActiveEffect("none");
    reportSetting("active_effect", previous, "none");
  }

  // Same contract as the mobile picker: selecting an effect applies it live and
  // leaves you in the roster, so comparing sixteen effects costs sixteen clicks
  // instead of thirty-two plus sixteen screen transitions. Clicking the effect
  // you already have on is the drill gesture into its inspector.
  function handleSidebarEffectSelect(effectId: string): void {
    if (!isEffectId(effectId)) return;
    if (effectId === activeEffect) {
      sidebarDetailOpen = true;
      return;
    }
    const previous = activeEffect;
    const apply = () => {
      customizeOpen = false;
      CustomizeComponent = null;
      effectsConfigState.setActiveEffect(effectId);
      if (preferSelectedDetail) sidebarDetailOpen = true;
    };
    if (previous === "none") morphRoster(apply);
    else apply();
    reportSetting("active_effect", previous, effectId);
  }

  function handleSidebarDisable(): void {
    const previous = activeEffect;
    const apply = () => {
      sidebarDetailOpen = false;
      customizeOpen = false;
      CustomizeComponent = null;
      effectsConfigState.setActiveEffect("none");
    };
    if (previous !== "none") morphRoster(apply);
    else apply();
    reportSetting("active_effect", previous, "none");
  }

  /** The page's Effects switch, as the phone list's: off, and back on to the
   *  effect (or the pair) that was last on. */
  function handlePageToggle(): void {
    const previous = activeEffect;
    customizeOpen = false;
    CustomizeComponent = null;
    effectsConfigState.toggleEffectFor("both", EFFECTS[0]?.id);
    reportSetting("active_effect", previous, effectsConfigState.activeEffect);
  }

  // ── Phone dock (sidebar layout + dock) ────────────────────────────────────
  // The tune view's heading goes to the host's header row when it listens, so
  // the dock body spends its ~245px on the controls alone.
  const dockTuning = $derived(dock && sidebarView.startsWith("detail-"));
  $effect(() => {
    if (!onTuneHeading) return;
    const reg = registration;
    if (!dockTuning || !reg) {
      onTuneHeading(null);
      return;
    }
    onTuneHeading({
      label: effectUiLabel(reg.meta.label),
      icon: reg.meta.icon,
      accent: effectInk(reg.meta.color, getThemeMode()),
      backLabel: t("effect_deep_all_effects"),
      turnOffLabel: t("effect_deep_turn_off_effect", {
        effect: effectUiLabel(reg.meta.label),
      }),
      back: () => (sidebarDetailOpen = false),
      turnOff: handleSidebarDisable,
    });
    return () => onTuneHeading(null);
  });

  // ── Mobile drill-down (layout="strip") ────────────────────────────────────
  // The Instagram-filter contract: tapping a tile applies the effect live and
  // STAYS in the picker (browsing costs zero navigation); tapping the
  // already-active tile drills into its detail screen (looks + primary slider +
  // More tuning). An explicit Off tile replaces the old tap-again-to-disable
  // toggle, which the drill gesture now owns.
  const stripView = $derived<"picker" | "detail" | "customize">(
    customizeOpen && CustomizeComponent
      ? "customize"
      : detailOpen && activeEffect !== "none" && registration
        ? "detail"
        : "picker"
  );

  function handleTileTap(effectId: string): void {
    if (effectId === shownEffect) {
      // Tuning is per effect: the other prop's lit tile opens its own page.
      if (isEffectId(effectId)) {
        tuneOverride = effectId === primaryEffect ? null : effectId;
        detailOpen = true;
      }
      return;
    }
    if (isEffectId(effectId)) {
      const previous = shownEffect || primaryEffect;
      effectsConfigState.setEffectFor(trayTarget, effectId);
      if (preferSelectedDetail) detailOpen = true;
      reportSetting(
        trayTarget === "both"
          ? "active_effect"
          : trayTarget === 0
            ? "active_effect_left"
            : "active_effect_right",
        previous,
        effectId
      );
    }
  }

  /** The short Off chip beside the row: Off for the chosen prop, and back to
   *  what it wore. The long chip (one prop, no row) keeps handleOffTap. */
  function handleHandOffTap(): void {
    const previous = shownEffect || primaryEffect;
    effectsConfigState.toggleEffectFor(trayTarget, EFFECTS[0]?.id);
    detailOpen = false;
    const next =
      trayTarget === "both"
        ? effectsConfigState.activeEffect
        : effectsConfigState.effectForHand(trayTarget);
    reportSetting(
      trayTarget === "both"
        ? "active_effect"
        : trayTarget === 0
          ? "active_effect_left"
          : "active_effect_right",
      previous,
      next
    );
  }

  function handleOffTap(): void {
    const previous = activeEffect;
    detailOpen = false;
    effectsConfigState.setActiveEffect("none");
    reportSetting("active_effect", previous, "none");
  }

  // Hover/press intent: warm the effect's webgl renderer before the click so the
  // switch never freezes. No-op downstream for non-webgl effects.
  function handleEffectPrewarm(effectId: string): void {
    if (isEffectId(effectId)) effectsConfigState.requestPrewarm(effectId);
  }

  function handlePresetSelect(presetId: string): void {
    if (!registration) return;
    const effectId = activeEffect;
    const previous = activePresetId ?? "customized";
    // The Default chip resets to the factory default look.
    if (presetId === DEFAULT_CHIP_ID) {
      if (isEffectId(activeEffect))
        effectsConfigState.resetToFactory(activeEffect);
      syncCustomizationSnapshot();
      reportSetting(`preset_${effectId}`, previous, presetId);
      return;
    }
    // The Custom chip restores your auto-captured custom look.
    if (presetId === CUSTOM_CHIP_ID) {
      if (isEffectId(activeEffect))
        effectsConfigState.restorePersonalDefault(activeEffect);
      syncCustomizationSnapshot();
      reportSetting(`preset_${effectId}`, previous, presetId);
      return;
    }
    const group = registration.presetGroup;
    const preset = group.presets.find((p) => p.id === presetId);
    if (!preset) return;
    const patch = preset.resolvePatch
      ? preset.resolvePatch()
      : (preset.patch ?? {});
    effectsConfigState.applyPreset(group.effectType, preset.id, patch);
    syncCustomizationSnapshot();
    reportSetting(`preset_${effectId}`, previous, presetId);
  }

  // ── Global factory reset (escape hatch in the panel footer) ──────────────
  // Per-effect reset lives on the Default chip itself (clicking Default resets
  // that effect to factory), so there is no separate per-effect reset button.
  let confirmResetAllOpen = $state(false);

  function handleResetAll(): void {
    effectsConfigState.resetAllToFactory();
    reportSetting("reset_all", "configured", "factory_defaults");
  }

  // ── Custom chip (your auto-captured look) ────────────────────────────────
  /** Disabled until the user has captured a custom look (first manual edit). */
  const customDisabled = $derived(
    activeEffect === "none" ||
      !isEffectId(activeEffect) ||
      !effectsConfigState.hasCustom(activeEffect as EffectId)
  );
  /** Trail's Custom chip shows the captured custom blue/red dots; other effects use accent. */
  /** Your look's settings, for the pictures page's card of it. */
  const customPatch = $derived(
    customDisabled || !isEffectId(activeEffect)
      ? null
      : (effectsConfigState.personalDefault(activeEffect) as unknown as Record<
          string,
          unknown
        > | null)
  );
  const customColors = $derived.by(() => {
    if (activeEffect !== "trails") return null;
    const c = effectsConfigState.personalDefault("trails");
    return c ? { left: c.leftColor, right: c.rightColor } : null;
  });

  async function handleCustomizeOpen(): Promise<void> {
    if (!registration || activeEffect === "none") return;
    const effectId = activeEffect;
    if (customizeLoadingEffect === effectId) return;
    const request = ++customizeRequest;
    // LED is the only structured editor with no flat controls to fall back to.
    // Keep it in the route bundle so Tune never waits for a second module fetch.
    if (effectId === "led") {
      customizeLoadingEffect = null;
      customizeFailedEffect = null;
      CustomizeComponent = LedCustomize;
      customizeOpen = true;
      return;
    }
    customizeLoadingEffect = effectId;
    customizeFailedEffect = null;
    try {
      const mod = await registration.customizeComponent();
      if (request !== customizeRequest || activeEffect !== effectId) return;
      CustomizeComponent = mod.default;
      customizeOpen = true;
    } catch (error) {
      if (request === customizeRequest && activeEffect === effectId) {
        customizeFailedEffect = effectId;
        console.error(
          `[EffectsPanel] Could not open ${effectId} tuning:`,
          error
        );
      }
    } finally {
      if (request === customizeRequest) customizeLoadingEffect = null;
    }
  }

  function handleCustomizeClose(): void {
    customizeOpen = false;
    CustomizeComponent = null;
  }

  function setPrimaryValue(v: number): void {
    if (!primarySpec) return;
    const previous = primaryValue;
    primarySpec.set(effectsConfigState, v);
    reportSetting(`primary_${activeEffect}`, previous, v, true);
  }
</script>

{#snippet customizeAnchors()}
  <!-- Quick anchors while tuning: snap to factory (Default) or your saved look
       (Custom) without leaving the Customize panel. -->
  <div class="anchor-row">
    <button
      type="button"
      class="anchor-btn"
      class:active={activePresetId === DEFAULT_CHIP_ID}
      onclick={() => handlePresetSelect(DEFAULT_CHIP_ID)}
    >
      {t("effect_deep_original")}
    </button>
    {#if !customDisabled}<button
        type="button"
        class="anchor-btn"
        class:active={activePresetId === CUSTOM_CHIP_ID}
        onclick={() => handlePresetSelect(CUSTOM_CHIP_ID)}
      >
        {t("effect_deep_your_look")}
      </button>{/if}
  </div>
{/snippet}

{#snippet effectDock(
  onTune: () => void,
  tuneLabel: string,
  looks: "rail" | "wrap" | "tiles" | "cards"
)}
  <!-- Keyed on the effect, because switching effects on the roster is now the
       primary gesture and it used to be the harshest thing in the panel: the
       dock swapped identity, looks and slider in one frame while its height
       stepped up to 150px (Ghost's two chips against Coal's ten), throwing
       everything under it down the panel. Keyed here rather than inside
       EffectDock so the empty state is part of the same clock - turning effects
       off eases the dock away instead of deleting it.

       The key is the effect alone: choosing a look or dragging the slider must
       not remount, or a drag would drop mid-gesture.

       Swap, not overlap: effects carry between 2 and 10 looks, so two docks
       stacked mid-fade put one effect's slider row across the other's second
       row of chips - legible garble for the length of the transition. Fading
       the old one out before the new one arrives costs 150ms and removes the
       collision entirely. The height still glides across the whole gesture. -->
  <Crossfade
    key={activeEffect}
    animateHeight
    mode="swap"
    duration={DURATION.fast}
  >
    {#if activeEffect !== "none" && registration}
      <EffectDock
        {registration}
        {activePresetId}
        defaultChipId={DEFAULT_CHIP_ID}
        customChipId={CUSTOM_CHIP_ID}
        {customDisabled}
        {customColors}
        {primarySpec}
        {primaryValue}
        onSelectPreset={handlePresetSelect}
        onPrimaryInput={setPrimaryValue}
        {onTune}
        {tuneLabel}
        tuneLoading={customizeLoadingEffect === activeEffect}
        tuneError={customizeFailedEffect === activeEffect}
        customPatch={looks === "cards" ? customPatch : null}
        {looks}
      />
    {/if}
  </Crossfade>
{/snippet}

{#snippet catalogPortrait(effectId: string)}
  {@const look = catalogLooks?.get(effectId)}
  {#if look}
    <!-- A picture about 88x32 (or the phone tray's 74x27) is painted in the
         tile format; a bigger look card keeps the card. -->
    <EffectPresetThumbnail
      effectType={effectId}
      preset={look.preset}
      legacyModel={look.model}
      format={pictureFormat}
    />
  {/if}
{/snippet}

{#snippet trayPortrait(effectId: string)}
  {@const look = trayLooks?.get(effectId)}
  {#if look}
    <EffectPresetThumbnail
      effectType={effectId}
      preset={look.preset}
      legacyModel={look.model}
      format="tile"
    />
  {/if}
{/snippet}

{#if layout === "sidebar"}
  <div
    class="effects-panel"
    class:fill={fill && !dock}
    class:dock
    class:detail-view={sidebarView.startsWith("detail-")}
    class:wide-workspace={wideWorkspace}
    class:post-detail={preferSelectedDetail}
    bind:contentRect={panelRect}
  >
    {#if showPlayback}
      <EffectsPlaybackBar
        {bpm}
        {onBpmChange}
        {isPlaying}
        {onPlaybackToggle}
        {onStepForward}
        {onStepBackward}
        {onHalfStepForward}
        {onHalfStepBackward}
        {showTransport}
      />
    {/if}

    <!-- The roster and the inspector are nothing like the same height (roughly
         550px against 1130px), so the box has to travel with the fade. Without
         animateHeight it arrives at the destination height on the first frame
         and the fade then plays inside a container that has already jumped.
         Swapped rather than overlapped for the same reason as the dock: a
         4x4 tile grid dissolving through an inspector's stacked rows is two
         unrelated layouts printed on top of each other. -->
    {#if wideWorkspace}
      <div class="wide-effects-workspace">
        <div
          class="sb-section sb-browser wide-roster"
          bind:contentRect={wideRosterRect}
        >
          <div class="sb-browser-head">
            {#if showHeading}<span class="sb-label"
                >{t("effect_deep_effects")}</span
              >{/if}
            <button
              type="button"
              class="sb-off-btn"
              class:active={activeEffect === "none"}
              aria-pressed={activeEffect === "none"}
              onclick={handleSidebarDisable}
            >
              <i class="fas fa-power-off" aria-hidden="true"></i>
              <span>{t("effect_deep_off")}</span>
            </button>
          </div>
          <EffectSelector
            {activeEffect}
            onSelect={handleSidebarEffectSelect}
            onPrewarm={handleEffectPrewarm}
            activeAction="tune"
            {availableEffects}
            catalog={rosterFit}
            portrait={catalogPortrait}
          />
        </div>
        <div class="wide-inspector">
          {#if activeEffect !== "none" && registration}
            <EffectsInspector
              effect={activeEffect}
              {registration}
              config={effectsConfigState}
              {activePresetId}
              defaultChipId={DEFAULT_CHIP_ID}
              customChipId={CUSTOM_CHIP_ID}
              {customDisabled}
              {customColors}
              summary={currentSummary}
              propType={animationSettingsState.currentPropType}
              overrides={tuneOverrides}
              showBack={false}
              {pagedRichDetail}
              compactPresets={preferSelectedDetail}
              boundedFine={preferSelectedDetail}
              onBack={() => (sidebarDetailOpen = false)}
              onDisable={handleSidebarDisable}
              onSelectPreset={handlePresetSelect}
              onSettingChange={(setting, previousValue, value, coalesce) =>
                reportSetting(
                  `tuning_${activeEffect}_${setting}`,
                  previousValue,
                  value,
                  coalesce
                )}
            />
          {/if}
        </div>
      </div>
    {:else}
      <Crossfade
        key={sidebarKey}
        animateHeight
        mode="swap"
        duration={DURATION.fast}
      >
        {#if page && sidebarView === "browser"}
          <!-- Sized from the pane, as the catalog is: the Crossfade's box hugs
               its layer, so a flex child would not stretch to fill it. -->
          <div class="sb-page" style:height={`${catalogRoom}px`}>
            <div class="sb-page-head">
              <SettingToggleButton
                label={t("effect_deep_effects")}
                checked={activeEffect !== "none"}
                onToggle={handlePageToggle}
                surface="plain"
                density="compact"
              />
              <PanelButton
                variant="quiet"
                onclick={() => (confirmResetAllOpen = true)}
              >
                {t("effect_deep_reset_all_to_original")}
              </PanelButton>
            </div>
            <div class="sb-page-grid" bind:contentRect={pageGridRect}>
              <EffectSelector
                {activeEffect}
                onSelect={handleSidebarEffectSelect}
                onPrewarm={handleEffectPrewarm}
                activeAction="tune"
                {availableEffects}
                pictures={pageFit}
                portrait={catalogPortrait}
              />
            </div>
            {#if activeEffect !== "none" && registration}
              <!-- Off: the looks leave and the pictures grow into their
                   room, on the same clock. -->
              <div
                class="sb-page-looks"
                transition:flexPresence={{
                  measured: true,
                  duration: DURATION.normal,
                }}
              >
                {@render effectDock(
                  () => (sidebarDetailOpen = true),
                  t("effect_deep_tune"),
                  "cards"
                )}
              </div>
            {/if}
          </div>
        {:else if sidebarView === "browser" || sidebarView === "catalog"}
          <div
            class="sb-section sb-browser"
            class:catalog={sidebarView === "catalog"}
            style:height={sidebarView === "catalog"
              ? `${catalogRoom}px`
              : undefined}
            use:claimedViewTransitionName={{
              name: `${rosterMorphName}-section`,
              enabled: !!rosterMorphName,
            }}
          >
            {#if !dock}<div
                class="sb-browser-head"
                use:claimedViewTransitionName={{
                  name: `${rosterMorphName}-head`,
                  enabled: !!rosterMorphName,
                }}
              >
                {#if showHeading}
                  <span class="sb-label">{t("effect_deep_effects")}</span>
                {/if}
                <button
                  type="button"
                  class="sb-off-btn"
                  class:active={activeEffect === "none"}
                  aria-pressed={activeEffect === "none"}
                  onclick={handleSidebarDisable}
                >
                  <i class="fas fa-power-off" aria-hidden="true"></i>
                  <span>
                    {activeEffect === "none"
                      ? t("effect_deep_effects_off")
                      : t("effect_deep_turn_off", {
                          effect: effectUiLabel(
                            EFFECT_LABELS[activeEffect] ?? "effect"
                          ),
                        })}
                  </span>
                </button>
              </div>{/if}
            <EffectSelector
              {activeEffect}
              onSelect={handleSidebarEffectSelect}
              onPrewarm={handleEffectPrewarm}
              activeAction="tune"
              {availableEffects}
              {dock}
              catalog={sidebarView === "catalog" ? catalogFit : rosterFit}
              portrait={catalogPortrait}
              morphName={rosterMorphName}
            />

            {#if dock}
              {@const activeLabel =
                activeEffect === "none"
                  ? ""
                  : effectUiLabel(EFFECT_LABELS[activeEffect] ?? "effect")}
              <!-- One row under the grid and nothing else: the looks and the
                   sliders are one tap away in the tune view, where each gets
                   a row of its own. The row keeps its height and its three
                   places with no effect on, so the grid never moves. -->
              <div class="dock-actions">
                <button
                  type="button"
                  class="dock-tune"
                  disabled={activeEffect === "none" || !registration}
                  style:--effect-color={registration
                    ? effectInk(registration.meta.color, getThemeMode())
                    : undefined}
                  onclick={() => (sidebarDetailOpen = true)}
                >
                  <i class="fas fa-sliders" aria-hidden="true"></i>
                  <span
                    >{activeEffect === "none"
                      ? t("effect_deep_effects_off")
                      : t("effect_deep_tune_effect", {
                          effect: activeLabel,
                        })}</span
                  >
                </button>
                <button
                  type="button"
                  class="dock-icon-btn dock-power"
                  aria-pressed={activeEffect === "none"}
                  disabled={activeEffect === "none"}
                  aria-label={activeEffect === "none"
                    ? t("effect_deep_effects_off")
                    : t("effect_deep_turn_off", { effect: activeLabel })}
                  title={activeEffect === "none"
                    ? t("effect_deep_effects_off")
                    : t("effect_deep_turn_off", { effect: activeLabel })}
                  onclick={handleSidebarDisable}
                >
                  <i class="fas fa-power-off" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  class="dock-icon-btn dock-reset"
                  aria-label={t("effect_deep_reset_all_to_original")}
                  title={t("effect_deep_reset_all_to_original")}
                  onclick={() => (confirmResetAllOpen = true)}
                >
                  <i class="fas fa-rotate-left" aria-hidden="true"></i>
                </button>
              </div>
            {:else if sidebarView === "browser" && !preferSelectedDetail}
              <div
                class="sb-dock"
                use:claimedViewTransitionName={{
                  name: `${rosterMorphName}-dock`,
                  enabled: !!rosterMorphName,
                }}
              >
                {@render effectDock(
                  () => (sidebarDetailOpen = true),
                  t("effect_deep_tune"),
                  "tiles"
                )}
              </div>
            {/if}
          </div>
        {:else if activeEffect !== "none" && registration}
          <EffectsInspector
            effect={activeEffect}
            {registration}
            config={effectsConfigState}
            {activePresetId}
            defaultChipId={DEFAULT_CHIP_ID}
            customChipId={CUSTOM_CHIP_ID}
            {customDisabled}
            {customColors}
            summary={currentSummary}
            propType={animationSettingsState.currentPropType}
            overrides={tuneOverrides}
            onBack={() => (sidebarDetailOpen = false)}
            {pagedRichDetail}
            compactPresets={preferSelectedDetail}
            boundedFine={preferSelectedDetail}
            {dock}
            showHeader={!dock || !onTuneHeading}
            onDisable={handleSidebarDisable}
            onSelectPreset={handlePresetSelect}
            onSettingChange={(setting, previousValue, value, coalesce) =>
              reportSetting(
                `tuning_${activeEffect}_${setting}`,
                previousValue,
                value,
                coalesce
              )}
          />
        {/if}
      </Crossfade>
    {/if}

    {#if children}{@render children()}{/if}

    <!-- The dock carries Reset all as an icon in its roster row, and the tune
         view resets one effect through its Original look. -->
    {#if !dock && !page}<div
        class="sb-section sb-footer"
        bind:borderBoxSize={footerBox}
      >
        <button
          type="button"
          class="reset-all-btn"
          onclick={() => (confirmResetAllOpen = true)}
        >
          {t("effect_deep_reset_all_to_original")}
        </button>
      </div>{/if}
  </div>
{:else if layout === "strip"}
  <!-- Mobile drill-down: picker grid (all 16 + Off, no h-scroll) ⇄ per-effect
       detail screen ⇄ deep tuning. Tap a tile = apply live + stay; tap the
       active tile = drill into its detail. -->
  <div
    class="mep strip-layout"
    class:fill
    class:fit-room={fitRoom}
    bind:contentRect={stripRect}
  >
    <!-- Same reason as the sidebar, and it matters more here: the tray sits at
         the bottom of a phone screen, so a step in its height shoves the canvas
         above it. -->
    <Crossfade
      key={stripView}
      {fill}
      animateHeight={!fill}
      mode="swap"
      duration={DURATION.fast}
    >
      {#if stripView === "customize" && CustomizeComponent}
        <div class="drill-view">
          <!-- Slim one-line header: back + effect name + Default|Custom anchors,
               replacing the old stacked back-row (48px) + anchor-row (56px) with
               a single ~44px row. On a phone tray every reclaimed px goes to the
               canvas above. -->
          <div class="tune-header">
            <button
              type="button"
              class="tune-back"
              onclick={handleCustomizeClose}
              aria-label={t("effect_deep_back_to_effect", {
                effect: effectUiLabel(
                  EFFECT_LABELS[activeEffect] ?? activeEffect
                ),
              })}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
            </button>
            <span class="tune-name"
              >{effectUiLabel(
                EFFECT_LABELS[activeEffect] ?? activeEffect
              )}</span
            >
            <div class="tune-anchors">
              <button
                type="button"
                class="tune-anchor"
                class:active={activePresetId === DEFAULT_CHIP_ID}
                onclick={() => handlePresetSelect(DEFAULT_CHIP_ID)}
              >
                {t("effect_deep_original")}
              </button>
              {#if !customDisabled}<button
                  type="button"
                  class="tune-anchor"
                  class:active={activePresetId === CUSTOM_CHIP_ID}
                  onclick={() => handlePresetSelect(CUSTOM_CHIP_ID)}
                >
                  {t("effect_deep_your_look")}
                </button>{/if}
            </div>
          </div>
          <!-- Every effect drills through the shared tune-strip: knobs as a
               horizontal value-bearing chip rail, one control revealed at a time,
               so the canvas keeps the screen. Manifest-driven; cross-store fields
               (Trails tailLength/trackingMode, Fire flame colors) come in via
               `tuneOverrides`. CustomizeComponent still loads as the readiness
               signal for this view but is no longer rendered. -->
          {#if activeEffect !== "none"}
            {#if primaryControls(activeEffect, "2d").length === 0}
              <!-- LED and anything else whose controls are structured config
                   rather than flat fields: the strip has nothing to show, so
                   the hand-built panel takes the view. -->
              <CustomizeComponent
                onBack={handleCustomizeClose}
                embedded
                paged={pagedRichDetail && activeEffect === "led"}
              />
            {:else}
              <EffectTuneStrip
                effectId={activeEffect}
                config={effectsConfigState}
                view="2d"
                propType={animationSettingsState.currentPropType}
                overrides={tuneOverrides}
                onSettingChange={(setting, previousValue, value, coalesce) =>
                  reportSetting(
                    `tuning_${activeEffect}_${setting}`,
                    previousValue,
                    value,
                    coalesce
                  )}
              />
            {/if}
          {/if}
        </div>
      {:else if stripView === "detail" && fitRoom && registration && activeEffect !== "none"}
        <div class="drill-view">
          <EffectDock
            {registration}
            {activePresetId}
            defaultChipId={DEFAULT_CHIP_ID}
            customChipId={CUSTOM_CHIP_ID}
            {customDisabled}
            {customColors}
            {primarySpec}
            {primaryValue}
            onSelectPreset={handlePresetSelect}
            onPrimaryInput={setPrimaryValue}
            onBack={() => (detailOpen = false)}
            backLabel={t("effect_deep_all_effects")}
            looks="fit"
          />
        </div>
      {:else if stripView === "detail" && registration && activeEffect !== "none"}
        <div class="drill-view">
          <!-- The dock carries this effect's identity, so the head is just the
               way back to the picker. -->
          <div class="detail-head">
            <button
              type="button"
              class="back-btn"
              onclick={() => (detailOpen = false)}
              aria-label={t("effect_deep_all_effects")}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
            </button>
            <span class="detail-name">{t("effect_deep_all_effects")}</span>
          </div>

          {@render effectDock(
            handleCustomizeOpen,
            t("effect_deep_tune"),
            "rail"
          )}
        </div>
      {:else if fitRoom}
        <div class="drill-view">
          <EffectSelector
            activeEffect={shownEffect}
            pair={tilePair}
            onSelect={handleTileTap}
            onPrewarm={handleEffectPrewarm}
            onOff={handleOffTap}
            layout="tray"
            activeAction="tune"
            {availableEffects}
            catalog={pickerFit}
            portrait={catalogPortrait}
          />
        </div>
      {:else}
        <div class="drill-view">
          <!-- Off lives above the grid (not as a 17th tile) so the picker stays
               a clean 4×4. Tapping the active effect's tile drills into tuning,
               so this chip is the one explicit kill switch. -->
          <div class="picker-bar" bind:clientWidth={barWidth}>
            {#if shortChip}
              <!-- Short form: the row is beside it, or the props differ and no
                   one effect can be named. The visible word names it; where one
                   effect is at stake the existing sentence does. With no room
                   for the word it is the icon alone, named the same way. -->
              <button
                type="button"
                class="off-chip short"
                class:icon-only={iconOnly}
                class:active={!handOn}
                aria-pressed={!handOn}
                aria-label={handOn && shownEffect
                  ? t("effect_deep_turn_off", {
                      effect: effectUiLabel(
                        EFFECT_LABELS[shownEffect] ?? shownEffect
                      ),
                    })
                  : iconOnly
                    ? t("effect_deep_off")
                    : undefined}
                onclick={handleHandOffTap}
              >
                <i class="fas fa-ban" aria-hidden="true"></i>
                {#if !iconOnly}<span>{t("effect_deep_off")}</span>{/if}
              </button>
            {:else}
              <button
                type="button"
                class="off-chip"
                class:active={activeEffect === "none"}
                aria-pressed={activeEffect === "none"}
                onclick={handleOffTap}
              >
                <i class="fas fa-ban" aria-hidden="true"></i>
                <span
                  >{activeEffect === "none"
                    ? t("effect_deep_off")
                    : t("effect_deep_turn_off", {
                        effect: effectUiLabel(
                          EFFECT_LABELS[activeEffect] ?? ""
                        ),
                      })}</span
                >
              </button>
            {/if}
            {#if rowWanted && trayHandProps}
              <span
                class="off-chip short measure"
                aria-hidden="true"
                bind:this={wordChipEl}
              >
                <i class="fas fa-ban"></i>
                <span>{t("effect_deep_off")}</span>
              </span>
              <div
                class="tray-hand"
                class:words-hidden={wordsHidden}
                bind:this={handRowEl}
              >
                <HandPropToolbar
                  handProps={trayHandProps}
                  line="regular"
                  disabled={false}
                  ariaLabel={t("effect_deep_which_prop")}
                />
              </div>
            {/if}
          </div>
          <EffectSelector
            activeEffect={shownEffect}
            pair={tilePair}
            onSelect={handleTileTap}
            onPrewarm={handleEffectPrewarm}
            layout="tray"
            fit={fill}
            activeAction="tune"
            {availableEffects}
            portrait={trayPortrait}
          />
        </div>
      {/if}
    </Crossfade>
  </div>
{:else if layout === "grid"}
  <!-- Desktop popover layout (3D controls): everything on one surface. -->
  <div class="mep grid-layout">
    {#if customizeOpen && CustomizeComponent}
      <button
        type="button"
        class="back-row"
        onclick={handleCustomizeClose}
        aria-label={t("effect_deep_back_to_effect_presets")}
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span class="back-row-title">
          <span class="back-row-label"
            >{effectUiLabel(EFFECT_LABELS[activeEffect] ?? activeEffect)}</span
          >
          <span class="back-row-sub">{t("effect_deep_more_tuning")}</span>
        </span>
      </button>
      {@render customizeAnchors()}
      <CustomizeComponent onBack={handleCustomizeClose} />
    {:else}
      <!-- Re-clicking the active tile now drills into tuning rather than
           disabling, so the popover needs its own explicit kill switch - the
           same Off chip the mobile picker uses. -->
      <div class="picker-bar">
        <button
          type="button"
          class="off-chip"
          class:active={activeEffect === "none"}
          aria-pressed={activeEffect === "none"}
          onclick={handleGridDisable}
        >
          <i class="fas fa-ban" aria-hidden="true"></i>
          <!-- With the props apart no one effect can be named. -->
          <span
            >{activeEffect === "none" || differ
              ? t("effect_deep_off")
              : t("effect_deep_turn_off", {
                  effect: effectUiLabel(EFFECT_LABELS[activeEffect] ?? ""),
                })}</span
          >
        </button>
      </div>

      <EffectSelector
        activeEffect={shownEffect}
        pair={tilePair}
        onSelect={handleEffectSelect}
        onPrewarm={handleEffectPrewarm}
        activeAction="tune"
        {availableEffects}
      />

      {@render effectDock(
        handleCustomizeOpen,
        t(preferSelectedDetail ? "effect_deep_tune" : "effect_deep_more"),
        "rail"
      )}
    {/if}
  </div>
{/if}

<ConfirmDialog
  bind:isOpen={confirmResetAllOpen}
  title={t("effect_deep_reset_all_title")}
  message={t("effect_deep_reset_all_message")}
  confirmText={t("effect_deep_reset_all")}
  cancelText={t("effect_deep_keep_mine")}
  variant="danger"
  onConfirm={handleResetAll}
  onCancel={() => {}}
/>

<style>
  /* Module accent: the animation-panel blue family (matches rail-tile.css).
     No global token covers this hue, so it's scoped here. */
  .effects-panel,
  .mep {
    --fx-accent: #4a9eff;
    --fx-accent-text: #c5ddff;
  }

  /* On the light theme's panels that blue measures 1.64:1 and its text tint
     less, so selected chips lost their names. The same blue darkened to
     normal-text contrast, the way effect-ink.ts darkens the effects' own
     colors. */
  :global(html[data-theme-luminance="bright"]) .effects-panel,
  :global(html[data-theme-luminance="bright"]) .mep {
    --fx-accent: #0050ad;
    --fx-accent-text: #0050ad;
  }

  /* Named so the inspector can recompose against the width it actually gets,
     in every host, instead of only inside Post Studio's own container. */
  .effects-panel {
    display: flex;
    flex-direction: column;
    container: effects-panel / inline-size;
  }

  .wide-effects-workspace {
    display: grid;
    grid-template-columns: clamp(22rem, 40%, 33rem) minmax(0, 1fr);
    min-width: 0;
    align-items: start;
  }

  .wide-roster {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
    border-bottom: none;
  }

  .wide-inspector {
    min-width: 0;
    container: effects-panel / inline-size;
  }

  .sb-section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .sb-label {
    display: inline-flex;
    align-items: center;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theme-text, rgba(255, 255, 255, 0.82));
  }

  .sb-browser {
    display: grid;
    gap: 10px;
    /* view-transitions.css, for morphRoster: the section's box stretches
       between arrangements while the head and the dock swap where they sit. */
    view-transition-class: fx-roster-box;
  }

  .sb-browser-head {
    view-transition-class: fx-roster-swap;
  }

  .sb-dock {
    min-width: 0;
    view-transition-class: fx-roster-swap;
  }

  /* The host sets the height. Size containment keeps the panel's content out
     of that height, so a tall dock overflows into the host's scroll instead of
     stretching the panel that the catalog is sized from. */
  /* ── The pictures page (`page`) ──
     A column the height of the pane: the head row, the grid sharing whatever
     is left, the looks at their own height. */
  .sb-page {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 16px 6px;
  }

  .sb-page-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--min-touch-target, 44px);
  }

  .sb-page-head :global(.panel-btn) {
    flex: none;
    font-size: var(--font-size-min, 14px);
  }

  .sb-page-grid {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .sb-page-looks {
    flex: none;
    min-height: 0;
  }

  .effects-panel.fill {
    flex: 1 1 0;
    min-height: 0;
    container-type: size;
  }

  .sb-browser.catalog {
    display: flex;
    flex-direction: column;
  }

  /* ── Phone dock ──
     Roster: 4 x 4 one-line tiles (162px) + 6px + the 36px action row, inside
     6px of padding top and bottom = 216px, which a 215-217px body holds. From
     a 300px body the tiles go to icon over name at 52px (EffectSelector).
     The panel is a size container so those tiles can ask for its height. */
  .effects-panel.dock {
    flex: 1 1 0;
    min-height: 0;
    container: effects-panel / size;
  }

  .effects-panel.dock .sb-section {
    padding: 6px 12px;
    border-bottom: none;
  }

  .effects-panel.dock .sb-browser {
    gap: 6px;
  }

  .dock-actions {
    display: flex;
    align-items: stretch;
    gap: 6px;
    height: var(--alt-touch-target, 36px);
  }

  .dock-tune,
  .dock-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  /* The way in to the looks and sliders, so it reads as the row's main
     action: tinted with the effect's own ink, like its tile above. */
  .dock-tune {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 12px;
    border-color: color-mix(
      in srgb,
      var(--effect-color, var(--fx-accent)) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--effect-color, var(--fx-accent)) 14%,
      transparent
    );
  }

  .dock-tune i {
    color: var(--effect-color, var(--fx-accent));
  }

  .dock-tune span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-tune:disabled {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: default;
  }

  .dock-tune:disabled i {
    color: inherit;
  }

  .dock-icon-btn {
    flex: 0 0 var(--alt-touch-target, 36px);
    padding: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .dock-power[aria-pressed="true"] {
    color: var(--fx-accent-text);
    border-color: color-mix(in srgb, var(--fx-accent) 45%, transparent);
    background: color-mix(in srgb, var(--fx-accent) 12%, transparent);
    cursor: default;
  }

  /* Reset all is the quiet one: no fill until it is reached for. */
  .dock-reset {
    background: transparent;
    border-color: transparent;
  }

  .dock-icon-btn:hover:not(:disabled) {
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .dock-tune:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--effect-color, var(--fx-accent)) 22%,
      transparent
    );
  }

  .dock-tune:focus-visible,
  .dock-icon-btn:focus-visible {
    outline: 2px solid var(--fx-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .dock-tune,
    .dock-icon-btn {
      transition: none;
    }
  }

  .sb-browser-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .sb-off-btn {
    min-height: var(--min-touch-target, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    max-width: 70%;
    margin-inline-start: auto;
    padding: 0 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    cursor: pointer;
  }

  .sb-off-btn span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sb-off-btn:hover {
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .sb-off-btn.active {
    color: var(--fx-accent-text);
    border-color: color-mix(in srgb, var(--fx-accent) 45%, transparent);
    background: color-mix(in srgb, var(--fx-accent) 12%, transparent);
  }

  .sb-off-btn:focus-visible {
    outline: 2px solid var(--fx-accent);
    outline-offset: 2px;
  }

  /* ── Global factory reset (panel footer) ── */
  /* Sinks to the bottom whenever a host gives the panel a definite height; when
     the panel is content-sized it simply trails the dock. The dock's own height
     varies with how many looks an effect has (Ghost 2 chips, Coal 10), so this
     footer is the only thing that moves as you browse - the roster above it and
     the dock's top edge both hold still, which is what matters for the pointer
     hopping around the grid (no-layout-shift.md). */
  .sb-footer {
    display: flex;
    justify-content: center;
    margin-top: auto;
    border-bottom: none;
  }

  .post-detail .sb-footer {
    padding-block: 6px;
  }

  .reset-all-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      outline var(--duration-fast) var(--ease-standard);
  }

  .reset-all-btn:hover {
    color: var(--semantic-warning, #f59e0b);
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 8%,
      transparent
    );
  }

  .reset-all-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* ── Customize anchors (Default | Custom snap-row) ── */
  .anchor-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .anchor-btn {
    flex: 1;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 12px;
    border-radius: 8px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      outline var(--duration-fast) var(--ease-standard);
  }

  .anchor-btn:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .anchor-btn.active {
    border-color: color-mix(in srgb, var(--fx-accent) 55%, transparent);
    background: color-mix(in srgb, var(--fx-accent) 15%, transparent);
    color: var(--fx-accent-text);
  }

  .anchor-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .anchor-btn:focus-visible {
    outline: 2px solid var(--fx-accent);
    outline-offset: 2px;
  }

  /* ── Strip / Grid layout (mobile + popover) ─────────────────────────────── */
  .mep {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ── Mobile drill-down (strip layout) ── */
  .mep.strip-layout,
  .drill-view {
    gap: 6px;
  }

  .mep.strip-layout.fill {
    flex: 1;
    min-height: 0;
  }
  .strip-layout.fill .drill-view {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    scrollbar-color: var(--theme-stroke-strong, #484755) transparent;
    scrollbar-width: thin;
    gap: 8px;
  }
  .strip-layout.fill .drill-view::-webkit-scrollbar {
    width: 8px;
  }
  .strip-layout.fill .drill-view::-webkit-scrollbar-thumb {
    border-radius: 8px;
    background: var(--theme-stroke-strong, #484755);
  }
  /* Sized from a measurement of the panel, so the page cannot feed back into
     its own box. */
  .mep.strip-layout.fit-room {
    contain: size;
    height: 100%;
  }
  .strip-layout.fit-room .drill-view {
    gap: 0;
  }
  .strip-layout.fill .picker-bar {
    flex: none;
  }
  .strip-layout.fill .off-chip {
    min-height: 44px;
    font-size: var(--font-size-min, 14px);
  }
  .strip-layout.fill .detail-name {
    font-size: var(--font-size-min, 14px);
  }

  .drill-view {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Off chip row above the grid. Only child in its row, so its label growing
     ("Off" → "Turn off Sparkle") reflows nothing. */
  .picker-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .off-chip.short {
    flex: none;
  }
  .off-chip.icon-only {
    width: 44px;
    min-width: 44px;
    padding: 0;
    justify-content: center;
  }
  /* The word chip's unseen twin, for its natural width. Out of the flow and
     off the screen to the start side, so it never adds scroll. */
  .off-chip.measure {
    /* behind the status bar: unseen measuring twin, hidden and off the screen */
    position: fixed;
    inset-inline-start: -9999px;
    top: 0;
    visibility: hidden;
    pointer-events: none;
  }
  /* The Both / Left / Right row at the bar's far end. Its natural width is
     three equal tracks as wide as the longest word; given less room it shrinks
     toward word-sized tracks and stops there, so no word is cut and the row is
     never dropped. The three tracks are equal whenever each word fits at an
     equal share (minmax(max-content, 1fr)). */
  .tray-hand {
    flex: 0 1 auto;
    margin-inline-start: auto;
    width: max-content;
    min-width: min-content;
  }
  .tray-hand :global(.ui-segments) {
    display: grid;
    grid-template-columns: repeat(3, minmax(max-content, 1fr));
  }
  .tray-hand :global(.ui-segments button) {
    position: relative;
    flex: none;
  }
  .tray-hand :global(.hand-art) {
    flex: none;
  }
  /* Press height: the drawn pill stays 28px (24px tight) but the pressable
     box is the bar's own height. The track's 3px padding and 1px border sit
     around the button, so 5px each way reaches the bar's edge. */
  .tray-hand :global(.ui-segments button)::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    inset-block: -5px;
  }
  /* Last step: only when even word-sized tracks do not fit beside the icon
     chip. All three words leave the screen together; their names stay. */
  .tray-hand.words-hidden :global(.hand-word) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .off-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .off-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
    color: var(--theme-text, #fff);
  }
  .off-chip.active {
    background: color-mix(
      in srgb,
      var(--fx-accent) 18%,
      var(--theme-panel-bg, rgba(20, 22, 32, 0.6))
    );
    border-color: color-mix(in srgb, var(--fx-accent) 45%, transparent);
    color: var(--fx-accent-text);
  }

  .detail-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .back-btn {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .back-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
  }
  .detail-name {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text, white);
  }

  .back-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, rgba(255, 255, 255, 0.75));
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    align-self: flex-start;
  }
  .back-row i {
    width: 20px;
    text-align: center;
  }
  .back-row-title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.1;
  }
  .back-row-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .back-row-sub {
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--fx-accent) 80%, transparent);
  }

  /* The strip's slim tune-header already carries a back arrow, so hide each
     customize panel's own full-width "Back to presets" button in this layout
     (avoids a redundant double-back row eating the phone tray). */
  .drill-view :global(.customize-view > .back-btn) {
    display: none;
  }

  /* ── Slim customize header (strip): back + name + Default|Custom, one row ── */
  .tune-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tune-back {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .tune-back:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
  }
  .tune-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tune-anchors {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .tune-anchor {
    min-height: var(--min-touch-target, 44px);
    padding: 0 12px;
    border-radius: 8px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      outline var(--duration-fast) var(--ease-standard);
  }
  .tune-anchor.active {
    border-color: color-mix(in srgb, var(--fx-accent) 55%, transparent);
    background: color-mix(in srgb, var(--fx-accent) 15%, transparent);
    color: var(--fx-accent-text);
  }
  .tune-anchor:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .tune-anchor:focus-visible {
    outline: 2px solid var(--fx-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .preset-chip,
    .more-btn,
    .back-row,
    .reset-all-btn,
    .anchor-btn {
      transition: none;
    }
  }
</style>
