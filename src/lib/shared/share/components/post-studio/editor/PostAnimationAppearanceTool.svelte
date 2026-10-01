<script lang="ts">
  import { onDestroy, untrack } from "svelte";
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
  import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { copyPostAnimationEffects } from "../post-animation-effects.svelte";

  let {
    editor,
    item = null,
    appearanceOverride,
    onAppearanceChange,
    appearanceKey,
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
    locked: boolean;
    /** Fit the editor's bounded tool area; mapping accordions stay intrinsic. */
    fill?: boolean;
    defaultPropType?: PropType;
  } = $props();

  type Section = "props" | "effects" | "efforts" | "display";
  const id = $props.id();
  let activeSection = $state<Section>("display");
  let pickedPropType = $state<PropType | undefined>();

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
        EFFORTS.find(
          (effort) =>
            effort.id ===
            ((item?.animationAppearance ?? appearanceOverride)?.effortPreset ??
              getAnimationVisibilityManager().getSettings().effortPreset)
        )?.color ?? EFFORTS[0]!.color,
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
    untrack(() => {
      syncing = true;
      try {
        visibility.updateSettings({
          ...getAnimationVisibilityManager().getSettings(),
          wordHeader: false,
          ...appearance,
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
        <PostAppearanceChooser
          title="Efforts"
          value={`${effortLabel} · ${pathLabel} paths`}
          {fill}
          count={EFFORTS.length}
          tileWidth={104}
          tileHeight={88}
          chromeHeight={140}
        >
          {#snippet children(bounded)}
            <div class="efforts-controls" class:bounded>
              <PathShapePanel
                visibilityManagerOverride={visibility}
                showHelp={false}
              />
              <div class="effort-section">
                <h3>Movement style</h3>
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

<style>
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
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
  }
</style>
