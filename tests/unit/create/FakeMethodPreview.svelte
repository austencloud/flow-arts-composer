<!-- Stands in for CreateMethodPreview in front door tests. It reports ready
     on mount and shows the props the front door passes it. -->
<script lang="ts">
  import { onMount } from "svelte";

  let {
    methodId,
    color,
    revealed = true,
    playing = false,
    turn = 0,
    onready,
  }: {
    methodId: string;
    color: string;
    revealed?: boolean;
    playing?: boolean;
    turn?: number;
    onready?: (methodId: string) => void;
  } = $props();

  onMount(() => {
    onready?.(methodId);
  });
</script>

<span
  class="fake-preview"
  data-method={methodId}
  data-color={color}
  data-revealed={String(revealed)}
  data-playing={String(playing)}
  data-turn={String(turn)}
></span>
