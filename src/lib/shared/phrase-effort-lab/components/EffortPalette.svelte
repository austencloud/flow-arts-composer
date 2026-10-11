<script lang="ts">
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import { EFFORTS } from "#lib/shared/effort/domain/effort-types.js";

  interface Props {
    selectedEffort: EffortId | null;
    onSelect: (effort: EffortId) => void;
  }

  let { selectedEffort, onSelect }: Props = $props();

  function handleKeydown(event: KeyboardEvent, index: number): void {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex++;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex--;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = EFFORTS.length - 1;
    else return;

    event.preventDefault();
    nextIndex = (nextIndex + EFFORTS.length) % EFFORTS.length;
    const nextEffort = EFFORTS[nextIndex];
    if (!nextEffort) return;
    const group = (event.currentTarget as HTMLElement).closest(
      ".effort-palette"
    );
    onSelect(nextEffort.id);
    queueMicrotask(() => {
      group
        ?.querySelector<HTMLElement>(`[data-effort-id="${nextEffort.id}"]`)
        ?.focus();
    });
  }
</script>

<div class="effort-palette" role="radiogroup" aria-label="Effort brush">
  {#each EFFORTS as effort, index}
    <button
      class="palette-btn"
      class:active={selectedEffort === effort.id}
      type="button"
      role="radio"
      aria-checked={selectedEffort === effort.id}
      tabindex={selectedEffort === effort.id ||
      (selectedEffort === null && index === 0)
        ? 0
        : -1}
      data-effort-id={effort.id}
      onkeydown={(event) => handleKeydown(event, index)}
      onclick={() => onSelect(effort.id)}
      style:--effort-color={effort.color}
    >
      <strong>{effort.label}</strong>
      <span>{effort.subtitle}</span>
    </button>
  {/each}
</div>

<style>
  .effort-palette {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .palette-btn {
    flex: 1;
    min-width: 96px;
    min-height: 58px;
    padding: 8px 6px;
    border: 1.5px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .palette-btn strong {
    font-size: 14px;
    line-height: 1.2;
  }

  .palette-btn span {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.2;
    opacity: 0.72;
  }

  .palette-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
  }

  .palette-btn.active {
    background: color-mix(in srgb, var(--effort-color) 20%, transparent);
    border-color: var(--effort-color);
    color: var(--theme-text, white);
    box-shadow: 0 0 8px color-mix(in srgb, var(--effort-color) 30%, transparent);
  }

  .palette-btn:focus-visible {
    outline: 2px solid var(--effort-color, var(--theme-accent));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .palette-btn {
      transition: none;
    }
  }
</style>
