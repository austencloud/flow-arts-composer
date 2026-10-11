<script lang="ts">
  /**
   * Viewer3DVisibilityToggles
   *
   * Chip-style toggles for overlay visibility in the 3D viewer.
   * Controls whether props, beat numbers, TKA glyph, word header,
   * and progress bar are visible. Reads/writes the global
   * AnimationVisibilityStateManager.
   */

  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  const vm = getAnimationVisibilityManager();

  type VisibilityKey = "props" | "stepNumbers" | "tkaGlyph" | "wordHeader" | "progressBar";

  const TOGGLES: { key: VisibilityKey; label: string }[] = [
    { key: "props", label: "Props" },
    { key: "stepNumbers", label: "Step #s" },
    { key: "tkaGlyph", label: "TKA Glyph" },
    { key: "wordHeader", label: "Word Header" },
    { key: "progressBar", label: "Progress Bar" },
  ];

  // Bridge observer pattern into reactive state
  let version = $state(0);
  $effect(() => {
    const bump = () => { version++; };
    vm.registerObserver(bump);
    return () => vm.unregisterObserver(bump);
  });

  function isEnabled(key: VisibilityKey): boolean {
    void version; // reactive dependency
    return vm.getVisibility(key);
  }

  function handleToggle(key: VisibilityKey) {
    vm.toggleVisibility(key);
  }
</script>

<div class="visibility-chips">
  {#each TOGGLES as toggle (toggle.key)}
    {@const enabled = isEnabled(toggle.key)}
    <button
      class="chip"
      class:active={enabled}
      onclick={() => handleToggle(toggle.key)}
      aria-pressed={enabled}
    >
      {toggle.label}
    </button>
  {/each}
</div>

<style>
  .visibility-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0;
  }

  .chip {
    padding: 5px 12px;
    border-radius: 100px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .chip:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }

  .chip.active {
    border-color: color-mix(in srgb, #8b8bff 40%, transparent);
    background: color-mix(in srgb, #8b8bff 15%, transparent);
    color: rgba(255, 255, 255, 0.9);
  }
</style>
