<script lang="ts">
  import type { Snippet } from "svelte";
  import { growFade } from "$lib/shared/transitions/motion";

  let {
    title,
    description,
    open = $bindable(false),
    children,
  }: {
    title: string;
    description?: string;
    open?: boolean;
    children: Snippet;
  } = $props();
  const id = $props.id();
</script>

<section class="disclosure">
  <button
    type="button"
    class="heading"
    aria-expanded={open}
    aria-controls={id}
    onclick={() => (open = !open)}
  >
    <span class="labels"
      ><span class="title">{title}</span>
      {#if description && !open}<span class="description">{description}</span
        >{/if}
    </span>
    <i
      class="fa-solid {open ? 'fa-chevron-up' : 'fa-chevron-down'}"
      aria-hidden="true"
    ></i>
  </button>
  {#if open}
    <div {id} class="body" transition:growFade>{@render children()}</div>
  {/if}
</section>

<style>
  .disclosure {
    border-top: 1px solid var(--theme-stroke);
    min-width: 0;
  }
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    min-height: 3.5rem;
    padding: 0.75rem 0;
    border: 0;
    background: none;
    color: var(--theme-text);
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .heading:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
    border-radius: 0.25rem;
  }
  .labels {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .title {
    font-size: var(--mapping-text-size, 0.9375rem);
    font-weight: 600;
  }
  .description {
    color: var(--theme-text-dim, #aaa);
    font-size: var(--mapping-text-size, 0.875rem);
    line-height: 1.4;
  }
  .heading i {
    font-size: var(--mapping-meta-size, 0.75rem);
  }
  .body {
    display: grid;
    gap: 0.75rem;
    padding-bottom: 1rem;
    min-width: 0;
  }
</style>
