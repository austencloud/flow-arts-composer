<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";
  let { children } = $props<{ children: Snippet }>();
  // The lab draws its own boot screen; the real one would cover it, and its
  // Overture would keep tracing unseen until the boot's 15 s safety net.
  // Aborted, not finished, so this moment is not learned as a boot length.
  $effect(() => {
    (window as { __tkaOverture?: (type: string) => void }).__tkaOverture?.(
      "abort"
    );
    document.getElementById("app-loading")?.remove();
  });
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
{@render children()}
