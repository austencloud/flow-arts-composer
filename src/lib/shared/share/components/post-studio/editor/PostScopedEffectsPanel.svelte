<script lang="ts">
  import EffectsPanel from "$lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { AnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";

  let {
    effects,
    animationSettingsState,
    onSettingChange,
  }: {
    effects: EffectsConfigState;
    animationSettingsState: AnimationSettingsState;
    onSettingChange: (setting: string) => void;
  } = $props();

  setEffectsConfigContext(effects);
  let panelWidth = $state(0);
</script>

<div class="post-effects" bind:clientWidth={panelWidth}>
  <EffectsPanel
    bpm={60}
    onBpmChange={() => {}}
    isPlaying={false}
    onPlaybackToggle={() => {}}
    showPlayback={false}
    showTransport={false}
    showExportControls={false}
    showHeading={false}
    layout={panelWidth < 640 ? "strip" : "sidebar"}
    wideWorkspace={panelWidth >= 860}
    {animationSettingsState}
    onSettingChange={(setting) => onSettingChange(setting)}
  />
</div>

<style>
  .post-effects {
    width: 100%;
    min-width: 0;
  }
</style>
