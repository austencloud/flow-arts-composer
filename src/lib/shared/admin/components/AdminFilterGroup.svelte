<script lang="ts">
  /**
   * AdminFilterGroup
   * Filter button group with active states
   */

  import type { FilterOption } from "../types/admin-component-types";

  interface AdminFilterGroupProps {
    options: FilterOption[];
    selected: string;
    onChange: (id: string) => void;
    variant?: "pills" | "tabs";
    class?: string;
  }

  let {
    options,
    selected,
    onChange,
    variant = "pills",
    class: className = "",
  }: AdminFilterGroupProps = $props();
</script>

<div class="admin-filter-group variant-{variant} {className}">
  {#each options as option (option.id)}
    <button
      class="filter-btn"
      class:active={selected === option.id}
      onclick={() => onChange(option.id)}
    >
      {#if option.icon}
        <i class="fas {option.icon}" aria-hidden="true"></i>
      {/if}
      <span>{option.label}</span>
      {#if option.count !== undefined}
        <span class="count">{option.count}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .admin-filter-group {
    display: flex;
    gap: 4px;
    background: var(--theme-card-bg);
    padding: 4px;
    border-radius: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
    flex-shrink: 1;
    min-width: 0;
    -webkit-overflow-scrolling: touch;
  }

  .admin-filter-group::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }

  .filter-btn {
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim);
    border-radius: 8px;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
    font-size: var(--font-size-compact);
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    flex-shrink: 0;
    min-height: var(--min-touch-target); /* Touch target */
  }

  @media (hover: hover) {
    .filter-btn:hover {
      color: var(--theme-text);
      background: var(--theme-card-bg);
    }
  }

  .filter-btn:active {
    transform: scale(0.97);
  }

  .filter-btn.active {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  /* On small screens, hide labels, show only icons */
  .filter-btn span:not(.count) {
    display: none;
  }

  .filter-btn i {
    font-size: var(--font-size-sm);
  }

  /* Show labels on wider screens */
  @media (min-width: 480px) {
    .filter-btn {
      padding: 8px 12px;
      font-size: var(--font-size-compact);
      gap: 6px;
    }

    .filter-btn span:not(.count) {
      display: inline;
    }
  }

  .count {
    font-size: var(--font-size-compact);
    opacity: 0.7;
    display: none;
  }

  @media (min-width: 600px) {
    .count {
      display: inline;
      font-size: var(--font-size-compact);
    }
  }

  /* Tabs variant */
  .variant-tabs {
    background: none;
    border-bottom: 1px solid var(--theme-stroke);
    padding: 0;
    border-radius: 0;
  }

  .variant-tabs .filter-btn {
    border-radius: 0;
    border-bottom: 2px solid transparent;
  }

  .variant-tabs .filter-btn.active {
    background: none;
    border-bottom-color: var(--semantic-info);
  }
</style>
