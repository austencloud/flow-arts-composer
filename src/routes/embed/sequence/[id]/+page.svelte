<!--
  /embed/sequence/[id] — the page a third-party site puts in an <iframe>.

  Reuses SequenceViewerPage.svelte (the exact same body /sequence/[id] renders)
  rather than a parallel player: SequenceViewerPage already resolves a code,
  loads its data, and renders SequenceViewerOrchestrator + SequenceViewerShell.
  It detects this route (`page.route.id` starts with "/embed/sequence") and
  passes `embedded={true}` to the shell for the same chrome-trim the demo
  phone widget already uses (`?demo=1`) — no Close, no account entry, no
  Share menu: nothing in a stranger's iframe has anywhere useful to go.

  Loaded behind a browser-gated dynamic import so SSR only ever emits this
  thin head shell, matching the sibling route's SSR boundary.
-->
<script lang="ts">
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import type { PageData } from "./$types";
  import { pageBootsInto3D } from "#lib/shared/sequence-viewer/services/viewer-boot-3d.js";
  import { preloadViewer3DCode } from "#lib/shared/3d/scene-boot/viewer-3d-code-prefetch.js";

  let { data }: { data: PageData } = $props();

  const routeId = $derived(page.params.id);
  // Same early 3D code start as /sequence/[id] (viewer-3d-code-prefetch.ts).
  if (browser && pageBootsInto3D()) preloadViewer3DCode();
</script>

<svelte:head>
  <title>{data.title}</title>
  <meta name="robots" content="noindex" />
  <link rel="canonical" href={data.canonicalUrl} />
</svelte:head>

{#if browser}
  {#await import("../../../sequence/[id]/SequenceViewerPage.svelte") then { default: SequenceViewerPage }}
    {#key routeId}
      <SequenceViewerPage {data} />
    {/key}
  {/await}
{/if}
