<!-- Stands in for CreateMethodPreview in front door tests. It reports ready
     on mount, unless its method is held back, and shows the props the front
     door passes it. -->
<script lang="ts" module>
  /** Methods whose stand-in never reports ready: a scene that hangs. */
  export const heldBack = new Set<string>();
</script>

<script lang="ts">
  import { onMount } from "svelte";

  let {
    methodId,
    color,
    revealed = true,
    instant = false,
    playing = false,
    turn = 0,
    onready,
  }: {
    methodId: string;
    color: string;
    revealed?: boolean;
    instant?: boolean;
    playing?: boolean;
    turn?: number;
    onready?: (methodId: string) => void;
  } = $props();

  onMount(() => {
    if (heldBack.has(methodId)) return;
    onready?.(methodId);
  });
</script>

<span
  class="fake-preview"
  data-method={methodId}
  data-color={color}
  data-revealed={String(revealed)}
  data-instant={String(instant)}
  data-playing={String(playing)}
  data-turn={String(turn)}
></span>
