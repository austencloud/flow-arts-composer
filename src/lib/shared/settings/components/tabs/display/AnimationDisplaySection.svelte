<!--
  Settings → Display: the animation section. The tab imports this file lazily,
  so the animation engine loads only when Display opens.

  The stage is AnimationDisplayStage (the shared InlineAnimationPlayer on the
  four-step A loop). The switches are the animation panel's own DisplayPanel,
  bound to the same global manager the canvas reads: picture tiles in the
  columns tier, small chips on a drill-down screen (`compact`).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import DisplayPanel from "#lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import "#lib/shared/animation-panel/bento/rail-tile.css";
  import DisplaySection from "./DisplaySection.svelte";
  import AnimationDisplayStage from "./AnimationDisplayStage.svelte";
  import type { DisplayExample } from "./display-example-data";

  let {
    example,
    onBack,
    compact = false,
    cell = false,
  }: {
    example: DisplayExample | null;
    onBack?: () => void;
    /** Chips instead of picture tiles (the tab's drill-down tier). */
    compact?: boolean;
    /** A cell of the tab's wide tier (DisplaySection `cell`). */
    cell?: boolean;
  } = $props();

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
  {onBack}
  {cell}
>
  {#snippet stage()}
    {#if example}
      <AnimationDisplayStage {example} />
    {/if}
  {/snippet}
  {#snippet controls()}
    <DisplayPanel
      showWordToggle
      showHeaderParts
      showMotionVisibility={false}
      hostSized
      chips={compact}
      {propType}
    />
  {/snippet}
</DisplaySection>

<style>
  :global([data-display-section="animation"]) {
    --stage-ratio: 1;
    --stage-max-w: 17.5rem;
  }
</style>
