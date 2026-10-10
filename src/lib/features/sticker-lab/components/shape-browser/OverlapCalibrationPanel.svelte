<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    DEFAULT_OVERLAP_CONFIG,
    type MandalaOverlapConfig,
  } from "#lib/shared/mandala/domain/mandala-types.js";

  type RenderStyle = "stroke" | "filled";

  let {
    renderStyle = $bindable<RenderStyle>("stroke"),
    strokeWidth = $bindable(2.5),
    overlap = $bindable<MandalaOverlapConfig>({ ...DEFAULT_OVERLAP_CONFIG }),
  } = $props();

  const styleOptions = [
    { value: "stroke" as const, label: "Stroke" },
    { value: "filled" as const, label: "Filled" },
  ];

  function setOverlap(field: keyof MandalaOverlapConfig, event: Event): void {
    overlap = {
      ...overlap,
      [field]: Number((event.currentTarget as HTMLInputElement).value),
    };
  }

  function reset(): void {
    renderStyle = "stroke";
    strokeWidth = 2.5;
    overlap = { ...DEFAULT_OVERLAP_CONFIG };
  }
</script>

<details class="calibration">
  <summary>
    <span>
      <i class="fas fa-sliders" aria-hidden="true"></i>
      Advanced preview calibration
    </span>
    <small>Preview only</small>
  </summary>

  <div class="controls">
    <p>
      These controls inspect overlap rendering. Sticker SVG and PDF output keep
      their print settings.
    </p>

    <div class="style-row">
      <span class="control-label">Style</span>
      <SegmentedControl
        options={styleOptions}
        value={renderStyle}
        onchange={(value) => (renderStyle = value)}
        color="accent"
        size="sm"
      />
    </div>

    <label>
      <span>Stroke</span>
      <input
        type="range"
        min="0.5"
        max="6"
        step="0.1"
        bind:value={strokeWidth}
      />
      <output>{strokeWidth.toFixed(1)}</output>
    </label>
    <label>
      <span>Feather</span>
      <input
        type="range"
        min="0"
        max="3"
        step="0.05"
        value={overlap.feather}
        oninput={(event) => setOverlap("feather", event)}
      />
      <output>{overlap.feather.toFixed(2)}</output>
    </label>
    <label>
      <span>Bloom</span>
      <input
        type="range"
        min="0"
        max="15"
        step="0.5"
        value={overlap.bloomBlur}
        oninput={(event) => setOverlap("bloomBlur", event)}
      />
      <output>{overlap.bloomBlur.toFixed(1)}</output>
    </label>
    <label>
      <span>Glow</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.02"
        value={overlap.bloomOpacity}
        oninput={(event) => setOverlap("bloomOpacity", event)}
      />
      <output>{overlap.bloomOpacity.toFixed(2)}</output>
    </label>
    <label>
      <span>Width</span>
      <input
        type="range"
        min="0.5"
        max="6"
        step="0.1"
        value={overlap.bloomWidth}
        oninput={(event) => setOverlap("bloomWidth", event)}
      />
      <output>{overlap.bloomWidth.toFixed(1)}</output>
    </label>
    <label>
      <span>Core</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.02"
        value={overlap.coreOpacity}
        oninput={(event) => setOverlap("coreOpacity", event)}
      />
      <output>{overlap.coreOpacity.toFixed(2)}</output>
    </label>

    <button class="reset" type="button" onclick={reset}>
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      Reset preview
    </button>
  </div>
</details>

<style>
  .calibration {
    width: min(100%, 42rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  summary {
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    color: var(--theme-text, white);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
  }

  summary span {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-weight: 600;
  }

  summary small {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .controls {
    display: grid;
    gap: var(--spacing-sm);
    padding: 0 var(--spacing-md) var(--spacing-md);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  p {
    margin: var(--spacing-md) 0 var(--spacing-xs);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.5;
  }

  .style-row,
  label {
    display: grid;
    grid-template-columns: 5rem minmax(8rem, 1fr) 3rem;
    align-items: center;
    gap: var(--spacing-sm);
    min-height: var(--min-touch-target);
  }

  .style-row {
    grid-template-columns: 5rem minmax(8rem, 1fr);
  }

  label span,
  .control-label,
  output {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
  }

  output {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  input[type="range"] {
    width: 100%;
    accent-color: var(--theme-accent, #a78bfa);
  }

  .reset {
    min-height: var(--min-touch-target);
    justify-self: end;
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-sm);
    background: transparent;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
  }

  @media (max-width: 32rem) {
    .style-row,
    label {
      grid-template-columns: 4rem minmax(6rem, 1fr) 2.5rem;
    }

    .style-row {
      grid-template-columns: 4rem minmax(6rem, 1fr);
    }
  }
</style>
