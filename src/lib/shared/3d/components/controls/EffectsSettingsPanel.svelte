<script lang="ts">
  /**
   * EffectsSettingsPanel - Visual effects controls for 3D viewer
   *
   * The canonical 16 per-tip effects plus one scene-level motion modifier.
   * Uses chip-style buttons consistent with GridSettingsPanel.
   *
   * Three scopes, in precedence order:
   *   - `performers` (All-Performers mode): reads/writes EVERY performer's
   *     `setEffect()` as a group radio. The grid shows an effect active only
   *     when all performers share it; toggling broadcasts to all.
   *   - `performer` (single): reads/writes that one performer's override,
   *     inheriting the global default when the override is null.
   *   - neither (global): reads/writes the unified EffectsConfig wildcard via
   *     `getEffectsConfigContext()`.
   * Motion is a scene-level modifier in every scope.
   */

  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getScene3DRenderContext } from "$lib/shared/3d/scene-features/state/scene-3d-render-context";
  import { createScene3DRenderState } from "$lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";
  import {
    EFFECTS,
    getRegistration,
  } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
  import EffectPresetsSection from "$lib/shared/animation-engine/components/effects-panel/EffectPresetsSection.svelte";
  import { matchPresetId } from "$lib/shared/animation-engine/components/effects-panel/presets/match-preset";
  import { isEffectId } from "$lib/shared/effects/state/effects-config-state.svelte";
  import EffectControlStack from "$lib/shared/effects/components/EffectControlStack.svelte";
  import { advancedControls } from "$lib/shared/effects/domain/effect-control-manifest";
  import type { EffectId } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { CharacterInstanceState } from "$lib/shared/3d/state/character-instance-state.svelte";
  import type { EffectType } from "$lib/shared/effects/domain/effects-config";
  import { createEffectControlOverrides } from "$lib/shared/effects/effect-control-fields";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import { onDestroy } from "svelte";

  interface Props {
    performer?: CharacterInstanceState | null;
    /** All-Performers mode: apply every change to this whole group. */
    performers?: CharacterInstanceState[] | null;
    onSettingChange?: ViewerControlSink;
    /**
     * Set by a host that owns performer state. Effect changes in either
     * performer scope go here instead of onto the performers themselves.
     * Ignored in global scope, which writes the shared EffectsConfig.
     */
    onEffectEdit?: (effect: EffectType) => boolean;
    presentation?: "standard" | "performer-hub";
  }
  let {
    performer = null,
    performers = null,
    onSettingChange,
    onEffectEdit,
    presentation = "standard",
  }: Props = $props();

  // Non-empty group => broadcast scope (All-Performers). Takes precedence over
  // the single-performer path.
  const multi = $derived(
    performers && performers.length > 0 ? performers : null
  );
  const trackingPropType = $derived.by(() => {
    if (!multi) {
      return performer?.effectiveProp ?? animationSettings.currentPropType;
    }

    const firstProp = multi[0]?.effectiveProp;
    return firstProp && multi.every((item) => item.effectiveProp === firstProp)
      ? firstProp
      : null;
  });

  const config = getEffectsConfigContext() ?? createEffectsConfigState();
  const scene3DRender = getScene3DRenderContext() ?? createScene3DRenderState();

  // The registry is canonical for order, label, icon, and color. Motion is a
  // scene modifier and intentionally stays outside the 16-effect radio group.
  type EffectKey = EffectType | "motion";
  const effectChips: ReadonlyArray<{
    key: EffectType;
    label: string;
    icon: string;
    color: string;
  }> = EFFECTS.map((effect) => ({
    key: effect.id as EffectType,
    label: effect.label,
    icon: effect.icon.replace(/^fa-/, ""),
    color: effect.color,
  }));
  const motionChip = {
    key: "motion" as const,
    label: "Motion",
    icon: "wind",
    color: "var(--semantic-info)",
  };
  const motionEnabled = $derived(isEnabled("motion"));

  // The single per-performer effect now uses the canonical EffectType directly
  // (no legacy EffectId translation), so the full 16-effect grid is selectable
  // per performer. Motion stays a scene-level modifier in both modes.
  // The global default a performer inherits when it has no override is the
  // effects-config wildcard.
  const inheritedEffect = $derived(
    config.config.tipEffectMap["*"]?.effect ?? "none"
  );
  const performerEffect = $derived.by<EffectKey | null>(() => {
    if (multi) {
      // The group shares an effect only when every performer resolves to the
      // same one; a mixed group reads as "none" (nothing highlighted).
      const first = multi[0]!.rawEffect ?? inheritedEffect;
      const allSame = multi.every(
        (p) => (p.rawEffect ?? inheritedEffect) === first
      );
      return allSame ? first : "none";
    }
    return performer ? (performer.rawEffect ?? inheritedEffect) : null;
  });

  function isEnabled(key: EffectKey): boolean {
    if (key === "motion") {
      return scene3DRender.motion.blur || scene3DRender.motion.speedLines;
    }
    if (multi || performer) {
      return performerEffect === key;
    }
    return config.config.tipEffectMap["*"]?.effect === key;
  }

  function toggle(key: EffectKey) {
    if (key === "motion") {
      const motionEnabled =
        scene3DRender.motion.blur || scene3DRender.motion.speedLines;
      scene3DRender.updateMotion({
        blur: !motionEnabled,
        speedLines: !motionEnabled,
      });
      reportViewerControlChange(
        onSettingChange,
        "viewer_3d_effects",
        "motion",
        motionEnabled,
        !motionEnabled
      );
      return;
    }
    if (multi) {
      // Group radio: if every performer already has this effect, clicking it
      // turns it off for all; otherwise set every performer to it.
      const allActive = multi.every(
        (p) => (p.rawEffect ?? inheritedEffect) === key
      );
      const next = (allActive ? "none" : key) as EffectType;
      if (onEffectEdit) {
        if (!onEffectEdit(next)) return;
      } else {
        for (const p of multi) p.setEffect(next);
      }
      reportViewerControlChange(
        onSettingChange,
        "viewer_3d_effects",
        "effect",
        performerEffect,
        allActive ? "none" : key
      );
      return;
    }
    if (performer) {
      // Radio: clicking the active effect turns it off ("none"); clicking
      // another replaces it. Reset-to-inherit is the CascadeBadge's job.
      const active = performerEffect === key;
      const next = (active ? "none" : key) as EffectType;
      if (onEffectEdit) {
        if (!onEffectEdit(next)) return;
      } else {
        performer.setEffect(next);
      }
      reportViewerControlChange(
        onSettingChange,
        "viewer_3d_effects",
        "effect",
        performerEffect,
        active ? "none" : key
      );
      return;
    }
    // Global mode - wildcard tip map. Toggling the active effect off returns
    // to "none" so the grid has a consistent off-state semantic.
    const previous = config.config.tipEffectMap["*"]?.effect ?? "none";
    const currentlyActive = previous === key;
    config.setTipEffectMap({ "*": { effect: currentlyActive ? "none" : key } });
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_effects",
      "effect",
      previous,
      currentlyActive ? "none" : key
    );
  }

  const globalEnabledCount = $derived(
    (config.config.tipEffectMap["*"]?.effect &&
    config.config.tipEffectMap["*"].effect !== "none"
      ? 1
      : 0) +
      (scene3DRender.motion.blur || scene3DRender.motion.speedLines ? 1 : 0)
  );

  // The tuned params live in the shared EffectsConfig (global by design), so the
  // sliders show whenever an effect with a curated 3D knob set is the active
  // one — in every scope, no double-click. The currently-enabled chip IS the
  // selection; its knobs appear above the grid automatically.
  const activeEffectKey = $derived.by<EffectType | null>(() => {
    for (const c of effectChips) {
      if (isEnabled(c.key)) return c.key;
    }
    return null;
  });
  // The active effect's id (if it's a real effect, not motion) — drives the
  // shared control stack rendered above the chip grid.
  const activeEffectId = $derived(
    activeEffectKey && isEffectId(activeEffectKey)
      ? (activeEffectKey as EffectId)
      : null
  );
  const activeRegistration = $derived(
    activeEffectId ? getRegistration(activeEffectId) : undefined
  );
  const activePresetId = $derived.by(() => {
    if (!activeEffectId || !activeRegistration) return null;
    const effectConfig = { ...config.effect(activeEffectId) };
    return matchPresetId(activeRegistration.presetGroup, effectConfig);
  });
  const presetSummary = $derived(
    activeRegistration?.presetGroup.getSummary(config) ?? ""
  );
  const controlOverrides = $derived(
    activeEffectId
      ? createEffectControlOverrides(activeEffectId, config, animationSettings)
      : undefined
  );
  let showAdvanced = $state(false);
  let drilldownEffect = $state<EffectType | null>(null);
  // This panel tunes the 3D viewer, so every manifest read asks for the 3D
  // view's controls.
  const hasAdvanced = $derived(
    activeEffectId ? advancedControls(activeEffectId, "3d").length > 0 : false
  );

  // --- Footer: Copy Diagnostic / Save Defaults / Reset ---
  let copyStatus = $state<"idle" | "copied" | "failed">("idle");
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });

  function openEffectDetail(effect: EffectType): void {
    if (!isEnabled(effect)) toggle(effect);
    drilldownEffect = effect;
    showAdvanced = false;
  }

  function closeEffectDetail(): void {
    drilldownEffect = null;
    showAdvanced = false;
  }

  function disableDrilldownEffect(): void {
    if (drilldownEffect && isEnabled(drilldownEffect)) {
      toggle(drilldownEffect);
    }
    closeEffectDetail();
  }

  async function copyDiagnostic() {
    const diagnostic = Object.fromEntries(
      EFFECTS.map((effect) => [
        effect.id,
        config.config[effect.id as keyof typeof config.config],
      ])
    );
    const json = JSON.stringify(diagnostic, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyStatus = "copied";
    } catch {
      console.log("[3d-effect-tuning]", json);
      copyStatus = "failed";
    }
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_effects",
      "diagnostic_copy",
      "requested",
      copyStatus,
      { count: false }
    );
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copyStatus = "idle"), 2500);
  }

  const copyLabel = $derived(
    copyStatus === "copied"
      ? "Copied"
      : copyStatus === "failed"
        ? "Copy failed"
        : "Copy Diagnostic"
  );

  function startCopyDiagnostic(): void {
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_effects",
      "diagnostic_copy",
      null,
      "requested"
    );
    void copyDiagnostic();
  }

  function toggleAdvanced(): void {
    const previous = showAdvanced;
    showAdvanced = !showAdvanced;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_effects",
      "advanced_open",
      previous,
      showAdvanced
    );
  }

  function saveDefaults(): void {
    config.saveAsBaseline();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_effects",
      "defaults_action",
      null,
      "save"
    );
  }

  function resetDefaults(): void {
    config.resetToBaseline();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_effects",
      "defaults_action",
      null,
      "reset"
    );
  }

  function handleEffectSettingChange(
    setting: string,
    previousValue: string | number | boolean | null,
    value: string | number | boolean | null,
    coalesce = false
  ): void {
    reportViewerControlChange(
      onSettingChange,
      `viewer_3d_effect_${activeEffectId ?? "none"}`,
      setting,
      previousValue,
      value,
      { coalesce }
    );
  }

  function selectPreset(presetId: string): void {
    if (!activeRegistration) return;
    const preset = activeRegistration.presetGroup.presets.find(
      (candidate) => candidate.id === presetId
    );
    if (!preset) return;

    const previous = activePresetId ?? "customized";
    const patch = preset.resolvePatch
      ? preset.resolvePatch()
      : (preset.patch ?? {});
    config.applyPreset(
      activeRegistration.presetGroup.effectType,
      preset.id,
      patch
    );
    reportViewerControlChange(
      onSettingChange,
      `viewer_3d_effect_${activeRegistration.presetGroup.effectType}`,
      "preset",
      previous,
      preset.id
    );
  }
