<!--
  Settings → Display: the animation section. The tab imports this file lazily,
  so the animation engine loads only when Display opens.

  The stage is the shared InlineAnimationPlayer (its own playback stack, its
  own off-screen gate, destroyed with the tab), playing the four-step A loop at
  the user's stored tempo and playback mode. It is ephemeral: it reads those
  preferences and never writes them. The switches are the animation panel's
  own DisplayPanel, bound to the same global manager the canvas reads.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import DisplayPanel from "#lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { readStoredPlaybackPreferences } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import "#lib/shared/animation-panel/bento/rail-tile.css";
  import DisplaySection from "./DisplaySection.svelte";
  import type { DisplayExample } from "./display-example-data";

  let { example }: { example: DisplayExample | null } = $props();

  // 60 BPM is the player's 1.0x.
  const stored = readStoredPlaybackPreferences();
  const bpm = stored.speed * 60;

  const animationVisibility = getAnimationVisibilityManager();

  // The Props tile pictures the pair the canvas draws: the user's own props.
  const propType = $derived(
    settingsService.settings.leftPropType ?? settingsService.settings.propType
  );
</script>

<DisplaySection
  kind="animation"
  icon="fas fa-play"
  title={t("settings_display_animation")}
  caption={t("settings_display_animation_caption")}
  onReset={() => animationVisibility.resetDisplayDefaults()}
>
  {#snippet stage()}
    {#if example}
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
    {/if}
  {/snippet}
  {#snippet controls()}
    <DisplayPanel
      showWordToggle
      showMotionVisibility={false}
      hostSized
      {propType}
    />
  {/snippet}
</DisplaySection>

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

  :global([data-display-section="animation"]) {
    --stage-ratio: 1;
    --stage-max-w: 17.5rem;
  }
</style>
