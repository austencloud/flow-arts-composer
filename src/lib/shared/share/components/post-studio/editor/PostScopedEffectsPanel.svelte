<script lang="ts">
  import EffectsPanel from "$lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { AnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";

  let {
    effects,
    animationSettingsState,
    onSettingChange,
    fill = false,
  }: {
    effects: EffectsConfigState;
    animationSettingsState: AnimationSettingsState;
    onSettingChange: (setting: string) => void;
    fill?: boolean;
  } = $props();

  setEffectsConfigContext(effects);
  let panelWidth = $state(0);
  let panelHeight = $state(0);
  const wideWorkspace = $derived(panelWidth >= 1000 && panelHeight >= 680);
</script>

<div class="post-effects" class:fill bind:clientWidth={panelWidth} bind:clientHeight={panelHeight}>
  <EffectsPanel
    bpm={60}
    onBpmChange={() => {}}
    isPlaying={false}
    onPlaybackToggle={() => {}}
    showPlayback={false}
    showTransport={false}
    showExportControls={false}
    showHeading={false}
    layout={wideWorkspace ? "sidebar" : "strip"}
    {wideWorkspace}
    {fill}
    {animationSettingsState}
    onSettingChange={(setting) => onSettingChange(setting)}
  />
</div>

<style>
  .post-effects {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .post-effects.fill {
    flex: 1 1 0;
  }
</style>
