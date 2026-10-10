<!--
  Embed: Spinner

  Minimal, frameless page for embedding the spinner demo in an iframe.
  The URL is outward-facing (third parties may iframe it), so it stays alive
  even though its original consumer (the old NotationShowcaseSection) is gone.
  Serves the same PlayWithItInner spinner the retired landing section used.

  No header, no footer, no navigation. Just the animation.
  Sends postMessage to parent with "ready" when loaded.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PlayWithItInner from "../../landing/components/PlayWithItInner.svelte";
  import ToastContainer from "#lib/shared/toast/components/ToastContainer.svelte";
  import AuthModalHost from "#lib/shared/auth/components/AuthModalHost.svelte";
  import { isEmbeddedInAnotherSite } from "#lib/shared/foundation/utils/embedded-in-another-site.js";

  // Opened directly, a guest who reaches the save limit gets the usual
  // sign-up window. Inside another website's frame the save entry is gone and
  // a sign-in would land in storage our own site never sees, so no window.
  let showSignUpWindow = $state(false);

  onMount(() => {
    showSignUpWindow = !isEmbeddedInAnotherSite();

    // Signal to parent iframe that embed is ready
    if (window.parent !== window) {
      window.parent.postMessage({ type: "tka-embed-ready" }, "*");
    }
  });
</script>

<svelte:head>
  <title>TKA Animation Demo</title>
  <meta name="robots" content="noindex, nofollow" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
    }
  </style>
</svelte:head>

<div class="embed-container">
  <PlayWithItInner />
</div>

<!--
  This embed has no header, footer, or app shell to carry a toast host, so
  without this, "Save sequence to Library" (reachable via right-click) could
  succeed or fail with nothing visible to the person watching the iframe.
-->
<ToastContainer />

{#if showSignUpWindow}
  <AuthModalHost />
{/if}

<style>
  .embed-container {
    width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #030308;
    padding: 16px;
    box-sizing: border-box;
  }
</style>
