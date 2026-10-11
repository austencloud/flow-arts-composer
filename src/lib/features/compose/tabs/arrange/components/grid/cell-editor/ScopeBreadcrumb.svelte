<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { ScopeLevel } from "./state/cell-editor-panel-state.svelte";

  export interface BreadcrumbSegment {
    level: ScopeLevel;
    label: string;
    dotColor?: string;
  }

  let {
    segments,
    onNavigate,
  }: {
    segments: BreadcrumbSegment[];
    onNavigate: (level: ScopeLevel) => void;
  } = $props();
</script>

<nav class="scope-breadcrumb" aria-label={t("compose_ui_scope_navigation")}>
  {#each segments as seg, i (seg.level)}
    {#if i > 0}
      <i class="fas fa-chevron-right bc-sep" aria-hidden="true"></i>
    {/if}
    {#if i === segments.length - 1}
      <span class="bc-segment bc-current" aria-current="location">
        {#if seg.dotColor}
          <span class="bc-dot" style:background={seg.dotColor}></span>
        {/if}
        {seg.label}
      </span>
    {:else}
      <button
        type="button"
        class="bc-segment bc-link"
        onclick={() => onNavigate(seg.level)}
      >
        {#if seg.dotColor}
          <span class="bc-dot" style:background={seg.dotColor}></span>
        {/if}
        {seg.label}
      </button>
    {/if}
  {/each}
</nav>

<style>
  .scope-breadcrumb {
    padding: 8px 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    flex-shrink: 0;
  }

  .bc-segment {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .bc-link {
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    background: none;
    border: none;
    font: inherit;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 4px;
    transition:
      color 120ms ease,
      background 120ms ease;
  }

  .bc-link:hover {
    color: rgba(255, 255, 255, 0.9);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.04));
  }

  .bc-link:focus-visible {
    outline: 2px solid var(--pill-focus, #4a9eff);
    outline-offset: 2px;
  }

  .bc-current {
    color: var(--theme-accent-light, #d4b4ff);
    font-weight: 600;
    padding: 2px 4px;
  }

  .bc-sep {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
  }

  .bc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }

  @media (prefers-reduced-motion: reduce) {
    .bc-link {
      transition: none;
    }
  }
</style>
