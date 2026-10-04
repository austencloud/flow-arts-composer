<!-- Renders its children and nothing else. Stands in for layout wrappers whose
     transitions jsdom cannot run. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children?: Snippet } = $props();
</script>

{@render children?.()}
