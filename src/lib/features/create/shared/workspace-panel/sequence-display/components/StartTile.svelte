<!-- StartTile.svelte - Reusable start placement tile for all grid modes -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
  import type { BuildModeId } from "#lib/shared/foundation/ui/ui-types.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
  import StepCell from "./StepCell.svelte";

  let {
    startPlacement,
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
    fanAppearanceOverride = undefined,
    propLookOverride = undefined,
    leftBuugengFlippedOverride = undefined,
    rightBuugengFlippedOverride = undefined,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    onContentReady = undefined,
  } = $props<{
    startPlacement: StartPlacementData | StepData;
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
    fanAppearanceOverride?: FanAppearance;
    propLookOverride?: PropLook;
    leftBuugengFlippedOverride?: boolean;
    rightBuugengFlippedOverride?: boolean;
    leftColorOverride?: string;
    rightColorOverride?: string;
    /** Forwarded from the inner cell — see StepCell's onContentReady. */
    onContentReady?: () => void;
  }>();
</script>

<!-- The cell is the control. StepCell already renders role="button" with the
     start-placement label, handles Enter and gives the selection haptic, so a
     second button wrapped around it was one control nested in another and two
     Tab stops for one tile. -->
<div
  class="start-tile"
  class:has-pictograph={true}
  title={t("browse_start_placement")}
>
  <StepCell
    step={startPlacement}
    index={-1}
    transitionKey="start-placement"
    onClick={() => onStartClick?.()}
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
    {fanAppearanceOverride}
    {propLookOverride}
    {leftBuugengFlippedOverride}
    {rightBuugengFlippedOverride}
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
