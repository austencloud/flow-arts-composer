<script lang="ts">
  import { onMount } from "svelte";

  type ViewerComponent = typeof import("./QstPropViewer.svelte").default;

  let Viewer = $state<ViewerComponent | null>(null);
  let failure = $state("");

  onMount(() => {
    let active = true;

    void import("./QstPropViewer.svelte")
      .then(({ default: component }) => {
        if (active) Viewer = component;
      })
      .catch((cause: unknown) => {
        if (!active) return;
        failure =
          cause instanceof Error
            ? cause.message
            : "The prop-only viewer could not be opened.";
      });

    return () => {
      active = false;
    };
  });
</script>

<svelte:head>
  <title>Quarter Space Tech · Prop-only 3D viewer</title>
  <meta
    name="description"
    content="Prop-only inspection of Quarter Space Tech patterns documented by Mentive from Alex Kurowski's grid."
  />
</svelte:head>

<main class="viewer-host">
  {#if Viewer}
    <Viewer />
  {:else if failure}
    <p class="load-message" role="alert">{failure}</p>
  {:else}
    <p class="load-message">Preparing the 3D archive…</p>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #070911;
  }

  .viewer-host {
    /* behind the status bar: a full-screen 3D viewer with a centred load note */
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #070911;
  }

  .load-message {
    position: absolute;
    inset: 50% auto auto 50%;
    max-width: min(32rem, calc(100vw - 2rem));
    margin: 0;
    color: rgba(255, 255, 255, 0.84);
    font-size: var(--font-size-min, 0.875rem);
    transform: translate(-50%, -50%);
  }
</style>
