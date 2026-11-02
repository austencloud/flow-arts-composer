<script lang="ts">
  import type { OrganizedSection } from "../../domain/option-picker-types";
  import type { LetterTypeGroupKey } from "../../services/section-title-formatter";
  import OptionViewerSwipeLayout from "./OptionViewerSwipeLayout.svelte";

  const {
    organizedPictographs,
    onSectionChange = () => {},
    onLetterTypeGroupSelected = () => {},
    width = 480,
    height = 640,
    settingsEnabled = false,
    openIntoWorkspace = false,
    topOffset = 0,
    typeRail = false,
    touchTarget = 44,
  } = $props<{
    organizedPictographs: OrganizedSection[];
    onSectionChange?: (index: number) => void;
    onLetterTypeGroupSelected?: (
      group: LetterTypeGroupKey,
      source: "selector" | "carousel"
    ) => void;
    width?: number;
    height?: number;
    settingsEnabled?: boolean;
    openIntoWorkspace?: boolean;
    topOffset?: number;
    typeRail?: boolean;
    touchTarget?: number;
  }>();
</script>

<div
  class="harness"
  style:width={`${width}px`}
  style:height={`${height}px`}
  style:margin-top={`${topOffset}px`}
  style:--min-touch-target={`${touchTarget}px`}
>
  <OptionViewerSwipeLayout
    {organizedPictographs}
    {onSectionChange}
    {onLetterTypeGroupSelected}
    {settingsEnabled}
    {openIntoWorkspace}
    {typeRail}
    phoneTier={typeRail}
  >
    {#snippet settingsContent()}
      <div class="test-settings">Settings content</div>
    {/snippet}
  </OptionViewerSwipeLayout>
</div>

<style>
  .harness {
    container-type: size;
    --theme-panel-bg: #12141c;
    --theme-card-bg: #202938;
    --theme-card-hover-bg: #2d3748;
    --theme-stroke: #8994a5;
    --theme-stroke-strong: #b8c0cc;
    --theme-text: #ffffff;
    --theme-text-dim: #e2e8f0;
    --theme-accent: #22b8db;
  }

  .test-settings {
    padding: 1rem;
    color: var(--theme-text);
  }
</style>
