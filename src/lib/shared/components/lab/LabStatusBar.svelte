<script lang="ts">
  import type { Snippet } from "svelte";

  interface StatusChip {
    label: string;
    color?: "cyan" | "blue" | "green" | "orange" | "red" | "purple" | "gray";
  }

  interface EnergyDisplay {
    value: number; // 0-1
    label?: string;
    icon?: string;
  }

  interface Counter {
    icon: string;
    value: number | string;
    label?: string;
  }

  interface Props {
    chips?: StatusChip[];
    energy?: EnergyDisplay;
    counters?: Counter[];
    children?: Snippet;
  }

  let { chips = [], energy, counters = [], children }: Props = $props();

  const chipColors: Record<string, { bg: string; text: string; glow: string }> =
    {
      cyan: {
        bg: "rgba(34, 211, 238, 0.15)",
        text: "#22d3ee",
        glow: "rgba(34, 211, 238, 0.2)",
      },
      left: {
        bg: "rgba(96, 165, 250, 0.15)",
        text: "#93c5fd",
        glow: "rgba(96, 165, 250, 0.2)",
      },
      green: {
        bg: "rgba(52, 211, 153, 0.15)",
        text: "#6ee7b7",
        glow: "rgba(52, 211, 153, 0.2)",
      },
      orange: {
        bg: "rgba(251, 146, 60, 0.15)",
        text: "#fdba74",
        glow: "rgba(251, 146, 60, 0.2)",
      },
      right: {
        bg: "rgba(239, 68, 68, 0.15)",
        text: "#fca5a5",
        glow: "rgba(239, 68, 68, 0.2)",
      },
      purple: {
        bg: "rgba(168, 85, 247, 0.15)",
        text: "#c4b5fd",
        glow: "rgba(168, 85, 247, 0.2)",
      },
      gray: {
        bg: "rgba(107, 114, 128, 0.15)",
        text: "#9ca3af",
        glow: "rgba(107, 114, 128, 0.1)",
      },
    };

  function getChipStyle(
    color:
      | "cyan"
      | "blue"
      | "green"
      | "orange"
      | "red"
      | "purple"
      | "gray" = "gray"
  ) {
    const c = chipColors[color] ?? chipColors.gray!;
    return `background: ${c.bg}; color: ${c.text}; box-shadow: 0 0 8px ${c.glow};`;
  }
</script>

<div class="status-bar">
  {#each chips as chip}
    <div class="status-chip" style={getChipStyle(chip.color)}>
      <span class="chip-label">{chip.label}</span>
    </div>
  {/each}

  {#if energy}
    <div class="energy-mini" title={energy.label}>
      <i class="fas {energy.icon ?? 'fa-bolt'}"></i>
      <div class="energy-track">
        <div class="energy-fill" style="width: {energy.value * 100}%"></div>
      </div>
    </div>
  {/if}

  {#each counters as counter}
    <div class="counter-mini" title={counter.label}>
      <i class="fas {counter.icon}"></i>
      <span>{counter.value}</span>
    </div>
  {/each}

  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-wrap: wrap;
  }

  .status-chip {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
    white-space: nowrap;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
  }

  .energy-mini {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    color: #6ee7b7;
    font-size: 0.75rem;
  }

  .energy-mini i {
    font-size: 0.65rem;
    opacity: 0.8;
  }

  .energy-track {
    width: 48px;
    height: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    overflow: hidden;
  }

  .energy-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #34d399);
    border-radius: 4px;
    transition: width var(--duration-emphasis) var(--ease-standard);
  }

  .counter-mini {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #a78bfa;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .counter-mini i {
    font-size: 0.65rem;
    opacity: 0.8;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .energy-fill {
      transition: none;
    }
  }
</style>
