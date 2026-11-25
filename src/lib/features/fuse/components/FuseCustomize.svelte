<!--
  Everything about how the combined preview looks, with the pages the Shape
  Engine's Customize has: Effects, Motion and Display. It is the shared
  AnimationPanel, reading the effects state FuseLayout puts in context and the
  Fuse canvas's own display choices. Its effect and motion changes are the same
  ones Construct and the viewer see; what Display turns on or off is Fuse's.
  It holds the side column on a wide screen, beside the result it changes.
  Where that column does not fit, FuseCustomizeDock holds the same panel under
  the result.
-->
<script lang="ts">
  import GenerationSettingsOverlay from "#lib/features/create/generate/components/cards/GenerationSettingsOverlay.svelte";
  import AnimationPanel from "#lib/shared/animation-panel/components/AnimationPanel.svelte";
  import { setAnimationVisibilityContext } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getFuseContext } from "../context/fuse-context";
  import { getFuseDisplay } from "../state/fuse-display";
  import { fuseRecipePanel } from "../state/fuse-recipe-panel.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const { state: fuseState } = getFuseContext();
  const settings = getSettings();
  setAnimationVisibilityContext(getFuseDisplay());
</script>

<GenerationSettingsOverlay
  title={t("shape_engine_customize")}
  titleId="fuse-customize-title"
  closeLabel={t("shape_engine_customize_workspace_close")}
  entrance="none"
  {onClose}
>
  {#snippet children()}
    <div class="customize-body">
      <AnimationPanel
        isExporting={false}
        layout="sidebar"
        navigation="tabs"
        fillPages
        controlledSection={fuseRecipePanel.section}
        onActiveSectionChange={(section) => {
          if (section) fuseRecipePanel.section = section;
        }}
        isPlaying={fuseState.clockRunning}
        bpm={fuseState.bpm}
        onPlaybackToggle={() => fuseState.toggleClock()}
        onBpmChange={(value) => fuseState.setBpm(value)}
        showTempoControls={false}
        showEffectsPlayback={false}
        showPathShape={false}
        showWordToggle={false}
        showProgressToggle={false}
        selectedPropType={settings.leftPropType}
        sequence={fuseState.previewSequence}
        regionLabel={t("shape_engine_customize_aria")}
      />
    </div>
  {/snippet}
</GenerationSettingsOverlay>

<style>
  .customize-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    /* The panel insets its tabs and pages by 14-16px, and the column already
       has: the tabs sit under the title, edge to edge with it. */
    margin-inline: -14px;
  }

  .customize-body > :global(*) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* The panel's own frame is for a host that has none; the column is one. */
  .customize-body :global(.animator-inspector) {
    border-left: 0;
    background: transparent;
  }

  .customize-body :global(.panel-center-inner) {
    margin-block: 0 auto;
  }

  /* The pages fill the column, so no scrollbar needs its room kept; keeping it
     set every page 10px left of the tabs above. */
  .customize-body :global(.panel-transition) {
    scrollbar-gutter: auto;
  }
</style>
