<script lang="ts">
  /**
   * MethodPreviewPictograph
   *
   * One pictograph in a Create method preview, drawn by the real
   * PictographContainer with every glyph, label, and step number off, so a
   * small cell shows the grid, props, and arrows only. Transitions are off:
   * a scene moves its cells itself and must never wait on a fade. The grid,
   * prop artwork, and colors follow the user's settings, as everywhere else.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let {
    data,
    visibleHand = null,
    motionStartData = null,
    motionStep = null,
    motionProgress = null,
    arrowOpacity = 1,
    readyEpoch = 0,
    onReady,
  }: {
    data: StepData | PictographData | null;
    /** One hand only, the way Fuse shows its inputs. */
    visibleHand?: HandSide | null;
    /** In-place travel from this pose (Fuse's playback). */
    motionStartData?: PictographData | null;
    motionStep?: StepData | null;
    /** 0 to 1. Null draws the finished pictograph. */
    motionProgress?: number | null;
    /** Arrows fade in with the travel, as on Fuse's own cards. */
    arrowOpacity?: number;
    /**
     * Bump to hear onReady again for the same data. A Generate reroll can
     * leave a cell's step unchanged; a new epoch still reports it ready.
     */
    readyEpoch?: number;
    /** Fires when this data's picture has rendered, once per epoch. */
    onReady?: () => void;
  } = $props();
</script>

<PictographContainer
  pictographData={data}
  disableTransitions
  disableContentTransitions
  showTKA={false}
  showReversals={false}
  showNonRadialPoints={false}
  showHandPoints={false}
  showTnD={false}
  showElemental={false}
  showPropTnD={false}
  showPlacements={false}
  showHandColorKey={false}
  stepNumberOverride={false}
  {visibleHand}
  {motionStartData}
  {motionStep}
  {motionProgress}
  {arrowOpacity}
  {readyEpoch}
  {onReady}
/>
