<!-- A stand-in for MethodPreviewPictograph. Each mount reports ready once
     while the shared budget lasts, so a test can leave later cells unreported
     the way a renderer still drawing would. -->
<script module lang="ts">
  export const fakePictograph = { reportBudget: Number.POSITIVE_INFINITY };
</script>

<script lang="ts">
  import { onMount } from "svelte";

  let { data, onReady }: { data: unknown; onReady?: () => void } = $props();

  onMount(() => {
    if (fakePictograph.reportBudget <= 0) return;
    fakePictograph.reportBudget -= 1;
    onReady?.();
  });
</script>

<span class="fake-pictograph" data-has-data={String(data !== null)}></span>
