<script lang="ts">
  /**
   * The whole trace of the page's example in one path kind, drawn by the app's
   * own mandala (the picture on the explorer's path tiles). A still: it is the
   * finished path. It reads the screen's scale (--fit) for its size.
   */
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { applySequencePathPreview } from "#lib/shared/sequence-viewer/services/sequence-path-policy.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
  import { motionPathExamples } from "../_data/motion-path-examples";

  let {
    kind,
    example = 2,
    label,
    size = 160,
  }: {
    kind: MandalaPathShape;
    example?: number;
    /** What a screen reader hears for the figure. */
    label: string;
    /** The size at the screen's designed scale; --fit grows or shrinks it. */
    size?: number;
  } = $props();

  const sequence = $derived(
    applySequencePathPreview(motionPathExamples[example]!, {
      pathShape: kind === "hybrid" ? "arc" : kind,
      motionAwarePaths: kind === "hybrid",
    })!
  );
  let width = $state(0);
</script>

<div
  class="path-mandala"
  role="img"
  aria-label={label}
  style:--mandala={`${size}px`}
  bind:clientWidth={width}
>
  {#if width > 0}
    <SequenceMandala
      {sequence}
      pathShape={kind}
      show="both"
      size={width}
      mode="gallery"
      darkMode
      leftPropType={PropType.STAFF}
      rightPropType={PropType.STAFF}
      tipEnds={1}
      tipDx={0}
      animate={false}
    />
  {/if}
</div>

<style>
  .path-mandala {
    flex: none;
    inline-size: min(calc(var(--mandala) * var(--fit, 1)), 100%);
    aspect-ratio: 1;
    margin-inline: auto;
  }
</style>
