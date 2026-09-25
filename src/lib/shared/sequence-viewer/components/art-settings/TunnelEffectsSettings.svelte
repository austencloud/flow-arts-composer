<script lang="ts">
  import EffectsPanel from "$lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import { reportArtSetting } from "./art-setting-change";
  import type { ArtSettingChangeHandler } from "./art-settings-types";
  import type { AnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";

  interface Props {
    dense: boolean;
    bpm: number;
    isPlaying: boolean;
    onBpmChange: (bpm: number) => void;
    onPlaybackToggle: () => void;
    onArtSettingChange?: ArtSettingChangeHandler;
    animationSettingsState: AnimationSettingsState;
  }

  let {
    dense,
    bpm,
    isPlaying,
    onBpmChange,
    onPlaybackToggle,
    onArtSettingChange,
    animationSettingsState,
  }: Props = $props();
</script>

<!-- Effects is intentionally the same component and the same first pixel in
     both Animator modes. Tunnel-only appearance belongs to Formation. -->
<EffectsPanel
  layout={dense ? "strip" : "sidebar"}
  fill={!dense}
  showPlayback={false}
  {bpm}
  {onBpmChange}
  {isPlaying}
  {onPlaybackToggle}
  {animationSettingsState}
  onSettingChange={(setting, previousValue, value, coalesce) =>
    reportArtSetting(
      onArtSettingChange,
      "art_effects",
      setting,
      previousValue,
      value,
      coalesce
    )}
/>
