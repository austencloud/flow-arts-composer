<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import LoadingGate from "$lib/shared/components/loading/LoadingGate.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  let { data } = $props();

  const isSolo = $derived(data.meta?.payloadKind === "solo");
  const displayWord = $derived(
    data.meta?.word
      ? isSolo
        ? data.meta.word
        : simplifyRepeatedWord(data.meta.word)
      : null
  );

  const title = $derived(
    displayWord
      ? isSolo
        ? `${displayWord}: Solo Flow Choreography | Flow Arts Composer`
        : `${displayWord}: Flow Arts Sequence | Flow Arts Composer`
      : "Scanned Sequence | Flow Arts Composer"
  );
  const description = $derived(
    displayWord
      ? isSolo
        ? `${displayWord}${data.meta?.creator ? `, submitted by ${data.meta.creator}` : ""}. Watch and practice this one-hand flow choreography.`
        : `"${displayWord}"${data.meta?.creator ? `, submitted by ${data.meta.creator}` : ""}${data.meta?.deckName ? ` from the ${data.meta.deckName} deck` : ""}. Watch, practice, and remix this flow arts choreography sequence.`
      : "Watch and practice a flow arts choreography sequence."
  );
  const canonical = $derived(
    `https://tkaflowarts.com/sequence/${encodeURIComponent(page.params.code)}`
  );

  let QScanPageComponent: typeof import("./QScanPage.svelte").default | null =
    $state(null);
  let viewerReady = $state(false);
  let loadingRetired = $state(false);
  let viewerLoadPromise: Promise<void> | null = null;
  let loadingRetireTimer: ReturnType<typeof setTimeout> | null = null;

  function loadViewer(): Promise<void> {
    if (viewerLoadPromise) return viewerLoadPromise;
    viewerLoadPromise = import("./QScanPage.svelte").then(
      ({ default: component }) => {
        QScanPageComponent = component;
      }
    );
    return viewerLoadPromise;
  }

  function handleViewerReady(): void {
    if (viewerReady) return;
    viewerReady = true;
    loadingRetireTimer = setTimeout(() => {
      loadingRetired = true;
      loadingRetireTimer = null;
    }, 220);
  }

  onMount(() => {
    void loadViewer();
    return () => {
      if (loadingRetireTimer !== null) clearTimeout(loadingRetireTimer);
    };
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Flow Arts Composer" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  {#if data.meta?.thumbnailUrl}
    <meta property="og:image" content={data.meta.thumbnailUrl} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={data.meta.thumbnailUrl} />
  {:else}
    <meta
      property="og:image"
      content="https://tkaflowarts.com/og-default.png"
    />
    <meta name="twitter:card" content="summary_large_image" />
    <meta
      name="twitter:image"
      content="https://tkaflowarts.com/og-default.png"
    />
  {/if}
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<main class="scan-route">
  {#if !loadingRetired}
    <div
      class="loading-layer"
      class:retired={viewerReady}
      aria-hidden={viewerReady}
    >
      <LoadingGate variant="bar" message="Loading sequence…" />
    </div>
  {/if}

  {#if browser && QScanPageComponent}
    <div
      class="viewer-layer"
      class:ready={viewerReady}
      aria-hidden={!viewerReady}
      inert={!viewerReady ? true : undefined}
    >
      <QScanPageComponent {data} onViewerReady={handleViewerReady} />
    </div>
  {/if}
</main>

<style>
  .scan-route,
  .loading-layer,
  .viewer-layer {
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .scan-route {
    background: #0f0f1a;
  }

  .loading-layer,
  .viewer-layer {
    transition: opacity 180ms ease;
  }

  .loading-layer {
    z-index: 1;
    opacity: 1;
  }

  .loading-layer.retired {
    opacity: 0;
    pointer-events: none;
  }

  .viewer-layer {
    z-index: 2;
    opacity: 0;
    pointer-events: none;
  }

  .viewer-layer.ready {
    opacity: 1;
    pointer-events: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-layer,
    .viewer-layer {
      transition: none;
    }
  }
</style>
