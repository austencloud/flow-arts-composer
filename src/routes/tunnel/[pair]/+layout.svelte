<script lang="ts">
  /**
   * A tunnel page sits on the same themed background as a sequence page.
   */
  import type { Snippet } from "svelte";
  import SequenceRouteLayout from "../../sequence/[id]/+layout.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<SequenceRouteLayout>
  {@render children()}
</SequenceRouteLayout>
