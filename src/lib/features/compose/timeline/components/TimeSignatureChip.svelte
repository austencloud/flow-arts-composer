<script lang="ts">
  /**
   * TimeSignatureChip - Compact time signature selector
   *
   * Shows current time signature as a clickable chip.
   * Clicking cycles through available options or opens a dropdown.
   */

  import {
    TIME_SIGNATURES,
    type TimeSignatureKey,
  } from "#lib/shared/foundation/domain/models/time-signature.js";
  import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";

  // Available time signatures with display info
  const TIME_SIGNATURE_OPTIONS: Array<{
    key: TimeSignatureKey;
    label: string;
    description: string;
  }> = [
    { key: "4/4", label: "4/4", description: "Common time" },
    { key: "3/4", label: "3/4", description: "Waltz time" },
    { key: "6/8", label: "6/8", description: "Compound duple" },
  ];

  let isOpen = $state(false);
  let currentTimeSignature = $state<TimeSignatureKey>("4/4");

  function getState() {
    return getTimelineState();
  }

  // Sync from state
  $effect(() => {
    const state = getState();
    currentTimeSignature = state.project.timeSignature ?? "4/4";
  });

  function handleSelect(ts: TimeSignatureKey) {
    getState().setTimeSignature(ts);
    isOpen = false;
  }

  function handleChipClick() {
    isOpen = !isOpen;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
    } else if (e.key === "Enter" || e.key === " ") {
      isOpen = !isOpen;
    }
  }

  function handleOptionKeyDown(e: KeyboardEvent, ts: TimeSignatureKey) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(ts);
    }
  }

  function handlePointerDownOutside(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".time-signature-chip-container")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("pointerdown", handlePointerDownOutside);
      return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
    }
    return undefined;
  });
</script>

<div class="time-signature-chip-container">
  <button
    class="time-signature-chip"
    class:open={isOpen}
    onclick={handleChipClick}
    onkeydown={handleKeyDown}
    title="Time signature (click to change)"
    aria-label="Time signature: {currentTimeSignature}"
    aria-expanded={isOpen}
    aria-haspopup="listbox"
  >
    <span class="ts-display">{currentTimeSignature}</span>
    <i
      class="fa-solid fa-chevron-down dropdown-icon"
      class:rotated={isOpen}
      aria-hidden="true"
    ></i>
  </button>

  {#if isOpen}
    <div
      class="dropdown"
      role="listbox"
      aria-label="Select time signature"
    >
      {#each TIME_SIGNATURE_OPTIONS as option (option.key)}
        <button
          class="dropdown-option"
          class:selected={option.key === currentTimeSignature}
          onclick={() => handleSelect(option.key)}
          onkeydown={(e) => handleOptionKeyDown(e, option.key)}
          role="option"
          aria-selected={option.key === currentTimeSignature}
        >
          <span class="option-label">{option.label}</span>
          <span class="option-description">{option.description}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .time-signature-chip-container {
    position: relative;
  }

  .time-signature-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    font-family: "SF Mono", "Monaco", "Consolas", monospace;
    transition: all var(--duration-normal) ease;
    min-width: 60px;
    justify-content: space-between;
  }

  .time-signature-chip:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .time-signature-chip.open {
    border-color: var(--theme-accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .ts-display {
    font-size: var(--font-size-sm, 14px);
  }

  .dropdown-icon {
    font-size: 10px;
    transition: transform var(--duration-normal) ease;
    opacity: 0.6;
  }

  .dropdown-icon.rotated {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 140px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 8px;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.3),
      0 4px 8px rgba(0, 0, 0, 0.2);
    z-index: 100;
    overflow: hidden;
    animation: dropdown-appear var(--duration-fast) ease-out;
  }

  @keyframes dropdown-appear {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--theme-text);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast) ease;
  }

  .dropdown-option:hover {
    background: var(--theme-card-hover-bg);
  }

  .dropdown-option.selected {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  .dropdown-option.selected:hover {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .option-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    font-family: "SF Mono", "Monaco", "Consolas", monospace;
  }

  .option-description {
    font-size: var(--font-size-xs, 11px);
    color: var(--theme-text-dim);
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .dropdown {
      animation: none;
    }

    .dropdown-icon {
      transition: none;
    }
  }
</style>
