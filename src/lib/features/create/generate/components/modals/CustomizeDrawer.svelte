<!--
  CustomizeDrawer.svelte - Customize overlay drawer
  Desktop: right-side panel matching other create module drawers.
  Mobile: full-screen bottom sheet covering entire viewport including bottom nav.
  Follows DurationRhythmSheet pattern: portal + Drawer always in DOM.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import CustomizeExpandedOverlay from "../cards/CustomizeExpandedOverlay.svelte";
  import type { CustomizeOverlayProps } from "../../../shared/state/panel-coordination-state.svelte";
  import GenerationSettingsDrawer from "./GenerationSettingsDrawer.svelte";

  let {
    isOpen,
    overlayProps,
    onClose,
  }: {
    isOpen: boolean;
    overlayProps: CustomizeOverlayProps | null;
    onClose: () => void;
  } = $props();
</script>

<GenerationSettingsDrawer
  {isOpen}
  ariaLabel={t("create_deep_customize_generation_aria")}
  {onClose}
>
  {#snippet children()}
    {#if overlayProps}
      <CustomizeExpandedOverlay
        constraintPreset={overlayProps.constraintPreset}
        handPathMode={overlayProps.handPathMode}
        motionTypeFilter={overlayProps.motionTypeFilter}
        startEndOptions={overlayProps.startEndOptions}
        level={overlayProps.level}
        gridMode={overlayProps.gridMode}
        isFreeformMode={overlayProps.isFreeformMode}
        styleBaseline={overlayProps.styleBaseline}
        onConstraintPresetChange={overlayProps.onConstraintPresetChange}
        onHandPathModeChange={overlayProps.onHandPathModeChange}
        onMotionTypeFilterChange={overlayProps.onMotionTypeFilterChange}
        onStartEndChange={overlayProps.onStartEndChange}
        onResetAll={overlayProps.onResetAll}
        {onClose}
      />
    {/if}
  {/snippet}
</GenerationSettingsDrawer>
