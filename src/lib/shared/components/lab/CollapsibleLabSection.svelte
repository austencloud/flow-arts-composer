<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    icon?: string;
    defaultOpen?: boolean;
    accentColor?: "cyan" | "purple" | "orange" | "red";
    children: Snippet;
  }

  let {
    title,
    icon = "fa-folder",
    defaultOpen = false,
    accentColor = "cyan",
    children,
  }: Props = $props();

  let isOpen = $state(false);
  $effect.pre(() => {
    isOpen = defaultOpen;
  });

  function toggle() {
    isOpen = !isOpen;
  }

  const accentColors = {
    cyan: {
      base: "var(--theme-accent, #22d3ee)",
      bg: "rgba(34, 211, 238, 0.1)",
      border: "rgba(34, 211, 238, 0.25)",
      glow: "rgba(34, 211, 238, 0.15)",
    },
    purple: {
      base: "var(--theme-accent, #a78bfa)",
      bg: "rgba(139, 92, 246, 0.1)",
      border: "rgba(139, 92, 246, 0.25)",
      glow: "rgba(139, 92, 246, 0.15)",
    },
    orange: {
      base: "#fdba74",
      bg: "rgba(251, 146, 60, 0.1)",
      border: "rgba(251, 146, 60, 0.25)",
      glow: "rgba(251, 146, 60, 0.15)",
    },
    red: {
      base: "#f87171",
      bg: "rgba(239, 68, 68, 0.1)",
      border: "rgba(239, 68, 68, 0.25)",
      glow: "rgba(239, 68, 68, 0.15)",
    },
  };

  const colors = $derived(accentColors[accentColor]);
</script>

<div
  class="collapsible-section"
  class:expanded={isOpen}
  style="
    --accent-base: {colors.base};
    --accent-bg: {colors.bg};
    --accent-border: {colors.border};
    --accent-glow: {colors.glow};
  "
>
  <button class="section-toggle" onclick={toggle}>
    <i class="fas {icon} section-icon"></i>
    <span>{title}</span>
    <i class="fas fa-chevron-down chevron"></i>
  </button>
  {#if isOpen}
    <div class="section-content">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .collapsible-section {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    transition:
      border-color var(--duration-normal) var(--ease-standard),
      border-radius var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
  }

  .collapsible-section.expanded {
    border-color: var(--accent-border);
    box-shadow: 0 0 12px var(--accent-glow);
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-radius var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .collapsible-section.expanded .section-toggle {
    border-radius: 12px 12px 0 0;
  }

  @media (hover: hover) {
    .section-toggle:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.04));
      color: #ffffff;
    }
  }

  .section-toggle:active {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.04));
  }

  .section-icon {
    font-size: 0.75rem;
    color: var(--accent-base);
    opacity: 0.9;
  }

  .chevron {
    margin-left: auto;
    font-size: 0.65rem;
    opacity: 0.5;
    transition: transform var(--duration-normal) var(--ease-spring);
  }

  .collapsible-section.expanded .chevron {
    transform: rotate(180deg);
  }

  .section-content {
    padding: 8px 14px 14px;
    animation: slideDown var(--duration-normal) var(--ease-standard-out);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .collapsible-section,
    .section-toggle,
    .chevron {
      transition: none;
    }
    .section-content {
      animation: none;
    }
  }
</style>
