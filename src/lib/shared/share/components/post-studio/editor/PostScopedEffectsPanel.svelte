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
</script>

<EffectsPanel
  bpm={60}
  onBpmChange={() => {}}
  isPlaying={false}
  onPlaybackToggle={() => {}}
  showPlayback={false}
  showTransport={false}
  showExportControls={false}
  showHeading={false}
  layout="strip"
  {fill}
  {animationSettingsState}
  onSettingChange={(setting) => onSettingChange(setting)}
/>
