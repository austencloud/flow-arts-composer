<script lang="ts">
  import type { EffortPhrase } from "../domain/effort-timeline-types";
  import { EFFORTS } from "#lib/shared/effort/domain/effort-types.js";

  interface Props {
    phrase: EffortPhrase;
    totalSteps: number;
    isSelected: boolean;
    onSelect: (id: string) => void;
  }

  let { phrase, totalSteps, isSelected, onSelect }: Props = $props();

  const effort = $derived(EFFORTS.find((e) => e.id === phrase.effortId));
  const color = $derived(effort?.color ?? "#94a3b8");
  const label = $derived(effort?.label ?? phrase.effortId);

  const left = $derived(((phrase.startStep - 1) / totalSteps) * 100);
  const width = $derived(((phrase.endStep - phrase.startStep + 1) / totalSteps) * 100);
</script>

<button
  class="phrase-region"
  class:selected={isSelected}
  style:left="{left}%"
  style:width="{width}%"
  style:--phrase-color={color}
  type="button"
  onclick={() => onSelect(phrase.id)}
  aria-label="{label} beats {phrase.startStep}-{phrase.endStep}"
>
  <span class="phrase-label">{label}</span>
</button>

<style>
  .phrase-region {
    position: absolute;
    top: 4px;
    bottom: 4px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--phrase-color) 30%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--phrase-color) 60%, transparent);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: all var(--duration-fast, 100ms) ease;
    z-index: 1;
  }

  .phrase-region:hover {
    background: color-mix(in srgb, var(--phrase-color) 40%, transparent);
    border-color: var(--phrase-color);
  }

  .phrase-region.selected {
    border-color: var(--phrase-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--phrase-color) 40%, transparent);
    z-index: 2;
  }

  .phrase-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, white);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    padding: 0 6px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  @media (prefers-reduced-motion: reduce) {
    .phrase-region {
      transition: none;
    }
  }
</style>
