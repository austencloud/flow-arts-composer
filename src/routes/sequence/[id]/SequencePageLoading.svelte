<script lang="ts">
  /**
   * The sequence page's loading screen: the app's loading capsule, the one
   * the boot screen shows, centred over the page's background. The route's
   * placeholder and the viewer page both render it on the same session, so
   * the swap between them is invisible.
   */
  import LoadingCapsule from "#lib/shared/components/loading/LoadingCapsule.svelte";
  import type { LoadingSession } from "#lib/shared/loading/loading-session.svelte.js";

  let { session }: { session: LoadingSession } = $props();

  // The boot screen's choice: a light capsule over a bright background.
  const tone =
    typeof document !== "undefined" &&
    document.documentElement.dataset.themeLuminance === "bright"
      ? "light"
      : "dark";
</script>

<div class="sequence-page-loading">
  <LoadingCapsule {session} label="Loading sequence" {tone} />
</div>

<style>
  .sequence-page-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
  }
</style>
