<script lang="ts">
  import type { ThemeId, ThemeOption } from "../domain/theme-types";

  interface Props {
    themes: ThemeOption[];
    activeId: ThemeId;
    onSelect: (id: ThemeId) => void;
  }

  let { themes, activeId, onSelect }: Props = $props();
</script>

<div class="theme-strip" role="tablist" aria-label="Theme selection">
  {#each themes as theme (theme.id)}
    <button
      role="tab"
      aria-selected={activeId === theme.id}
      class:active={activeId === theme.id}
      style:--chip-color={theme.color}
      onclick={() => onSelect(theme.id)}
    >
      <span class="dot" style:background={theme.color}></span>
      <span class="label">{theme.label}</span>
    </button>
  {/each}
</div>

<style>
  .theme-strip {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: rgba(10, 14, 26, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .theme-strip::-webkit-scrollbar {
    display: none;
  }

  button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: transparent;
    border: none;
    border-radius: 9px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  button:hover {
    color: rgba(255, 255, 255, 0.92);
    background: rgba(255, 255, 255, 0.06);
  }

  button:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) var(--ease-standard);
  }

  button.active {
    background: color-mix(in srgb, var(--chip-color) 22%, transparent);
    color: white;
    box-shadow:
      0 0 12px color-mix(in srgb, var(--chip-color) 18%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  button:focus-visible {
    outline: 2px solid var(--chip-color, var(--theme-accent, #38bdf8));
    outline-offset: 2px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .label {
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    button,
    button:active {
      transition: none;
    }
  }
</style>
