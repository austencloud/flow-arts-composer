<script lang="ts" module>
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

  /** One performer's pose in a tunnel cell; colors absent for red/blue. */
  export interface TunnelPose {
    data: StepData | PictographData | null | undefined;
    left?: string;
    right?: string;
  }
</script>

<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { tunnelPropNudges } from "../tunnel-prop-nudges";
  import { FRONT_PROP_COLORS } from "../tunnel-performers";

  /**
   * Every performer's pose on one grid, front first, the others on top in
   * their tunnel colors: one landing of the whole tunnel. Without the grid,
   * the poses lay over a card cell that already draws it. With `frontDrawn`
   * the card cell draws the front pose too; it is passed only so the staffs
   * drawn here slide off the front pair's. Every pose draws `propTypes`, the
   * post's prop, never the viewer's own default.
   */
  let {
    poses,
    label,
    grid = true,
    frontDrawn = false,
    propTypes,
  }: {
    poses: readonly TunnelPose[];
    label: string;
    grid?: boolean;
    frontDrawn?: boolean;
    propTypes?: { left?: string; right?: string };
  } = $props();

  // Staffs of different performers on one spot slide apart.
  const nudges = $derived(
    tunnelPropNudges(
      poses.map((pose) => ({ motions: pose.data?.motions, propTypes }))
    )
  );
</script>

<div class="composite" role="img" aria-label={label}>
  {#each poses as pose, index (index)}
    {#if pose.data && !(frontDrawn && index === 0)}
      <div class="instance" aria-hidden="true">
        <PictographContainer
          pictographData={pose.data}
          darkMode={true}
          disableTransitions={true}
          disableContentTransitions={true}
          transparentBackground={true}
          showGrid={grid && index === 0}
          showHandPoints={grid && index === 0}
          showTKA={false}
          showReversals={false}
          showNonRadialPoints={false}
          showTnD={false}
          showElemental={false}
          showPropTnD={false}
          showPlacements={false}
          showHandColorKey={false}
          stepNumberOverride={false}
          showArrow={true}
          showProps={true}
          leftPropTypeOverride={propTypes?.left as PropType | undefined}
          rightPropTypeOverride={propTypes?.right as PropType | undefined}
          leftColorOverride={pose.left ?? (index === 0 ? FRONT_PROP_COLORS.left : undefined)}
          rightColorOverride={pose.right ?? (index === 0 ? FRONT_PROP_COLORS.right : undefined)}
          propNudges={nudges[index]}
        />
      </div>
    {/if}
  {/each}
</div>

<style>
  .composite {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }
  .instance {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .instance :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
