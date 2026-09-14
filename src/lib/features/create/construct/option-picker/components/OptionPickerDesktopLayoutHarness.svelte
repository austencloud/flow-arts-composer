<!-- Gives responsive layout tests explicit picker dimensions and workspace mode. -->
<script lang="ts">
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { TurnLevel } from "$lib/shared/create/services/level-turn-values";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import OptionPickerContent from "./OptionPickerContent.svelte";

  const {
    width = 900,
    height = 700,
    sideBySide = true,
    topOffset = 0,
    level = 2,
    continuous = false,
    sequenceLength = 0,
    leftTurns = 0,
    rightTurns = 0,
    shownCount = 0,
    hiddenCount = 0,
    settledWidth = undefined,
    settleMs = 450,
    sectionTitles = [],
  } = $props<{
    width?: number;
    height?: number;
    sideBySide?: boolean;
    topOffset?: number;
    level?: TurnLevel;
    continuous?: boolean;
    sequenceLength?: number;
    leftTurns?: number;
    rightTurns?: number;
    shownCount?: number;
    hiddenCount?: number;
    /** Width the box eases to, standing in for the workspace expansion. */
    settledWidth?: number;
    settleMs?: number;
    sectionTitles?: string[];
  }>();

  const harnessOptions = $derived(
    sectionTitles.length > 0 ? ([{}] as PictographData[]) : []
  );

  const currentSequence = $derived(
    Array.from({ length: sequenceLength }, () => ({}) as PictographData)
  );

  // Reproduces the real mount condition: StandardWorkspaceLayout is already
  // easing its grid columns when the picker appears, so the box the picker
  // measures on its first frame is not the box it will live in.
  let harnessElement: HTMLDivElement | null = $state(null);
  $effect(() => {
    if (settledWidth === undefined || !harnessElement) return;
    const animation = harnessElement.animate(
      [{ width: `${width}px` }, { width: `${settledWidth}px` }],
      {
        duration: settleMs,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
      }
    );
    return () => animation.cancel();
  });
</script>

<div
  bind:this={harnessElement}
  class="harness"
  style:width={`${width}px`}
  style:height={`${height}px`}
  style:margin-top={`${topOffset}px`}
>
  <OptionPickerContent
    options={harnessOptions as never[]}
    organizerService={() =>
      sectionTitles.map((title) => ({ title, pictographs: [] }))}
    sizerService={() => ({
      pictographSize: 80,
      pictographSizeString: "80px",
      gridGap: "8px",
      deviceConfig: {
        padding: { horizontal: 8, vertical: 8 },
        gap: 8,
        minItemSize: 60,
        maxItemSize: 120,
        scaleFactor: 1,
      },
    })}
    onSelect={() => {}}
    isContinuousOnly={continuous}
    optionAvailability={{ shownCount, hiddenCount }}
    isSideBySideLayout={() => sideBySide}
    {currentSequence}
    {leftTurns}
    {rightTurns}
    {level}
    onLevelChange={() => {}}
    leftRotation={RotationDirection.CLOCKWISE}
    rightRotation={RotationDirection.CLOCKWISE}
    onLeftTurnsChange={() => {}}
    onRightTurnsChange={() => {}}
    onLeftRotationChange={() => {}}
    onRightRotationChange={() => {}}
  />
</div>

<style>
  .harness {
    --min-touch-target: 44px;
    --theme-panel-bg: #ffffff;
    --theme-card-bg: #f3f4f6;
    --theme-card-hover-bg: #e5e7eb;
    --theme-stroke: #9ca3af;
    --theme-stroke-strong: #6b7280;
    --theme-text: #111827;
    --theme-text-dim: #4b5563;
    --theme-accent: #6d28d9;
  }
</style>
