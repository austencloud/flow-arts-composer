<script lang="ts">
  /**
   * How to drive the walk, as a small key legend in the corner. The caps are
   * the app's own `KeyboardKeyDisplay`; the page shows this while the pointer
   * is free or before the first few seconds of walking, and not on touch.
   */
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { motionDuration, opaqueFade } from "#lib/shared/transitions/motion.js";
  import KeyboardKeyDisplay from "#lib/shared/keyboard/components/settings/KeyboardKeyDisplay.svelte";

  const rows = [
    { keys: ["W", "A", "S", "D"], does: "Move" },
    { keys: ["Shift"], does: "Run" },
    { keys: ["V"], does: "View" },
    { keys: ["Escape"], does: "Free the mouse" },
  ];
  const duration = motionDuration(DURATION.dramatic);
</script>

<aside class="legend" aria-label="Controls" transition:opaqueFade={{ duration }}>
  {#each rows as row (row.does)}
    <div class="row">
      <span class="caps">
        {#each row.keys as key (key)}
          <KeyboardKeyDisplay keyCombo={key} size="small" />
        {/each}
      </span>
      <span class="does">{row.does}</span>
    </div>
  {/each}
  <div class="row">
    <span class="does">Click the view, then move the mouse to look.</span>
  </div>
</aside>

<style>
  .legend {
    position: absolute;
    right: 0.75rem;
    bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
    z-index: 20;
    display: grid;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    border-radius: 0.75rem;
    background: rgb(10 12 18 / 0.55);
    backdrop-filter: blur(6px);
    pointer-events: none;
    font-size: var(--font-size-sm, 0.875rem);
    color: rgb(255 244 228 / 0.92);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .caps {
    display: inline-flex;
    gap: 0.2rem;
    min-width: 7.5rem;
  }

  .does {
    white-space: nowrap;
  }
</style>
