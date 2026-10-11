<!-- A stand-in for MethodPreviewPictograph. Each mount reports ready once
     while the shared budget lasts, so a test can leave later cells unreported
     the way a renderer still drawing would. A cell past the budget parks its
     report in `deferred`, so a test can finish it later. -->
<script module lang="ts">
  export const fakePictograph = {
    reportBudget: Number.POSITIVE_INFINITY,
    deferred: [] as Array<() => void>,
  };
</script>

<script lang="ts">
  import { onMount } from "svelte";

  // arrowOpacity and motionProgress default as MethodPreviewPictograph's do.
  let {
    data,
    arrowOpacity = 1,
    motionProgress = null,
    onReady,
  }: {
    data: unknown;
    arrowOpacity?: number;
    motionProgress?: number | null;
    onReady?: () => void;
  } = $props();

  onMount(() => {
    if (fakePictograph.reportBudget <= 0) {
      if (onReady) fakePictograph.deferred.push(onReady);
      return;
    }
    fakePictograph.reportBudget -= 1;
    onReady?.();
  });
</script>

<span
  class="fake-pictograph"
  data-has-data={String(data !== null)}
  data-arrow-opacity={String(arrowOpacity)}
  data-motion-progress={String(motionProgress)}
></span>