</script>

<section
  class="effects-settings"
  class:hub-presentation={presentation === "performer-hub"}
>
  {#if presentation === "performer-hub"}
    {#if drilldownEffect && activeEffectId === drilldownEffect && activeRegistration}
      <div class="effect-drill-header">
        <button class="back-button" type="button" onclick={closeEffectDetail}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>All effects</span>
        </button>
        <div class="effect-drill-title">
          <strong>{activeRegistration.meta.label}</strong>
          <span>Presets and controls</span>
        </div>
        <button
          class="disable-effect"
          type="button"
          onclick={disableDrilldownEffect}
        >
          Disable
        </button>
      </div>

      <div class="effect-presets">
        <EffectPresetsSection
          presetGroup={activeRegistration.presetGroup}
          {activePresetId}
          onSelectPreset={selectPreset}
          effectLabel={activeRegistration.meta.label}
          accentColor={activeRegistration.meta.color}
          summary={presetSummary}
          showSummary={false}
          showCustomize={false}
        />
      </div>

      <div class="effect-controls">
        <EffectControlStack
          effect={activeEffectId}
          {config}
          view="3d"
          propType={trackingPropType}
          overrides={controlOverrides}
          onSettingChange={handleEffectSettingChange}
        />
        {#if hasAdvanced}
          <button
            type="button"
            class="advanced-toggle"
            aria-expanded={showAdvanced}
            onclick={toggleAdvanced}
          >
            <i
              class="fas fa-{showAdvanced ? 'chevron-up' : 'chevron-down'}"
              aria-hidden="true"
            ></i>
            Advanced
          </button>
          {#if showAdvanced}
            <EffectControlStack
              effect={activeEffectId}
              {config}
              view="3d"
              propType={trackingPropType}
              overrides={controlOverrides}
              tiers={["advanced"]}
              onSettingChange={handleEffectSettingChange}
            />
          {/if}
        {/if}
      </div>
    {:else}
      <div class="effects-intro">
        <strong>Choose an effect</strong>
        <span
          >Selection applies to the current performer scope. Open any effect to
          tune it.</span
        >
      </div>

      <div class="effect-chips hub-effect-grid">
        {#each effectChips as effect}
          {@const enabled = isEnabled(effect.key)}
          <button
            class="effect-chip"
            class:active={enabled}
            style="--color: {effect.color}"
            onclick={() => openEffectDetail(effect.key)}
            aria-label={`${enabled ? "Tune" : "Enable"} ${effect.label}`}
            aria-pressed={enabled}
          >
            <i class="fas fa-{effect.icon}" aria-hidden="true"></i>
            <span>{effect.label}</span>
          </button>
        {/each}
      </div>

      <div class="scene-modifier hub-scene-modifier">
        <div class="scene-copy">
          <strong>Scene Motion</strong>
          <span>Global motion blur and speed lines</span>
        </div>
        <button
          class="effect-chip modifier-chip"
          class:active={motionEnabled}
          style="--color: {motionChip.color}"
          onclick={() => toggle(motionChip.key)}
          aria-label={motionEnabled
            ? "Disable Scene Motion"
            : "Enable Scene Motion"}
          aria-pressed={motionEnabled}
        >
          <i class="fas fa-{motionChip.icon}" aria-hidden="true"></i>
          <span>{motionEnabled ? "On" : "Off"}</span>
        </button>
      </div>
    {/if}
  {:else}
    <h3>{t("viewer3d_effects")}</h3>
    <div class="effect-chips">
      {#each effectChips as effect}
        {@const enabled = isEnabled(effect.key)}
        <button
          class="effect-chip"
          class:active={enabled}
          style="--color: {effect.color}"
          onclick={() => toggle(effect.key)}
          aria-label={enabled ? effect.label : `Enable ${effect.label}`}
          aria-pressed={enabled}
          title={enabled ? effect.label : "Click to enable"}
        >
          <i class="fas fa-{effect.icon}" aria-hidden="true"></i>
          <span>{effect.label}</span>
        </button>
      {/each}
    </div>

    <div class="scene-modifier">
      <span class="scene-modifier-label">Scene</span>
      <button
        class="effect-chip modifier-chip"
        class:active={motionEnabled}
        style="--color: {motionChip.color}"
        onclick={() => toggle(motionChip.key)}
        aria-label={motionEnabled
          ? motionChip.label
          : `Enable ${motionChip.label}`}
        aria-pressed={motionEnabled}
      >
        <i class="fas fa-{motionChip.icon}" aria-hidden="true"></i>
        <span>{motionChip.label}</span>
      </button>
    </div>

    {#if activeRegistration}
      <div class="effect-presets">
        <EffectPresetsSection
          presetGroup={activeRegistration.presetGroup}
          {activePresetId}
          onSelectPreset={selectPreset}
          effectLabel={activeRegistration.meta.label}
          accentColor={activeRegistration.meta.color}
          summary={presetSummary}
          showSummary={false}
          showCustomize={false}
        />
      </div>
    {/if}

    {#if activeEffectId}
      <div class="effect-controls">
        <EffectControlStack
          effect={activeEffectId}
          {config}
          view="3d"
          propType={trackingPropType}
          overrides={controlOverrides}
          onSettingChange={handleEffectSettingChange}
        />
        {#if hasAdvanced}
          <button
            type="button"
            class="advanced-toggle"
            aria-expanded={showAdvanced}
            onclick={toggleAdvanced}
          >
            <i
              class="fas fa-{showAdvanced ? 'chevron-up' : 'chevron-down'}"
              aria-hidden="true"
            ></i>
            Advanced
          </button>
          {#if showAdvanced}
            <EffectControlStack
              effect={activeEffectId}
              {config}
              view="3d"
              propType={trackingPropType}
              overrides={controlOverrides}
              tiers={["advanced"]}
              onSettingChange={handleEffectSettingChange}
            />
          {/if}
        {/if}
      </div>
    {/if}

    {#if multi || performer}
      {#if performerEffect && performerEffect !== "none"}
        <div class="active-count">1 effect active</div>
      {/if}
    {:else if globalEnabledCount > 0}
      <div class="active-count">
        {globalEnabledCount} effect{globalEnabledCount > 1 ? "s" : ""} active
      </div>
    {/if}

    <div class="tune-footer">
      <button
        class="footer-btn copy-btn"
        class:copied={copyStatus === "copied"}
        class:failed={copyStatus === "failed"}
        onclick={startCopyDiagnostic}
        title="Copy current effect tuning as JSON"
      >
        {copyLabel}
      </button>
      <button
        data-save-shortcut
        class="footer-btn"
        onclick={saveDefaults}
        title="Save current tuning as the default Reset returns to"
        >Save Defaults</button
      >
      <button
        class="footer-btn"
        onclick={resetDefaults}
        title="Reset tuning to the saved default">Reset</button
      >
    </div>
  {/if}
</section>

<style>
  .effects-settings {
    padding: 1rem;
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    container-type: inline-size;
  }

  .effects-settings.hub-presentation {
    padding: 0;
    border: none;
    background: transparent;
  }

  .effects-intro,
  .effect-drill-title,
  .scene-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .effects-intro {
    margin-bottom: 10px;
  }

  .effects-intro strong,
  .effect-drill-title strong,
  .scene-copy strong {
    color: var(--theme-text);
    font-size: 15px;
    line-height: 1.2;
  }

  .effects-intro span,
  .effect-drill-title span,
  .scene-copy span {
    color: var(--theme-text-dim);
    font-size: 14px;
    line-height: 1.35;
  }

  h3 {
    margin: 0 0 0.75rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim);
  }

  /* Two rows of square touch-target buttons that flow into columns and expand
     widthwise (horizontal scroll past the panel width). */
  .effect-chips {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, 1fr);
    grid-auto-columns: 64px;
    gap: 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.35rem;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke-strong) transparent;
  }

  .effect-chip {
    width: 64px;
    height: 64px;
    min-height: var(--min-touch-target);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .effect-chip span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Icons carry their effect color at all times (matches the 2D panel), dimmed
     a touch until active. */
  .effect-chip i {
    font-size: 1.1rem;
    color: var(--color);
    opacity: 0.85;
    transition: all var(--duration-fast);
  }

  .effect-chip:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong);
  }

  .effect-chip:hover i {
    opacity: 1;
  }

  .effect-chip.active {
    background: color-mix(in srgb, var(--color) 20%, transparent);
    border-color: var(--color);
    color: var(--theme-text);
  }

  .effect-chip.active i {
    color: var(--color);
    opacity: 1;
  }

  .scene-modifier {
    margin-top: 0.55rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--theme-stroke);
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .scene-modifier-label {
    min-width: 3rem;
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .modifier-chip {
    width: 64px;
    flex: 0 0 64px;
  }

  .effect-presets {
    margin-top: 0.2rem;
  }

  /* Active effect's control stack, rendered above the chip grid. */
  .effect-controls {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .advanced-toggle {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: none;
    color: var(--theme-text-dim);
    min-height: 44px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    padding: 0 0.6rem;
  }
  .advanced-toggle:hover {
    color: var(--theme-text);
  }
  .advanced-toggle i {
    font-size: 0.7rem;
  }

  .active-count {
    margin-top: 0.75rem;
    font-size: 14px;
    color: var(--theme-text-dim);
    text-align: center;
  }

  /* Footer actions: equal thirds so the Copy label swapping
     ("Copy Diagnostic" → "Copied") can't reflow its neighbours. */
  .tune-footer {
    /* The parent (.effects-section) gives .effect-chips order:10; this keeps the
       Save/Reset/Copy row below the chip grid while the tuning sliders float
       above it. */
    order: 11;
    margin-top: 0.75rem;
    display: flex;
    gap: 0.4rem;
  }

  .footer-btn {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.4rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all var(--duration-fast);
  }

  .footer-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong);
  }

  .copy-btn.copied {
    color: var(--semantic-success);
    border-color: var(--semantic-success);
  }

  .copy-btn.failed {
    color: var(--semantic-error);
    border-color: var(--semantic-error);
  }

  .hub-effect-grid {
    grid-auto-flow: row;
    grid-template-rows: none;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-columns: auto;
    gap: 8px;
    overflow: visible;
    padding-bottom: 0;
  }

  .hub-effect-grid .effect-chip {
    width: 100%;
    min-width: 0;
  }

  .hub-scene-modifier {
    justify-content: space-between;
    min-height: 68px;
    padding: 8px 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    background: var(--surface-inset);
  }

  .effect-drill-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .back-button,
  .disable-effect {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 9px;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .back-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .disable-effect {
    color: var(--semantic-error);
    border-color: color-mix(in srgb, var(--semantic-error) 38%, transparent);
  }

  .disable-effect:hover {
    background: color-mix(in srgb, var(--semantic-error) 12%, transparent);
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @container (min-width: 560px) {
    .hub-effect-grid {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }

  @media (max-width: 400px) {
    .effect-chips {
      grid-auto-columns: 56px;
    }
    .effect-chip {
      width: 56px;
      height: 56px;
    }

    .hub-effect-grid .effect-chip {
      width: 100%;
    }

    .effect-drill-header {
      grid-template-columns: 1fr auto;
    }

    .effect-drill-title {
      grid-row: 2;
      grid-column: 1 / -1;
    }
  }
</style>
