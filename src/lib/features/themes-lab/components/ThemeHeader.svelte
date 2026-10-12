<script lang="ts">
  type ThemeMode = "2d" | "3d";

  interface Props {
    label: string;
    color: string;
    mode: ThemeMode;
    onModeChange: (mode: ThemeMode) => void;
  }

  let { label, color, mode, onModeChange }: Props = $props();
</script>

<div class="theme-header">
  <div class="left">
    <span class="dot" style:background={color}></span>
    <span class="name">{label}</span>
    <span class="mode-badge" class:is-3d={mode === "3d"}>
      {mode === "2d" ? "2D" : "3D"}
    </span>
  </div>

  <div class="toggle" role="radiogroup" aria-label="Display mode">
    <button
      role="radio"
      aria-checked={mode === "2d"}
      class:active={mode === "2d"}
      onclick={() => onModeChange("2d")}>2D</button
    >
    <button
      role="radio"
      aria-checked={mode === "3d"}
      class:active={mode === "3d"}
      onclick={() => onModeChange("3d")}>3D</button
    >
  </div>
</div>

<style>
  .theme-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .name {
    font-size: 1rem;
    font-weight: 700;
    color: var(--theme-text, white);
  }

  .mode-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    background: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 15%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #7dd3fc) 70%, white);
  }

  /* 3D keeps a distinct tint while still deriving from the active theme accent. */
  .mode-badge.is-3d {
    background: color-mix(
      in srgb,
      var(--theme-accent, #a855f7) 18%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #c4b5fd) 60%, white);
  }

  .toggle {
    display: flex;
    padding: 2px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  }

  .toggle button {
    padding: 5px 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.45);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .toggle button:hover {
    color: rgba(255, 255, 255, 0.75);
  }

  .toggle button.active {
    background: rgba(255, 255, 255, 0.12);
    color: white;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle button:focus-visible {
    outline: 2px solid var(--theme-accent, #38bdf8);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle button {
      transition: none;
    }
  }
</style>
