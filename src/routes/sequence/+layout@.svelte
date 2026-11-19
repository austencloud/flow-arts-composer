<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../app.css";
  import ServiceOutageNotice from "#lib/shared/offline/components/ServiceOutageNotice.svelte";

  let { children } = $props<{
    children: Snippet;
  }>();
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</svelte:head>

{@render children()}

<!-- Shows only while Google has the Firebase project switched off. -->
<ServiceOutageNotice placement="overlay" />
