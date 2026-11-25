<!-- LoopCardCell - one square of the card: the app's own pictograph, able to
     play its motion in place. Its letter shows the way the rest of the app
     shows it, except where a LOOP is first explained. -->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import type { CellVisual } from "../state/loop-card-player.svelte";

  let {
    data,
    visual = null,
    pose = false,
    letters = true,
  }: {
    data: PictographData;
    /** How the square is drawn right now; null draws it finished. */
    visual?: CellVisual | null;
    /** Only where the hands and props are, with no motion to show. */
    pose?: boolean;
    /** Off where the idea is first explained, and on copies that turn. */
    letters?: boolean;
  } = $props();

  const motionStart = $derived.by((): StartPlacementData | null => {
    if (pose || !("stepNumber" in data)) return null;
    try {
      return startPlacementDeriver.deriveFromFirstStep(data as StepData);
    } catch {
      // Without a start pose the square is simply drawn finished.
      return null;
    }
  });
</script>

<PictographContainer
  pictographData={data}
  poseOnly={pose}
  motionStartData={motionStart}
  motionProgress={motionStart ? (visual?.progress ?? null) : null}
  arrowOpacity={visual?.arrow ?? 1}
  showProps={visual?.props ?? true}
  showTKA={letters ? undefined : false}
  showTnD={false}
  showElemental={false}
  showPropTnD={false}
  showPlacements={false}
  showReversals={false}
  showHandColorKey={false}
  stepNumberOverride={false}
  disableTransitions
  animateContent
/>
