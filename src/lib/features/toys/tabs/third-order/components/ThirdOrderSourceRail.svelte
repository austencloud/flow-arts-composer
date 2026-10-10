<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { getThirdOrderContext } from "../context/third-order-context";
  import type { ThirdOrderChildDraft } from "../domain/third-order-composition";

  let { embedded = false }: { embedded?: boolean } = $props();
  const state = getThirdOrderContext();

  function sequenceName(sequence: ThirdOrderChildDraft["sequence"]): string {
    return sequence.word || sequence.name || "Untitled sequence";
  }
</script>

<section class="source-rail" class:embedded aria-label="Third Order sources">
  <header class="rail-header">
    <h2>Sources</h2>
    <p>Choose the clock and the two sequences traveling inside it.</p>
  </header>

  <section class="source-row carrier-row">
    <div class="source-identity static-source">
      <span class="source-icon carrier-icon" aria-hidden="true">
        <i class="fas fa-atom"></i>
      </span>
      <span class="source-copy">
        <span class="source-kicker">Parent clock</span>
        <strong>Carrier sequence</strong>
        <span class="sequence-word">
          {sequenceName(state.composition.carrier)}
        </span>
        <small>
          {state.composition.carrier.steps.length} counts · both lanes
        </small>
      </span>
    </div>
    <PanelButton
      ariaLabel="Choose parent clock sequence"
      onclick={() => state.openPicker("carrier")}
    >
      Choose
    </PanelButton>
  </section>

  <div class="child-sources">
    {#each state.composition.children as child (child.id)}
      <section
        class:blue={child.id === "grid-blue"}
        class:red={child.id === "grid-red"}
        class:selected={state.selectedChildId === child.id}
        class="source-row child-row"
      >
        <button
          class="source-identity"
          type="button"
          onclick={() => state.selectChild(child.id)}
          aria-pressed={state.selectedChildId === child.id}
        >
          <span class="source-icon" aria-hidden="true">
            <i class="fas fa-border-all"></i>
          </span>
          <span class="source-copy">
            <span class="source-kicker">Inner system</span>
            <strong>{child.label}</strong>
            <span class="sequence-word">{sequenceName(child.sequence)}</span>
            <small>
              {child.sequence.steps.length} counts · {child.lane} path
            </small>
          </span>
        </button>
        <PanelButton
          ariaLabel={`Choose sequence for ${child.label}`}
          onclick={() => state.openPicker(child.id)}
        >
          Choose
        </PanelButton>
      </section>
    {/each}
  </div>

  <PanelButton fullWidth onclick={state.duplicateBlueToRed}>
    <i class="fas fa-clone" aria-hidden="true"></i>
    Duplicate blue setup to red
  </PanelButton>
</section>

<style>
  .source-rail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    height: 100%;
    padding: 16px;
    overflow: auto;
    background: var(--theme-panel-bg);
  }
  .source-rail.embedded {
    height: auto;
    margin-top: 17px;
    padding: 17px 0 0;
    overflow: visible;
    border-top: 1px solid var(--theme-stroke);
    background: transparent;
  }

  .rail-header {
    display: grid;
    gap: 5px;
  }
  .rail-header h2 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 18px;
  }
  .rail-header p {
    margin: 0;
    color: var(--theme-text-dim, #9ca3af);
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }
  .source-kicker {
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .source-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.13));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg);
  }

  .child-row {
    transition:
      border-color var(--transition-normal),
      box-shadow var(--transition-normal);
  }
  .child-row.selected.blue {
    border-color: color-mix(in srgb, var(--prop-blue, #3b82f6) 72%, white);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--prop-blue, #3b82f6) 22%, transparent);
  }
  .child-row.selected.red {
    border-color: color-mix(in srgb, var(--prop-red, #ef4444) 72%, white);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--prop-red, #ef4444) 22%, transparent);
  }
  .source-identity {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .static-source {
    cursor: default;
  }
  .source-identity:focus-visible {
    outline: 3px solid var(--theme-focus-ring, #a78bfa);
    outline-offset: 4px;
    border-radius: 8px;
  }
  .source-copy {
    display: grid;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .source-copy strong {
    color: var(--theme-text, #fff);
    font-size: 15px;
  }
  .source-copy small {
    color: var(--theme-text-dim, #9ca3af);
    font-size: var(--font-size-compact, 12px);
  }

  .source-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border-radius: var(--border-radius-md, 8px);
    background: color-mix(in srgb, currentColor 13%, transparent);
    color: var(--theme-accent, #8b5cf6);
  }
  .blue .source-icon {
    color: var(--prop-blue, #3b82f6);
  }
  .red .source-icon {
    color: var(--prop-red, #ef4444);
  }
  .carrier-icon {
    color: #c084fc;
  }
  .sequence-word {
    overflow: hidden;
    color: var(--theme-text-dim, #9ca3af);
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .child-sources {
    display: grid;
    gap: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .child-row {
      transition: none;
    }
  }
</style>
