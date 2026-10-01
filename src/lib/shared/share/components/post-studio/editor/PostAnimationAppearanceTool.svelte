<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { Popover } from "bits-ui";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import DisplayPanel from "$lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import EffortPanel from "$lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte";
  import PostScopedEffectsPanel from "./PostScopedEffectsPanel.svelte";
  import PostAppearanceChooser from "./PostAppearanceChooser.svelte";
  import { localizedPropName } from "$lib/shared/settings/components/tabs/prop-type/localized-prop-name";
  import {
    PROP_PICKER_SECTIONS,
    getBasePropType,
    isPropActive,
    isPremiumCosmeticProp,
  } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { isPremiumCosmeticVisible } from "$lib/shared/subscription/domain/premium-prop-access";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import IconRailNav from "$lib/shared/animation-panel/pill-nav/IconRailNav.svelte";
  import LightsToggleButton from "$lib/shared/ui/components/LightsToggleButton.svelte";
  import { RAIL_CATEGORY_ACCENTS } from "$lib/shared/animation-panel/pill-nav/rail-category-accents";
  import { EFFORTS } from "$lib/shared/effort/domain/effort-types";
  import type { TimingSection } from "$lib/shared/media-composition/domain/take-timing";
  import {
    EFFECT_COLORS,
    EFFECTS,
    EFFECT_LABELS,
    effectNavIcon,
  } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import {
    animationSettings,
    createAnimationSettingsState,
  } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type {
    PostAnimationItem,
    PostMovesItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { layerTimingParts } from "../builder/post-timing-animation";
  import { itemDisplayLabel } from "./post-editor-labels";
  import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { copyPostAnimationEffects } from "../post-animation-effects.svelte";

  let {
    editor,
    item = null,
    appearanceOverride,
    onAppearanceChange,
    appearanceKey,
    scopeLabel,
    timingSection = null,
    timingSectionLabel,
    locked,
    fill = false,
    defaultPropType = PropType.STAFF,
  }: {
    editor: PostEditorState;
    item?: PostAnimationItem | PostMovesItem | null;
    appearanceOverride?: PostAnimationItem["animationAppearance"] | null;
    onAppearanceChange?: (
      appearance: NonNullable<PostAnimationItem["animationAppearance"]>,
      settingKey?: string
    ) => void;
    appearanceKey?: string;
    scopeLabel?: string;
    timingSection?: TimingSection | null;
    timingSectionLabel?: string;
    locked: boolean;
    /** Fit the editor's bounded tool area; mapping accordions stay intrinsic. */
    fill?: boolean;
    defaultPropType?: PropType;
  } = $props();

  type Section = "props" | "effects" | "efforts" | "display";
  const id = $props.id();
  let activeSection = $state<Section>("display");
  let pickedPropType = $state<PropType | undefined>();
  const inheritedVisibility = getAnimationVisibilityManager();
  let inheritedEffort = $state(inheritedVisibility.getEffortPreset());
  const syncInheritedEffort = () => {
    inheritedEffort = inheritedVisibility.getEffortPreset();
  };
  inheritedVisibility.registerObserver(syncInheritedEffort);
  onDestroy(() => inheritedVisibility.unregisterObserver(syncInheritedEffort));
  const appliedEffort = $derived(
    (item?.animationAppearance ?? appearanceOverride)?.effortPreset ??
      inheritedEffort
  );
  const appliedEffortLabel = $derived(
    EFFORTS.find((effort) => effort.id === appliedEffort)?.label ??
      appliedEffort
  );
  const appliedScope = $derived(
    scopeLabel ??
      (item
        ? (item.label ?? itemDisplayLabel(item, editor.project))
        : "Timing preview")
  );
  const timingParts = $derived(
    item
      ? layerTimingParts(editor.project, item, (takeId) =>
          editor.timing(takeId)
        )
      : []
  );
  const customParts = $derived(
    timingParts.filter(
      (part) => part.landingHoldRatio > 0 || part.movedLandings > 0
    )
  );
  const hasCustomTiming = $derived(
    item
      ? customParts.length > 0
      : !!timingSection &&
          ((timingSection.landingHoldRatio ?? 0) > 0 ||
            timingSection.overrides.length > 0)
  );
  let timingDetailsOpen = $state(false);
  const timingSummary = $derived.by(() => {
    const parts = item
      ? customParts
      : timingSection
        ? [
            {
              landingHoldRatio: timingSection.landingHoldRatio ?? 0,
              movedLandings: timingSection.overrides.length,
            },
          ]
        : [];
    const holds = [
      ...new Set(
        parts.map((part) => part.landingHoldRatio).filter((ratio) => ratio > 0)
      ),
    ];
    const moved = parts.reduce((sum, part) => sum + part.movedLandings, 0);
    const details: string[] = [];
    if (holds.length === 1)
      details.push(Math.round(holds[0]! * 100) + "% landing hold");
    else if (holds.length > 1) details.push("Varying landing holds");
    if (moved > 0)
      details.push(
        moved + (moved === 1 ? " adjusted landing" : " adjusted landings")
      );
    if (
      item &&
      timingParts.some(
        (part) => part.landingHoldRatio === 0 && part.movedLandings === 0
      )
    )
      details.push("part of this layer");
    return details.join(" · ");
  });
  const otherCustomLayer = $derived.by(() => {
    if (!item) return null;
    const candidates = editor.project.tracks
      .flatMap((track) => track.items)
      .filter(
        (candidate): candidate is PostAnimationItem | PostMovesItem =>
          candidate.id !== item.id &&
          (candidate.kind === "animation" || candidate.kind === "moves")
      )
      .sort((a, b) => Number(b.kind === "moves") - Number(a.kind === "moves"));
    for (const candidate of candidates) {
      const parts = layerTimingParts(editor.project, candidate, (takeId) =>
        editor.timing(takeId)
      );
      const custom = parts.find(
        (part) => part.landingHoldRatio > 0 || part.movedLandings > 0
      );
      if (custom) return { item: candidate, part: custom };
    }
    return null;
  });
  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  let darkMode = $state(visibility.isDarkMode());
  let effortPreset = $state(visibility.getEffortPreset());
  let pathShape = $state(visibility.getPathShape());
  let motionAware = $state(visibility.getMotionAwarePaths());
  const propCount = $derived(
    PROP_PICKER_SECTIONS.flatMap((section) => section.props).filter(
      (prop) =>
        (prop === getBasePropType(prop) || isPremiumCosmeticProp(prop)) &&
        (isPremiumCosmeticProp(prop)
          ? isPremiumCosmeticVisible()
          : isPropActive(prop))
    ).length
  );
  const effortLabel = $derived(
    EFFORTS.find((effort) => effort.id === effortPreset)?.label ?? "Linear"
  );
  const pathLabel = $derived(
    motionAware
      ? "Hybrid"
      : pathShape === "linear"
        ? "Linear"
        : pathShape === "concave"
          ? "Concave"
          : "Arc"
  );
  function updateSummary(): void {
    effortPreset = visibility.getEffortPreset();
    pathShape = visibility.getPathShape();
    motionAware = visibility.getMotionAwarePaths();
  }
  visibility.registerObserver(updateSummary);
  onDestroy(() => visibility.unregisterObserver(updateSummary));
  const sourceEffects = getEffectsConfigContext();
  const initialEffects = sourceEffects?.snapshot() ?? DEFAULT_EFFECTS_CONFIG;
  const initialTrail = animationSettings.snapshot().trail;
  const trailSettings = createAnimationSettingsState({ ephemeral: true });
  const trailEffects = createEffectsConfigState(initialEffects, {
    persist: false,
  });
  trailSettings.replaceAll(animationSettings.snapshot());
  const sections = $derived([
    {
      id: "props" as const,
      label: "Props",
      propType: pickedPropType ?? defaultPropType,
      accentColor: RAIL_CATEGORY_ACCENTS.props,
    },
    {
      id: "effects" as const,
      label: "Effects",
      icon: effectNavIcon(trailEffects.activeEffect),
      accentColor:
        EFFECT_COLORS[trailEffects.activeEffect] ??
        RAIL_CATEGORY_ACCENTS.effects,
    },
    {
      id: "efforts" as const,
      label: "Efforts",
      accentColor:
        EFFORTS.find((effort) => effort.id === appliedEffort)?.color ??
        EFFORTS[0]!.color,
    },
    {
      id: "display" as const,
      label: "Display",
      icon: "fa-eye",
      accentColor: RAIL_CATEGORY_ACCENTS.display,
    },
  ]);
  const keys = [
    "gridMode",
    "props",
    "tkaGlyph",
    "elementalGlyph",
    "propElementalGlyph",
    "stepNumbers",
    "progressBar",
    "wordHeader",
    "mandala",
    "leftPathLines",
    "rightPathLines",
    "pathShape",
    "motionAwarePaths",
    "effortPreset",
    "darkMode",
  ] as const;
  let syncing = false;
  let effectsWereEdited = false;

  $effect(() => {
    const appearance = item?.animationAppearance ?? appearanceOverride;
    const effortPreset = appearance?.effortPreset ?? inheritedEffort;
    untrack(() => {
      syncing = true;
      try {
        visibility.updateSettings({
          ...getAnimationVisibilityManager().getSettings(),
          wordHeader: false,
          ...appearance,
          effortPreset,
          darkMode: appearance?.darkMode ?? true,
        });
        darkMode = visibility.isDarkMode();
        const trail = appearance?.trail;
        pickedPropType = appearance?.propType;
        effectsWereEdited = !!appearance?.effects || !!trail;
        trailSettings.updateSettings({
          trail: {
            ...initialTrail,
            trackingMode: trail?.trackingMode ?? initialTrail.trackingMode,
            tailLength: trail?.tailLength ?? initialTrail.tailLength,
          },
        });
        const nextEffects = copyPostAnimationEffects(
          appearance?.effects ?? initialEffects
        );
        if (trail && !appearance?.effects) {
          nextEffects.trails = {
            ...nextEffects.trails,
            trackingMode: trail.trackingMode,
            thickness: trail.thickness,
            brightness: trail.brightness,
            leftColor: trail.leftColor,
            rightColor: trail.rightColor,
          };
          nextEffects.activeEffect = trail.enabled ? "trails" : "none";
          nextEffects.tipEffectMap = trail.enabled
            ? { "*": { effect: "trails" } }
            : {};
        }
        trailEffects.replace(nextEffects);
      } finally {
        syncing = false;
      }
    });
  });

  function save(settingKey?: string): void {
    if (syncing || locked) return;
    const settings = visibility.getSettings();
    const appearance = Object.fromEntries(
      keys.map((key) => [key, settings[key]])
    ) as NonNullable<PostAnimationItem["animationAppearance"]>;
    if (pickedPropType) appearance.propType = pickedPropType;
    if (effectsWereEdited) {
      appearance.effects = trailEffects.snapshot();
      const trails = trailEffects.trails;
      appearance.trail = {
        enabled: trailEffects.activeEffect === "trails",
        trackingMode: trailSettings.trail.trackingMode,
        thickness: trails.thickness,
        brightness: trails.brightness,
        tailLength: trailSettings.trail.tailLength,
        leftColor: trails.leftColor,
        rightColor: trails.rightColor,
      };
    }
    if (onAppearanceChange) {
      onAppearanceChange(appearance, settingKey);
      return;
    }
    if (!item) return;
    const itemId = item.id;
    const change = (
      project: Parameters<typeof updateItem>[0],
      ctx: Parameters<typeof updateItem>[3]
    ) => updateItem(project, itemId, { animationAppearance: appearance }, ctx);
    if (settingKey)
      editor.editSetting(
        `${appearanceKey ?? itemId}:effects:${settingKey}`,
        change
      );
    else editor.edit(change);
  }
  visibility.registerObserver(save);
  onDestroy(() => visibility.unregisterObserver(save));

  function saveEffects(settingKey: string): void {
    effectsWereEdited = true;
    save(settingKey);
  }
</script>

<div class="appearance-tool" class:fill>
  {#if locked}
    <p>Unlock this layer to change its appearance.</p>
  {:else}
    <div class="section-navigation">
      <IconRailNav
        pills={sections}
        activeId={activeSection}
        onSelect={(section) => (activeSection = section)}
        orientation="horizontal"
        compact
        panelIdPrefix={id}
        ariaLabel="Animation appearance"
      />
    </div>
    <div
      class="section-content"
      class:display={activeSection === "display"}
      id="{id}-{activeSection}-panel"
      role="tabpanel"
      aria-labelledby="{id}-{activeSection}-tab"
      tabindex="0"
    >
      {#if activeSection === "props"}
        <PostAppearanceChooser
          title="Props"
          value={localizedPropName(pickedPropType ?? defaultPropType)}
          {fill}
          count={propCount}
          tileWidth={96}
          tileHeight={112}
          insetX={36}
          chromeHeight={44}
        >
          {#snippet children(bounded)}
            <BentoPropGrid
              selectedPropType={pickedPropType ?? defaultPropType}
              onSelect={(propType) => {
                pickedPropType = propType;
                save();
              }}
              showColors={false}
              showPropLook={false}
              showAppearance={false}
              scrollMode={bounded ? "internal" : "host"}
              fill={bounded}
              minTileSize={88}
              variant="inline"
              flat
              tileDensity="comfortable"
            />
          {/snippet}
        </PostAppearanceChooser>
      {:else if activeSection === "effects"}
        <PostAppearanceChooser
          title="Effects"
          value={EFFECT_LABELS[trailEffects.activeEffect] ?? "Off"}
          {fill}
          count={EFFECTS.length}
          tileWidth={96}
          tileHeight={72}
          chromeHeight={52}
        >
          {#snippet children(bounded)}
            <PostScopedEffectsPanel
              fill={bounded}
              effects={trailEffects}
              animationSettingsState={trailSettings}
              onSettingChange={saveEffects}
            />
          {/snippet}
        </PostAppearanceChooser>
      {:else if activeSection === "efforts"}
        <Popover.Root bind:open={timingDetailsOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button {...props} class="movement-overview" type="button">
                <span class="movement-heading"
                  ><strong
                    >{hasCustomTiming
                      ? "Custom timing"
                      : "Movement: " + appliedEffortLabel}</strong
                  ><span aria-hidden="true">›</span></span
                >
                <span
                  >{appliedScope}{hasCustomTiming
                    ? " · Base: " + appliedEffortLabel
                    : ""}</span
                >
                {#if hasCustomTiming}<span>{timingSummary}</span>{/if}
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={8}
              collisionPadding={12}
              forceMount
            >
              {#snippet child({ open, wrapperProps, props })}
                <div {...wrapperProps}>
                  {#if open}
                    <div
                      {...props}
                      class="timing-popover themed-scrollbar"
                      role="dialog"
                      aria-label="Movement timing"
                      transition:flyFade={{ y: -4, duration: DURATION.fast }}
                    >
                      {@render timingDetails()}
                    </div>
                  {/if}
                </div>
              {/snippet}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <PostAppearanceChooser
          title={hasCustomTiming
            ? "Base movement and paths"
            : "Movement and paths"}
          value={`${effortLabel} · ${pathLabel} paths`}
          {fill}
          count={EFFORTS.length}
          tileWidth={104}
          tileHeight={88}
          chromeHeight={140}
          columnChoices={[1, 2, 4]}
        >
          {#snippet children(bounded)}
            <div class="efforts-controls" class:bounded>
              <PathShapePanel
                visibilityManagerOverride={visibility}
                showHelp={false}
              />
              <div class="effort-section">
                <h3>{hasCustomTiming ? "Base movement" : "Movement style"}</h3>
                <EffortPanel
                  visibilityManagerOverride={visibility}
                  fit={bounded}
                />
              </div>
            </div>
          {/snippet}
        </PostAppearanceChooser>
      {:else}
        <div class="canvas-theme">
          <span>Canvas theme</span>
          <LightsToggleButton
            lightsOn={!darkMode}
            onToggle={() => {
              visibility.setDarkMode(!darkMode);
              darkMode = visibility.isDarkMode();
            }}
            showLabel
          />
        </div>
        <DisplayPanel
          {fill}
          grow={fill}
          compact
          sequence={editor.sequence}
          propType={pickedPropType ?? defaultPropType}
          visibilityManagerOverride={visibility}
          animationSettingsOverride={trailSettings}
        />
      {/if}
    </div>
  {/if}
</div>

{#snippet timingDetails()}
  <div class="timing-header">
    <div>
      <h3>{hasCustomTiming ? "Custom timing" : "Movement timing"}</h3>
      <p>
        {appliedScope} · {hasCustomTiming ? "Base: " : ""}{appliedEffortLabel}
      </p>
    </div>
    <button
      class="timing-close"
      type="button"
      aria-label="Close movement timing"
      onclick={() => (timingDetailsOpen = false)}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </div>
  {#if !item && timingSection}
    <p class="preview-detail">
      {timingSectionLabel ?? "Selected section"}
      {#if (timingSection.landingHoldRatio ?? 0) > 0}
        · {Math.round((timingSection.landingHoldRatio ?? 0) * 100)}% landing
        hold
      {/if}
      {#if timingSection.overrides.length > 0}
        · {timingSection.overrides.length}
        {timingSection.overrides.length === 1 ? "landing" : "landings"} moved by hand
      {/if}
    </p>
  {/if}
  {#if customParts.length > 0}
    <ul class="timing-parts">
      {#each timingParts as part (`${part.takeId}:${part.sectionIndex}:${part.start}`)}
        <li>
          <span class="take-label"
            >{editor.takes.find((take) => take.id === part.takeId)?.label ??
              "Take"}</span
          >
          <div class="timing-part-detail">
            <span class="time-range"
              >{part.start.toFixed(1)}–{part.end.toFixed(1)}s</span
            >
            <span>
              {part.landingHoldRatio > 0
                ? `${Math.round(part.landingHoldRatio * 100)}% landing hold`
                : "No landing hold"}{part.movedLandings > 0
                ? ` · ${part.movedLandings} ${part.movedLandings === 1 ? "landing" : "landings"} moved by hand`
                : ""}
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if otherCustomLayer}
    <button
      class="other-layer"
      type="button"
      onclick={() => {
        editor.selectedItemId = otherCustomLayer!.item.id;
        timingDetailsOpen = false;
      }}
    >
      <span
        >View {otherCustomLayer.item.label ??
          itemDisplayLabel(otherCustomLayer.item, editor.project)}
      </span><span aria-hidden="true">›</span>
    </button>
  {/if}
{/snippet}

<style>
  .movement-overview {
    flex: none;
    display: grid;
    gap: 0.25rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.625rem;
    background: var(--theme-card-bg, #181820);
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    text-align: left;
    cursor: pointer;
  }
  .movement-overview .movement-heading {
    justify-content: space-between;
  }
  .movement-overview:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }
  .timing-popover {
    box-sizing: border-box;
    width: min(22rem, calc(100vw - 24px));
    max-width: var(--bits-popover-content-available-width);
    max-height: var(--bits-popover-content-available-height);
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke-strong, #484755);
    border-radius: 0.75rem;
    background-color: var(--theme-bg-deep, #08080c);
    background-image: linear-gradient(
      var(--theme-panel-bg, #101014),
      var(--theme-panel-bg, #101014)
    );
    box-shadow: 0 8px 24px var(--theme-shadow, rgb(0 0 0 / 0.35));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
    overflow: auto;
    overscroll-behavior: contain;
    z-index: var(--z-dropdown, 1000);
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }
  .timing-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 0.5rem;
  }
  .timing-header h3 {
    font-size: 1rem;
  }
  .timing-header p,
  .preview-detail {
    margin: 0.25rem 0 0;
    color: var(--theme-text-secondary, #aaa);
  }
  .timing-close {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    margin: -0.375rem -0.375rem 0 0;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--theme-text-secondary, #aaa);
    cursor: pointer;
  }
  .timing-close:hover,
  .other-layer:hover {
    background: var(--theme-card-bg, #181820);
    color: var(--theme-text, #fff);
  }
  .timing-close:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: -2px;
  }
  .timing-parts {
    list-style: none;
    margin: 0.75rem 0;
    padding: 0;
  }
  .timing-parts li {
    padding: 0.625rem 0;
    border-top: 1px solid var(--theme-stroke, #484755);
  }
  .take-label {
    font-weight: 600;
  }
  .timing-part-detail {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
    margin-top: 0.25rem;
  }
  .time-range {
    color: var(--theme-text-secondary, #aaa);
    font-variant-numeric: tabular-nums;
  }

  .appearance-tool {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .appearance-tool.fill {
    flex: 1;
    min-height: 0;
  }
  .canvas-theme {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .section-navigation {
    flex: none;
    padding: 0;
    background: var(--theme-panel-bg, #08080c);
  }
  .section-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    padding-bottom: 0;
  }
  .section-content.display {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-bottom: 0;
  }
  .fill .section-content {
    flex: 1;
    min-height: 0;
  }
  .section-content:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: -2px;
  }
  .effort-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .efforts-controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .efforts-controls.bounded {
    flex: 1;
    min-height: 0;
  }
  .bounded .effort-section {
    flex: 1;
    min-height: 0;
  }
  .movement-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.625rem;
  }
  .movement-heading strong {
    font-size: 1rem;
  }
  .other-layer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .other-layer:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
  }
</style>
