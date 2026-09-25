<script lang="ts">
  import type { Snippet, Component } from "svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import {
    isEffectId,
    type EffectId,
  } from "$lib/shared/effects/state/effects-config-state.svelte";
  import EffectSelector from "./EffectSelector.svelte";
  import EffectsInspector from "./EffectsInspector.svelte";
  import EffectDock from "./EffectDock.svelte";
  import { EFFECTS, EFFECT_LABELS, getRegistration } from "./effect-registry";
  import type { EffectRegistration } from "./effect-registry";
  import EffectPresetThumbnail from "./EffectPresetThumbnail.svelte";
  import {
    createEffectLookPreview,
    type EffectLookPreviewModel,
  } from "./effect-look-preview";
  import type { EffectPreset } from "./presets/types";
  import { fitEffectCatalog } from "$lib/shared/animation-engine/domain/effect-catalog-fit";
  import {
    matchPresetId,
    pickedPresetId,
    valuesEqual,
  } from "./presets/match-preset";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import EffectTuneStrip from "$lib/shared/effects/components/EffectTuneStrip.svelte";
  import { primaryControls } from "$lib/shared/effects/domain/effect-control-manifest";
  import { createEffectControlOverrides } from "$lib/shared/effects/effect-control-fields";
  import {
    animationSettings,
    type AnimationSettingsState,
  } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import EffectsPlaybackBar from "./EffectsPlaybackBar.svelte";

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
    availableEffects,
    animationSettingsState = animationSettings,
    children,
    onSettingChange,
  }: Props = $props();

  const effectsConfigState = getEffectsConfigContext()!;

  let customizeOpen = $state(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CustomizeComponent = $state<Component<any> | null>(null);

  const activeEffect = $derived(effectsConfigState.activeEffect);
  const registration = $derived<EffectRegistration | undefined>(
    activeEffect !== "none" ? getRegistration(activeEffect) : undefined
  );
  // Always opens on the roster, even when an effect is already active from a
  // previous session. The inspector is somewhere you choose to go, never where
  // the panel drops you - landing in it is the same trap as navigating on
  // select, just triggered by boot instead of a click.
  let sidebarDetailOpen = $state(false);

  // ── Catalog (fill hosts, no effect on) ─────────────────────────────────────
  // With nothing on there is no dock, so the roster is the whole page and each
  // tile can carry a picture of its effect's look (or, in a card too narrow for
  // pictures, the names fill it as a list). Once an effect is on, the
  // roster goes back to the compact grid: the dock needs the room, and while
  // you compare effects the grid must stay still under the pointer (see
  // .sb-footer). Only turning effects on or off changes the arrangement, and
  // the view Crossfade animates that change.
  // Fractional sizes, floored once at the end: a panel 736.5px tall reports a
  // clientHeight of 737, and a catalog sized from that overflows by half a
  // pixel and puts a scrollbar on the host.
  let panelRect = $state<DOMRectReadOnly>();
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
  const catalogFit = $derived(
    fill && !showPlayback && !children && activeEffect === "none"
      ? fitEffectCatalog({
          width: Math.floor(panelRect?.width ?? 0) - CATALOG_CHROME_X,
          height: catalogRoom - CATALOG_CHROME_Y,
          count: rosterCount,
        })
      : null
  );

  /** The look each catalog tile shows: the one that effect is set to now, so
   *  the picture shows what turning it on will look like. An effect with no
   *  named looks (Ghost) draws its motif from its defaults. */
  const catalogLooks = $derived.by(() => {
    // The list arrangement has names only.
    if (!catalogFit?.portrait) return null;
    void effectsConfigState.version;
    const looks = new Map<
      string,
      { preset: EffectPreset; model: EffectLookPreviewModel }
    >();
    for (const meta of EFFECTS) {
      const group = getRegistration(meta.id)?.presetGroup;
      if (!group || !isEffectId(meta.id)) continue;
      const config = effectsConfigState.effect(meta.id) as unknown as Record<
        string,
        unknown
      >;
      const current =
        pickedPresetId(
          group,
          config,
          effectsConfigState.activePresets[meta.id]
        ) ?? matchPresetId(group, config);
      const preset: EffectPreset = group.presets.find(
        (candidate) => candidate.id === current
      ) ??
        group.presets[0] ?? {
          id: `${meta.id}-default`,
          name: meta.label,
          previewColor: meta.color,
        };
      looks.set(meta.id, {
        preset,
        model: createEffectLookPreview(meta.id, preset),
      });
    }
    return looks;
  });

  const sidebarView = $derived(
    sidebarDetailOpen && activeEffect !== "none" && registration
      ? `detail-${activeEffect}`
      : catalogFit
        ? "catalog"
        : "browser"
  );

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

  // Desktop customize components mutate the shared effects state directly. A
  // primitive-field diff keeps those controls observable without exporting a
  // config blob. Mobile tuning reports at the shared control primitive below.
  let observedCustomizationEffect: EffectId | null = null;
  let customizationSnapshot: Record<string, SettingValue> | null = null;
  function syncCustomizationSnapshot(): void {
    if (activeEffect === "none" || !isEffectId(activeEffect)) return;
    observedCustomizationEffect = activeEffect;
    customizationSnapshot = primitiveSnapshot(activeEffect);
  }
  $effect(() => {
    void effectsConfigState.version;
    if (
      !onSettingChange ||
      layout === "strip" ||
      !customizeOpen ||
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
    if (effectId === activeEffect) {
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
    customizeOpen = false;
    CustomizeComponent = null;
    effectsConfigState.setActiveEffect(effectId);
    reportSetting("active_effect", previous, effectId);
  }

  function handleSidebarDisable(): void {
    const previous = activeEffect;
    sidebarDetailOpen = false;
    customizeOpen = false;
    CustomizeComponent = null;
    effectsConfigState.setActiveEffect("none");
    reportSetting("active_effect", previous, "none");
  }

  // ── Mobile drill-down (layout="strip") ────────────────────────────────────
  // The Instagram-filter contract: tapping a tile applies the effect live and
  // STAYS in the picker (browsing costs zero navigation); tapping the
  // already-active tile drills into its detail screen (looks + primary slider +
  // More tuning). An explicit Off tile replaces the old tap-again-to-disable
  // toggle, which the drill gesture now owns.
  let detailOpen = $state(false);

  const stripView = $derived<"picker" | "detail" | "customize">(
    customizeOpen && CustomizeComponent
      ? "customize"
      : detailOpen && activeEffect !== "none" && registration
        ? "detail"
        : "picker"
  );

  function handleTileTap(effectId: string): void {
    if (effectId === activeEffect) {
      detailOpen = true;
      return;
    }
    if (isEffectId(effectId)) {
      const previous = activeEffect;
      effectsConfigState.setActiveEffect(effectId);
      reportSetting("active_effect", previous, effectId);
    }
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
  const customColors = $derived.by(() => {
    if (activeEffect !== "trails") return null;
    const c = effectsConfigState.personalDefault("trails");
    return c ? { left: c.leftColor, right: c.rightColor } : null;
  });

  async function handleCustomizeOpen(): Promise<void> {
    if (!registration) return;
    const mod = await registration.customizeComponent();
    CustomizeComponent = mod.default;
    customizeOpen = true;
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
      Default
    </button>
    <button
      type="button"
      class="anchor-btn"
      class:active={activePresetId === CUSTOM_CHIP_ID}
      class:disabled={customDisabled}
      disabled={customDisabled}
      onclick={() => handlePresetSelect(CUSTOM_CHIP_ID)}
    >
      Custom
    </button>
  </div>
{/snippet}

{#snippet effectDock(
  onTune: () => void,
  tuneLabel: string,
  looks: "rail" | "wrap" | "tiles"
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
        {looks}
      />
    {/if}
  </Crossfade>
{/snippet}

{#snippet catalogPortrait(effectId: string)}
  {@const look = catalogLooks?.get(effectId)}
  {#if look}
    <EffectPresetThumbnail
      effectType={effectId}
      preset={look.preset}
      legacyModel={look.model}
    />
  {/if}
{/snippet}

{#if layout === "sidebar"}
  <div
    class="effects-panel"
    class:fill
    class:detail-view={sidebarView.startsWith("detail-")}
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
    <Crossfade
      key={sidebarView}
      animateHeight
      mode="swap"
      duration={DURATION.fast}
    >
      {#if sidebarView === "browser" || sidebarView === "catalog"}
        <div
          class="sb-section sb-browser"
          class:catalog={sidebarView === "catalog"}
          style:height={sidebarView === "catalog"
            ? `${catalogRoom}px`
            : undefined}
        >
          <div class="sb-browser-head">
            {#if showHeading}
              <span class="sb-label">Effects</span>
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
                  ? "Effects off"
                  : `Turn off ${EFFECT_LABELS[activeEffect] ?? "effect"}`}
              </span>
            </button>
          </div>
          <EffectSelector
            {activeEffect}
            onSelect={handleSidebarEffectSelect}
            onPrewarm={handleEffectPrewarm}
            activeAction="tune"
            {availableEffects}
            catalog={sidebarView === "catalog" ? catalogFit : null}
            portrait={catalogPortrait}
          />

          {#if sidebarView === "browser"}
            {@render effectDock(
              () => (sidebarDetailOpen = true),
              "Tune",
              "tiles"
            )}
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

    {#if children}{@render children()}{/if}

    <div class="sb-section sb-footer" bind:borderBoxSize={footerBox}>
      <button
        type="button"
        class="reset-all-btn"
        onclick={() => (confirmResetAllOpen = true)}
      >
        Reset all effects to original
      </button>
    </div>
  </div>
{:else if layout === "strip"}
  <!-- Mobile drill-down: picker grid (all 16 + Off, no h-scroll) ⇄ per-effect
       detail screen ⇄ deep tuning. Tap a tile = apply live + stay; tap the
       active tile = drill into its detail. -->
  <div class="mep strip-layout">
    <!-- Same reason as the sidebar, and it matters more here: the tray sits at
         the bottom of a phone screen, so a step in its height shoves the canvas
         above it. -->
    <Crossfade
      key={stripView}
      animateHeight
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
              aria-label="Back to {EFFECT_LABELS[activeEffect] ?? activeEffect}"
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
            </button>
            <span class="tune-name"
              >{EFFECT_LABELS[activeEffect] ?? activeEffect}</span
            >
            <div class="tune-anchors">
              <button
                type="button"
                class="tune-anchor"
                class:active={activePresetId === DEFAULT_CHIP_ID}
                onclick={() => handlePresetSelect(DEFAULT_CHIP_ID)}
              >
                Default
              </button>
              <button
                type="button"
                class="tune-anchor"
                class:active={activePresetId === CUSTOM_CHIP_ID}
                disabled={customDisabled}
                onclick={() => handlePresetSelect(CUSTOM_CHIP_ID)}
              >
                Custom
              </button>
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
              <CustomizeComponent onBack={handleCustomizeClose} embedded />
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
      {:else if stripView === "detail" && registration && activeEffect !== "none"}
        <div class="drill-view">
          <!-- The dock carries this effect's identity, so the head is just the
               way back to the picker. -->
          <div class="detail-head">
            <button
              type="button"
              class="back-btn"
              onclick={() => (detailOpen = false)}
              aria-label="All effects"
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
            </button>
            <span class="detail-name">All effects</span>
          </div>

          {@render effectDock(handleCustomizeOpen, "More", "rail")}
        </div>
      {:else}
        <div class="drill-view">
          <!-- Off lives above the grid (not as a 17th tile) so the picker stays
               a clean 4×4. Tapping the active effect's tile drills into tuning,
               so this chip is the one explicit kill switch. -->
          <div class="picker-bar">
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
                  ? "Off"
                  : `Turn off ${EFFECT_LABELS[activeEffect] ?? ""}`}</span
              >
            </button>
          </div>
          <EffectSelector
            {activeEffect}
            onSelect={handleTileTap}
            onPrewarm={handleEffectPrewarm}
            layout="tray"
            activeAction="tune"
            {availableEffects}
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
        aria-label="Back to effect presets"
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span class="back-row-title">
          <span class="back-row-label"
            >{EFFECT_LABELS[activeEffect] ?? activeEffect}</span
          >
          <span class="back-row-sub">More tuning</span>
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
          <span
            >{activeEffect === "none"
              ? "Off"
              : `Turn off ${EFFECT_LABELS[activeEffect] ?? ""}`}</span
          >
        </button>
      </div>

      <EffectSelector
        {activeEffect}
        onSelect={handleEffectSelect}
        onPrewarm={handleEffectPrewarm}
        activeAction="tune"
        {availableEffects}
      />

      {@render effectDock(handleCustomizeOpen, "More", "rail")}
    {/if}
  </div>
{/if}

<ConfirmDialog
  bind:isOpen={confirmResetAllOpen}
  title="Reset all effects?"
  message="Every effect returns to its factory original. Your personal defaults and tuning are discarded. This can be undone."
  confirmText="Reset all"
  cancelText="Keep mine"
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

  /* Named so the inspector can recompose against the width it actually gets,
     in every host, instead of only inside Post Studio's own container. */
  .effects-panel {
    display: flex;
    flex-direction: column;
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
  }

  /* The host sets the height. Size containment keeps the panel's content out
     of that height, so a tall dock overflows into the host's scroll instead of
     stretching the panel that the catalog is sized from. */
  .effects-panel.fill {
    flex: 1 1 0;
    min-height: 0;
    container-type: size;
  }

  .sb-browser.catalog {
    display: flex;
    flex-direction: column;
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
    transition: all 150ms ease;
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
    transition: all 150ms ease;
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

  .drill-view {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Off chip row above the grid. Only child in its row, so its label growing
     ("Off" → "Turn off Sparkle") reflows nothing. */
  .picker-bar {
    display: flex;
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
    transition: all 150ms ease;
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
    transition: all 150ms ease;
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
    transition: all 150ms ease;
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
    transition: all 150ms ease;
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
