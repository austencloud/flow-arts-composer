<script lang="ts">
  import { onMount } from "svelte";

  type WorkbenchComponent = typeof import("./Viewer3DWorkbench.svelte").default;

  let Workbench = $state<WorkbenchComponent | null>(null);
  let failure = $state("");

  onMount(() => {
    let active = true;
    void import("./Viewer3DWorkbench.svelte")
      .then(({ default: component }) => {
        if (active) Workbench = component;
      })
      .catch((cause: unknown) => {
        if (!active) return;
        failure =
          cause instanceof Error
            ? cause.message
            : "The 3D scene could not be opened.";
      });

    return () => {
      active = false;
    };
  });
</script>

<svelte:head>
  <title>Viewer 3D scene workbench</title>
  <meta
    name="description"
    content="A lightweight development surface for the production Viewer 3D scenes."
  />
</svelte:head>

<main class="workbench-host">
  {#if Workbench}
    <Workbench />
  {:else if failure}
    <p role="alert">{failure}</p>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #0a0a14;
  }

  .workbench-host {
    /* behind the status bar: a holder, the viewer workbench inside keeps its own inset */
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #0a0a14;
  }

  p {
    position: absolute;
    inset: 50% auto auto 50%;
    max-width: min(32rem, calc(100vw - 2rem));
    margin: 0;
    color: rgba(255, 255, 255, 0.88);
    font-size: var(--font-size-min, 0.875rem);
    transform: translate(-50%, -50%);
  }
</style>
