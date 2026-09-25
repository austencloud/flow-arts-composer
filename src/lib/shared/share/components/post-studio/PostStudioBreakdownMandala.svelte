<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { MandalaPathPreparer } from "$lib/shared/mandala/services/mandala-path-preparer";
  import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";

  let {
    sequence,
    sequencePosition,
    leftPropType,
    rightPropType,
  }: {
    sequence: SequenceData;
    sequencePosition: number;
    leftPropType?: PropType;
    rightPropType?: PropType;
  } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let clientWidth = $state(0);
  let clientHeight = $state(0);
  const preparer = new MandalaPathPreparer();

  // Both the small strip and the enlarged detail use the same sequence clock.
  // Drawing only when that clock or the box changes avoids a second animation
  // engine and avoids reading pixels back from its WebGL surfaces every frame.
  $effect(() => {
    if (!canvas || clientWidth <= 0 || clientHeight <= 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(clientWidth * dpr));
    const height = Math.max(1, Math.round(clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#08080c";
    context.fillRect(0, 0, width, height);

    const prepared = preparer.prepare(
      sequence.steps,
      Math.min(clientWidth, clientHeight),
      {
        show: "both",
        leftPropType,
        rightPropType,
        trackingMode: DEFAULT_TRAIL_SETTINGS.trackingMode,
        leftColor: DEFAULT_TRAIL_SETTINGS.leftColor,
        rightColor: DEFAULT_TRAIL_SETTINGS.rightColor,
      }
    );
    if (!prepared) return;

    const progress = Math.max(
      0,
      Math.min(1, sequencePosition / Math.max(1, sequence.steps.length))
    );
    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      (clientWidth * dpr) / 2,
      (clientHeight * dpr) / 2
    );
    context.scale(prepared.scale, prepared.scale);
    context.lineWidth = 2.5 / prepared.scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const path of prepared.paths) {
      // The complete path gives the mandala its shape; its bright leading
      // portion records the trail already travelled in this repetition.
      context.strokeStyle = path.color;
      context.globalAlpha = 0.25;
      context.setLineDash([]);
      context.stroke(path.path2d);
      context.globalAlpha = 1;
      context.setLineDash([path.totalLength * progress, path.totalLength]);
      context.stroke(path.path2d);
    }
    context.setLineDash([]);
    context.globalAlpha = 1;
  });
</script>

<canvas
  class="breakdown-mandala"
  bind:this={canvas}
  bind:clientWidth
  bind:clientHeight
  data-studio-breakdown-mandala
  aria-hidden="true"
></canvas>

<style>
  .breakdown-mandala {
    display: block;
    width: 100%;
    height: 100%;
    background: #08080c;
  }
</style>
