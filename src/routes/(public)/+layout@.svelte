<script lang="ts">
  import type { Snippet } from "svelte";
  import ToastContainer from "$lib/shared/toast/components/ToastContainer.svelte";
  import "../../app.css";

  let { children } = $props<{
    children: Snippet;
  }>();
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</svelte:head>

{@render children()}

<!-- The public section had no home for the shared toast owner, so anything it
     said (a copied link, a failure) was raised into an empty room. -->
<ToastContainer />
