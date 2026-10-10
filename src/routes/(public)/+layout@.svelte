<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import ToastContainer from "#lib/shared/toast/components/ToastContainer.svelte";
  import { pinLandingSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import "../../app.css";

  let { children } = $props<{
    children: Snippet;
  }>();

  // Every public page draws the product's canonical hands, blue left and red
  // right, whatever this browser saved in the app. The pages are prerendered
  // with those colors and their figures, posters and cards carry them, so a
  // saved palette would make the guide, the composer demos and the shop
  // disagree with the markup they arrived with. Pinned before any child reads
  // settings, released when the reader leaves for the app shell.
  pinLandingSettings({ primaryPropColors: null });
  onDestroy(() => pinLandingSettings(null));
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</svelte:head>

{@render children()}

<!-- The public section had no home for the shared toast owner, so anything it
     said (a copied link, a failure) was raised into an empty room. -->
<ToastContainer />
