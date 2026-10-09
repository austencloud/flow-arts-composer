<!-- Stands in for CreateMethodPreview in front door tests. It reports ready
     on mount and shows the props the front door passes it. -->
<script lang="ts">
  import { onMount } from "svelte";

  let {
    methodId,
    color,
    playing = false,
    turn = 0,
    onready,
  }: {
    methodId: string;
    color: string;
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
  data-playing={String(playing)}
  data-turn={String(turn)}
></span>
