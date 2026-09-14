<script lang="ts">
  import { onMount, type Component } from "svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { createRenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";

  let {
    id,
    title,
    description,
    loader,
  }: {
    id: string;
    title: string;
    description: string;
    loader: () => Promise<{ default: Component<{ active?: boolean }> }>;
  } = $props();
  let host = $state<HTMLElement>();
  let active = $state(false);
  onMount(() => {
    const gate = createRenderActivityGate({ name: id, rootMargin: "120px" });
    const unsubscribe = gate.subscribe((value) => (active = value));
    if (host) gate.attach(host);
    return () => {
      unsubscribe();
      gate.dispose();
    };
  });
</script>

<section class="lesson" bind:this={host} aria-labelledby={id}>
  <header>
    <h2 {id}>{title}</h2>
    <p>{description}</p>
  </header>
  <div class="lesson-stage">
    <LazyMount {loader} {active} props={{ active }} debugName={id}>
      {#snippet placeholder()}
        <div class="placeholder" role="status">Loading demonstration…</div>
      {/snippet}
      {#snippet error(_error, retry)}
        <div class="placeholder" role="alert">
          <p>This demonstration could not load.</p>
          <PanelButton onclick={retry}>Try again</PanelButton>
        </div>
      {/snippet}
    </LazyMount>
  </div>
</section>

<style>
  .lesson {
    min-width: 0;
    container-type: inline-size;
  }
  header {
    margin-bottom: var(--spacing-md, 16px);
  }
  h2 {
    margin: 0 0 var(--spacing-sm, 8px);
    font-size: clamp(22px, 3cqw, 28px);
  }
  header p {
    margin: 0;
    max-width: 65ch;
    color: var(--theme-text-muted);
    font-size: var(--font-size-min, 14px);
    line-height: 1.6;
  }
  .lesson-stage {
    min-width: 0;
    min-height: 440px;
  }
  .placeholder {
    min-height: 440px;
    display: grid;
    place-content: center;
    justify-items: center;
    color: var(--theme-text-muted);
  }
</style>
