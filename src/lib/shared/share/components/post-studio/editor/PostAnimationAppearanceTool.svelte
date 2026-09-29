<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import DisplayPanel from "$lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import EffortPanel from "$lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte";
  import TrailsPanel from "$lib/shared/animation-engine/components/settings-panels/TrailsPanel.svelte";
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
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { PostAnimationItem } from "$lib/shared/media-composition/domain/post-project";
  import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

  let {
    editor,
    item,
    locked,
  }: {
    editor: PostEditorState;
    item: PostAnimationItem;
    locked: boolean;
  } = $props();

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  const sourceEffects = getEffectsConfigContext();
  const initialEffects = sourceEffects?.snapshot() ?? DEFAULT_EFFECTS_CONFIG;
  const initialTrail = animationSettings.snapshot().trail;
  const trailSettings = createAnimationSettingsState({ ephemeral: true });
  const trailEffects = createEffectsConfigState(initialEffects, {
    persist: false,
  });
  trailSettings.replaceAll(animationSettings.snapshot());
  const keys = [
    "gridMode",
    "props",
    "tkaGlyph",
    "elementalGlyph",
    "propElementalGlyph",
    "stepNumbers",
    "wordHeader",
    "mandala",
    "leftPathLines",
    "rightPathLines",
    "pathShape",
    "motionAwarePaths",
    "effortPreset",
  ] as const;
  let syncing = false;
  let trailWasEdited = false;

  $effect(() => {
    const appearance = item.animationAppearance;
    untrack(() => {
      syncing = true;
      try {
        visibility.updateSettings(
          appearance ?? {
            ...getAnimationVisibilityManager().getSettings(),
            wordHeader: false,
          }
        );
        const trail = appearance?.trail;
        trailWasEdited = !!trail;
        trailSettings.updateSettings({
          trail: {
            ...initialTrail,
            trackingMode: trail?.trackingMode ?? initialTrail.trackingMode,
            tailLength: trail?.tailLength ?? initialTrail.tailLength,
          },
        });
        const nextEffects = structuredClone(initialEffects);
        if (trail) {
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
    if (trailWasEdited) {
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
    const change = (
      project: Parameters<typeof updateItem>[0],
      ctx: Parameters<typeof updateItem>[3]
    ) => updateItem(project, item.id, { animationAppearance: appearance }, ctx);
    if (settingKey)
      editor.editSetting(`${item.id}:trail:${settingKey}`, change);
    else editor.edit(change);
  }
  visibility.registerObserver(save);
  onDestroy(() => visibility.unregisterObserver(save));

  function saveTrail(settingKey: string): void {
    trailWasEdited = true;
    save(settingKey);
  }
</script>

{#if locked}
  <p>Unlock this layer to change its appearance.</p>
{:else}
  <DisplayPanel
    sequence={editor.sequence}
    visibilityManagerOverride={visibility}
    animationSettingsOverride={trailSettings}
  />
  <PathShapePanel visibilityManagerOverride={visibility} showHelp={false} />
  <div class="effort-section">
    <h3>Movement style</h3>
    <EffortPanel visibilityManagerOverride={visibility} columns={2} />
  </div>
  <div class="trail-section">
    <h3>Trails</h3>
    <PanelButton
      ariaPressed={trailEffects.activeEffect === "trails"}
      onclick={() => {
        trailEffects.setActiveEffect(
          trailEffects.activeEffect === "trails" ? "none" : "trails"
        );
        saveTrail("enabled");
      }}>Show trails</PanelButton
    >
    {#if trailEffects.activeEffect === "trails"}
      <TrailsPanel
        animationSettingsState={trailSettings}
        effectsConfigState={trailEffects}
        onSettingChange={saveTrail}
      />
    {/if}
  </div>
{/if}

<style>
  .trail-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .effort-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.82rem;
  }
</style>
