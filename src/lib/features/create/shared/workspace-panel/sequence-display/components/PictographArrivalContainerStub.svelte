<script lang="ts">
  import { onMount } from "svelte";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

  let {
    pictographData,
    motionStartData = null,
    motionProgress = null,
    arrowOpacity = 0,
    onReady = () => {},
  }: {
    pictographData: StepData;
    motionStartData?: StepData | null;
    motionProgress?: number | null;
    arrowOpacity?: number;
    onReady?: () => void;
  } = $props();

  const joinKey = (step: StepData | null) => {
    const join = (step as { conjoined?: { toward: string; steps: number } } | null)
      ?.conjoined;
    return join ? `${join.toward}${join.steps}` : undefined;
  };

  onMount(() => {
    const frame = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div
  data-testid="arrival-pictograph"
  data-step-id={pictographData.id}
  data-motion-start-id={motionStartData?.id}
  data-join={joinKey(pictographData)}
  data-motion-start-join={joinKey(motionStartData)}
  data-motion-progress={motionProgress}
  data-arrow-opacity={arrowOpacity}
></div>
