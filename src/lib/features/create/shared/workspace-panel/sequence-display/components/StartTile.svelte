<!-- StartTile.svelte - Reusable start position tile for all grid modes -->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import StepCell from "./StepCell.svelte";

  let {
    startPosition,
    shouldAnimate = false,
    isSelected = false,
    isPracticeStep = false,
    activeMode = null,
    onStartClick,
    onLongPress,
    onDelete,
    animationEpoch = 0,
    isTimelineMode = false,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    onContentReady = undefined,
  } = $props<{
    startPosition: StartPositionData | StepData;
    shouldAnimate?: boolean;
    isSelected?: boolean;
    isPracticeStep?: boolean;
    activeMode?: BuildModeId | null;
    onStartClick?: () => void;
    onLongPress?: (stepNumber: number) => void;
    onDelete?: (stepNumber: number) => void;
    animationEpoch?: number;
    isTimelineMode?: boolean;
    /** Prop type overrides for demo/preview rendering (bypasses global
     *  settings) — same convention as StepCell/PictographContainer. */
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    leftColorOverride?: string;
    rightColorOverride?: string;
    /** Forwarded from the inner cell — see StepCell's onContentReady. */
    onContentReady?: () => void;
  }>();

  const hapticService: HapticFeedback | null = getHapticFeedback();

  function handleStartClick() {
    hapticService?.trigger("selection");
    onStartClick?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleStartClick();
    } else if (e.key === " ") {
      // Prevent browser default click, let global shortcuts handle Space
      e.preventDefault();
    }
  }
</script>

<div
  class="start-tile"
  class:has-pictograph={true}
  title="Start Position"
  role="button"
  tabindex="0"
  onclick={handleStartClick}
  onkeydown={handleKeydown}
  aria-label="Start Position"
>
  <StepCell
    step={startPosition}
    index={-1}
    transitionKey="start-position"
    {shouldAnimate}
    {isSelected}
    {isPracticeStep}
    {activeMode}
    {onLongPress}
    onDelete={() => onDelete?.(0)}
    {isTimelineMode}
    {animationEpoch}
    {leftPropTypeOverride}
    {rightPropTypeOverride}
    {leftColorOverride}
    {rightColorOverride}
    {onContentReady}
  />
</div>

<style>
  .start-tile {
    margin: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
