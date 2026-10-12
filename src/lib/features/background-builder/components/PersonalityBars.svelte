<script lang="ts">
  import type { FishPersonality } from "@austencloud/backgrounds";

  interface Props {
    personality: FishPersonality;
  }

  let { personality }: Props = $props();

  const traits = $derived([
    { label: "Boldness", value: personality.boldness },
    { label: "Sociability", value: personality.sociability },
    { label: "Activity", value: personality.activity },
    { label: "Curiosity", value: personality.curiosity },
  ]);
</script>

<div class="personality-bars">
  {#each traits as trait}
    <div class="trait">
      <span class="trait-label">{trait.label}</span>
      <div class="bar">
        <div class="fill" style="width: {trait.value * 100}%"></div>
      </div>
    </div>
  {/each}
</div>

<style>
  .personality-bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trait {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .trait-label {
    font-size: var(--font-size-compact, 12px);
    color: #9ca3af;
    width: 60px;
    flex-shrink: 0;
  }

  .bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, #06b6d4, #22d3ee);
    border-radius: 3px;
    transition: width var(--duration-emphasis) var(--ease-standard);
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
