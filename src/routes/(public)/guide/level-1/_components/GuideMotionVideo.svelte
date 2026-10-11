<script lang="ts">
  // A guide motion demo. On screen: the pre-baked looping video. On paper (print,
  // or inside a `.guide-print-mode` ancestor): a static pictograph rendered live
  // from the same config - the arrow shows direction, the hand shows the end
  // position, exactly like the original printed guide. Video assets are generated
  // by /test/guide-motion-bake; pictograph data comes from guide-motion-configs.
  import GuidePictograph from "./GuidePictograph.svelte";
  import { getMotionPictographData } from "./guide-motion-configs";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let { id, label }: { id: string; label: string } = $props();

  const pictograph = getMotionPictographData(id);
</script>

<div class="guide-motion">
  <video
    class="gm-video"
    src={`/guide/level-1/motions/${id}.mp4`}
    autoplay
    loop
    muted
    playsinline
    preload="metadata"
    aria-label={label}
  ></video>

  {#if pictograph}
    <div class="gm-print">
      <GuidePictograph
        data={pictograph}
        size="md"
        propType={PropType.HAND}
        showArrows
        printMode
        eager
        {label}
      />
    </div>
  {/if}
</div>

<style>
  .guide-motion {
    width: 100%;
  }

  .gm-video {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
  }

  /* Static pictograph is print-only by default. */
  .gm-print {
    display: none;
  }

  @media print {
    .gm-video {
      display: none;
    }
    .gm-print {
      display: block;
    }
  }

  /* The /print route forces the paper view on screen for preview. */
  :global(.guide-print-mode) .gm-video {
    display: none;
  }
  :global(.guide-print-mode) .gm-print {
    display: block;
  }
</style>
