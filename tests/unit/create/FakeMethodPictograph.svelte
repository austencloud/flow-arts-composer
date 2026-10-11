<!-- A stand-in for MethodPreviewPictograph. Each mount reports ready once,
     and again for each new readyEpoch, while the shared budget lasts, so a
     test can leave later cells unreported the way a renderer still drawing
     would. A cell past the budget parks its report in `deferred`, so a test
     can finish it later. -->
<script module lang="ts">
  export const fakePictograph = {
    reportBudget: Number.POSITIVE_INFINITY,
    deferred: [] as Array<() => void>,
  };
</script>

<script lang="ts">
  import { untrack } from "svelte";

  // arrowOpacity and motionProgress default as MethodPreviewPictograph's do.
  let {
    data,
    arrowOpacity = 1,
    motionStartData = null,
    motionProgress = null,
    readyEpoch = 0,
    onReady,
  }: {
    data: unknown;
    arrowOpacity?: number;
    motionStartData?: { letter?: string | null } | null;
    motionProgress?: number | null;
    readyEpoch?: number;
    onReady?: () => void;
  } = $props();

  function report(): void {
    if (fakePictograph.reportBudget <= 0) {
      if (onReady) fakePictograph.deferred.push(onReady);
      return;
    }
    fakePictograph.reportBudget -= 1;
    onReady?.();
  }

  $effect(() => {
    void readyEpoch;
    untrack(report);
  });
</script>

<span
  class="fake-pictograph"
  data-has-data={String(data !== null)}
  data-arrow-opacity={String(arrowOpacity)}
  data-motion-start={String(motionStartData?.letter ?? null)}
  data-motion-progress={String(motionProgress)}
></span>
