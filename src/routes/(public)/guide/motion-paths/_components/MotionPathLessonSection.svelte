<script lang="ts">
  import { onMount, type Component } from "svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { createRenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";

  let {
    id,
    loader,
    tabId,
    selected,
  }: {
    id: string;
    loader: () => Promise<{ default: Component<{ active?: boolean }> }>;
    tabId: string;
    selected: boolean;
  } = $props();
  let host = $state<HTMLElement>();
  let renderActive = $state(false);
  const demoActive = $derived(selected && renderActive);
  onMount(() => {
    const gate = createRenderActivityGate({ name: id, rootMargin: "120px" });
    const unsubscribe = gate.subscribe((value) => (renderActive = value));
    if (host) {
      gate.attach(host);
      renderActive = gate.active;
    }
    return () => {
      unsubscribe();
      gate.dispose();
    };
  });
</script>

<section
  {id}
  bind:this={host}
  class="lesson"
  role="tabpanel"
  aria-labelledby={tabId}
  hidden={!selected}
>
  <div class="lesson-stage">
    <LazyMount
      {loader}
      active={demoActive}
      props={{ active: demoActive }}
      debugName={id}
    >
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
  .lesson-stage {
    min-width: 0;
  }
  .placeholder {
    display: grid;
    min-height: min(16rem, 72cqw);
    place-content: center;
    justify-items: center;
    color: var(--theme-text-muted);
  }
</style>
