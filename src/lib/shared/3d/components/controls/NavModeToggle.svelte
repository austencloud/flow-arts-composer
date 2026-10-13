<script lang="ts">
  /**
   * NavModeToggle
   *
   * Three-way segmented control for the sequence viewer's navigation mode:
   * Orbit (drag to rotate around subject), Fly (WASD + mouse look, no gravity),
   * Walk (grounded first-person - planned; currently disabled with a tooltip).
   *
   * Lives in the top-left of the 3D canvas overlay.
   */

  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import type { ViewerNavMode } from "../../state/viewer-3d-state.svelte";

  const viewer3DState = getViewer3DContext();
  const mode = $derived(viewer3DState.navMode);

  interface ModeDef {
    value: ViewerNavMode;
    label: string;
    icon: string;
    title: string;
    disabled?: boolean;
  }

  const modes: ModeDef[] = [
    {
      value: "orbit",
      label: "Orbit",
      icon: "fa-circle-notch",
      title: "Orbit - drag to rotate around the performer",
    },
    {
      value: "fly",
      label: "Fly",
      icon: "fa-dove",
      title: "Fly - WASD + mouse look, click canvas for pointer lock",
    },
    {
      value: "walk",
      label: "Walk",
      icon: "fa-shoe-prints",
      title: "Walk - coming soon (grounded first-person)",
      disabled: true,
    },
  ];

  function select(value: ViewerNavMode, disabled: boolean | undefined) {
    if (disabled) return;
    viewer3DState.setNavMode(value);
  }
</script>

<div
  class="nav-mode-toggle"
  role="radiogroup"
  aria-label="Camera navigation mode"
>
  {#each modes as m}
    <button
      type="button"
      class="segment"
      class:selected={mode === m.value}
      class:disabled={m.disabled}
      disabled={m.disabled}
      role="radio"
      aria-checked={mode === m.value}
      aria-label={m.label}
      title={m.title}
      onclick={() => select(m.value, m.disabled)}
    >
      <i class="fas {m.icon}" aria-hidden="true"></i>
      <span class="segment-label">{m.label}</span>
    </button>
  {/each}
</div>

<style>
  .nav-mode-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  .segment {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 28px;
    border-radius: 999px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .segment:hover:not(.selected):not(.disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
  }

  .segment.selected {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }

  .segment.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .segment:focus-visible {
    outline: 2px solid rgba(120, 160, 255, 0.6);
    outline-offset: 1px;
  }

  .segment :global(i) {
    font-size: 11px;
  }

  /* Collapse labels on narrow overlays - icon-only */
  @container (max-width: 360px) {
    .segment-label {
      display: none;
    }
    .segment {
      padding: 0 10px;
    }
  }
</style>
