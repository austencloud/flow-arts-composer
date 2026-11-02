<script lang="ts">
  import type { OrganizedSection } from "../../domain/option-picker-types";
  import type { LetterTypeGroupKey } from "../../services/section-title-formatter";
  import OptionViewerSwipeLayout from "./OptionViewerSwipeLayout.svelte";
  import OptionPickerHeader from "../../components/OptionPickerHeader.svelte";
  import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { TurnLevel } from "#lib/shared/create/services/level-turn-values.js";

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
    settingsLevel,
    hiddenCount = 0,
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
    /** Renders the real compact settings at this level instead of a stub. */
    settingsLevel?: TurnLevel;
    /** Options the Continuous filter hides, shown under its label. */
    hiddenCount?: number;
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
    settingsHasTurnRows={settingsLevel === undefined || settingsLevel > 1}
  >
    {#snippet settingsContent()}
      {#if settingsLevel}
        <OptionPickerHeader
          layout="compact"
          showFilter={true}
          isContinuousOnly={false}
          optionAvailability={{ shownCount: 16, hiddenCount }}
          level={settingsLevel}
          onLevelChange={() => {}}
          leftTurns={0}
          rightTurns={0}
          leftRotation={RotationDirection.CLOCKWISE}
          rightRotation={RotationDirection.CLOCKWISE}
          onLeftChange={() => {}}
          onRightChange={() => {}}
          onLeftRotationChange={() => {}}
          onRightRotationChange={() => {}}
        />
      {:else}
        <div class="test-settings">Settings content</div>
      {/if}
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

  /* The app's reset (src/app.css), so measured trays match the app's. */
  :global(*),
  :global(*::before),
  :global(*::after) {
    box-sizing: border-box;
  }

  .test-settings {
    padding: 1rem;
    color: var(--theme-text);
  }
</style>
