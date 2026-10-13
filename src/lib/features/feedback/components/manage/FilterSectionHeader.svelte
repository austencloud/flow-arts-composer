<!-- FilterSectionHeader - Section title with toggle icon and active indicator -->
<script lang="ts">
  interface Props {
    title: string;
    isActive?: boolean;
    isExpanded?: boolean;
    onToggle: () => void;
  }

  const {
    title,
    isActive = false,
    isExpanded = false,
    onToggle,
  }: Props = $props();
</script>

<button type="button" class="filter-section-header" onclick={onToggle}>
  <h3 class="filter-section-title">{title}</h3>
  {#if isActive}
    <span class="section-active-dot"></span>
  {/if}
  <i
    class="fas fa-chevron-down section-chevron"
    aria-hidden="true"
    class:rotated={isExpanded}
  ></i>
</button>

<style>
  .filter-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 0 21px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
  }

  .filter-section-header:hover {
    background: var(--theme-card-hover-bg);
  }

  .filter-section-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .section-active-dot {
    width: 8px;
    height: 8px;
    background: var(--semantic-success, var(--semantic-success));
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .section-chevron {
    margin-left: auto;
    font-size: 0.75em;
    color: var(--theme-text-dim);
    transition: transform var(--duration-normal) var(--ease-standard);
  }

  .section-chevron.rotated {
    transform: rotate(180deg);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .section-active-dot {
      animation: none;
    }

    .section-chevron {
      transition: none;
    }
  }
</style>
