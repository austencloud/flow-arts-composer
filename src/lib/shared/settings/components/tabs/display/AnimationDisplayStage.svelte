<!--
  Settings → Display: the animation stage. The shared InlineAnimationPlayer
  (its own playback stack, its own off-screen gate, destroyed with its host)
  playing the four-step A loop at the user's stored tempo and playback mode.
  It is ephemeral: it reads those preferences and never writes them, and the
  canvas reads the same global display switches as every other player.

  The section's stage and the tab's drill-down box thumbnail both mount it,
  so the thumbnail is the section's stage drawn small. The tab imports it
  lazily, like the section, since it carries the animation engine.
-->
<script lang="ts">
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { readStoredPlaybackPreferences } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import type { DisplayExample } from "./display-example-data";

  let { example }: { example: DisplayExample } = $props();

  // 60 BPM is the player's 1.0x.
  const stored = readStoredPlaybackPreferences();
  const bpm = stored.speed * 60;
</script>

<div class="animation-stage">
  <InlineAnimationPlayer
    sequence={example.sequence}
    chrome="minimal"
    ephemeral
    externalBpm={bpm}
    externalPlaybackMode={stored.playbackMode}
    autoPlayDelay={0}
    fill
    showWordHeader
    scrubbable
  />
</div>

<style>
  .animation-stage {
    width: 100%;
    height: 100%;
    display: flex;
  }

  .animation-stage > :global(*) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
</style>
