<!--
  TrailPointAssignmentSection.svelte

  Lets users assign trail endpoints to existing tip points or custom
  positions. Appears below the Actions section in the Tip Points tab.

  Mode chips (Auto / Off) control the overall mode.
  In "tip" mode, two labeled rows (L / R) let you assign a different
  tip point to each trail endpoint independently.
-->
<script lang="ts">
  import type { EffectPointEditorState } from "../state/effect-point-editor-state.svelte";
  import {
    getDefaultTrailPointConfig,
    type TrailPointConfig,
    type TrailPointSource,
  } from "#lib/shared/animation-engine/domain/types/trail-point-types.js";
  import { propTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";

  interface Props {
    editorState: EffectPointEditorState;
  }

  const { editorState }: Props = $props();

  let isSingleEnded = $derived(propTipEnds(editorState.selectedPropType) === 1);
  let leftSource = $derived(editorState.trailConfig?.left ?? null);
  let rightSource = $derived(editorState.trailConfig?.right ?? null);

  // Current mode: "auto" (no config), "off" (none), "tip" (at least one is tip-assigned), "custom"
  type Mode = "auto" | "off" | "tip" | "custom";

  function deriveMode(): Mode {
    if (!editorState.trailConfig) return "auto";
    const l = editorState.trailConfig.left;
    if (l.type === "none") return "off";
    if (l.type === "custom") return "custom";
    if (l.type === "tip") return "tip";
    return "auto";
  }

  let mode = $derived(deriveMode());

  // Which tip index is active for each side (-1 = none selected)
  let leftTipIndex = $derived(leftSource?.type === "tip" ? leftSource.index : -1);
  let rightTipIndex = $derived(rightSource?.type === "tip" ? rightSource.index : -1);

  function seedCustomSource(
    source: TrailPointSource | null,
    fallback: TrailPointSource,
  ): TrailPointSource {
    const seed = source && source.type !== "none" ? source : fallback;
    if (seed.type === "custom") return seed;
    if (seed.type === "tip") {
      const point = editorState.points[seed.index];
      if (point) return { type: "custom", dx: point.dx, dy: point.dy };
    }
    return { type: "custom", dx: 0, dy: 0 };
  }

  function selectMode(newMode: Mode) {
    if (newMode === "auto") {
      editorState.clearTrailConfig();
      return;
    }

    if (newMode === "off") {
      const config: TrailPointConfig = {
        left: { type: "none" },
        right: { type: "none" },
      };
      editorState.saveTrailConfig(config);
      return;
    }

    if (newMode === "tip") {
      editorState.saveTrailConfig(
        getDefaultTrailPointConfig(editorState.selectedPropType),
      );
      return;
    }

    if (newMode === "custom") {
      const defaults = getDefaultTrailPointConfig(editorState.selectedPropType);
      const config: TrailPointConfig = {
        left: seedCustomSource(leftSource, defaults.left),
        right: seedCustomSource(rightSource, defaults.right),
      };
      editorState.saveTrailConfig(config);
    }
  }

  function selectTip(side: "left" | "right", tipIndex: number) {
    // Single-ended props: both logical ends use the same physical tip point
    if (isSingleEnded) {
      const source: TrailPointSource = { type: "tip", index: tipIndex };
      editorState.saveTrailConfig({ left: source, right: { ...source } });
      return;
    }

    const otherSide = side === "left" ? rightSource : leftSource;
    const thisSide: TrailPointSource = { type: "tip", index: tipIndex };

    // Preserve the other side's current value, or default to tip 0
    const otherValue: TrailPointSource = otherSide?.type === "tip"
      ? otherSide
      : { type: "tip", index: 0 };

    const config: TrailPointConfig = side === "left"
      ? { left: thisSide, right: otherValue }
      : { left: otherValue, right: thisSide };

    editorState.saveTrailConfig(config);
  }

  function handleCustomDxDy(side: "left" | "right", field: "dx" | "dy", raw: string) {
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    const rounded = Math.round(value * 10) / 10;

    const currentSource = side === "left" ? leftSource : rightSource;
    if (currentSource?.type !== "custom") return;

    const updated: TrailPointSource = {
      type: "custom",
      dx: field === "dx" ? rounded : currentSource.dx,
      dy: field === "dy" ? rounded : currentSource.dy,
    };

    // Single-ended props: both ends share the same custom offset
    if (isSingleEnded) {
      editorState.saveTrailConfig({ left: updated, right: { ...updated } });
      return;
    }

    const other = side === "left" ? rightSource : leftSource;
    const otherValue: TrailPointSource = other ?? { type: "custom", dx: 0, dy: 0 };

    const config: TrailPointConfig = side === "left"
      ? { left: updated, right: otherValue }
      : { left: otherValue, right: updated };

    editorState.saveTrailConfig(config);
  }
</script>

<div class="section">
  <h3>
    <i class="fas fa-route" aria-hidden="true"></i>
    Trail Points
  </h3>
  <p class="section-desc">
    {#if isSingleEnded}
      Pick which tip point the trail emits from.
    {:else}
      Pick where trail lines emit from. Tip mode lets you assign each end separately.
    {/if}
  </p>

  <!-- Mode selector -->
  <div class="chip-row" role="radiogroup" aria-label="Trail point mode">
    <button
      class="chip"
      class:active={mode === "auto"}
      role="radio"
      aria-checked={mode === "auto"}
      onclick={() => selectMode("auto")}
      title="Use geometric calculation (default)"
    >Auto</button>

    <button
      class="chip"
      class:active={mode === "tip"}
      role="radio"
      aria-checked={mode === "tip"}
      onclick={() => selectMode("tip")}
      title="Assign tip points to each trail end"
    >Tip</button>

    <button
      class="chip"
      class:active={mode === "custom"}
      role="radio"
      aria-checked={mode === "custom"}
      onclick={() => selectMode("custom")}
      title="Custom dx/dy offset"
      aria-label="Custom dx/dy offset"
    >
      <i class="fas fa-pen" aria-hidden="true"></i>
    </button>

    <button
      class="chip chip-off"
      class:active={mode === "off"}
      role="radio"
      aria-checked={mode === "off"}
      onclick={() => selectMode("off")}
      title="No trails"
      aria-label="No trails"
    >
      <i class="fas fa-ban" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Tip assignment rows -->
  {#if mode === "tip"}
    <div class="endpoint-rows">
      {#if isSingleEnded}
        <!-- Single-ended props have one physical trail point -->
        <div class="endpoint-row">
          <span class="endpoint-label">Tip</span>
          <div class="chip-row" role="radiogroup" aria-label="Trail tip point">
            {#each editorState.points as tipPt, i}
              <button
                class="chip chip-tip"
                class:active={leftTipIndex === i}
                role="radio"
                aria-checked={leftTipIndex === i}
                onclick={() => selectTip("left", i)}
                title="Tip {i + 1}: ({tipPt.dx}, {tipPt.dy})"
              >{i + 1}</button>
            {/each}
          </div>
        </div>
      {:else}
        <!-- Bilateral props have two ends -->
        <div class="endpoint-row">
          <span class="endpoint-label">End 1</span>
          <div class="chip-row" role="radiogroup" aria-label="Trail end 1">
            {#each editorState.points as tipPt, i}
              <button
                class="chip chip-tip"
                class:active={leftTipIndex === i}
                role="radio"
                aria-checked={leftTipIndex === i}
                onclick={() => selectTip("left", i)}
                title="Tip {i + 1}: ({tipPt.dx}, {tipPt.dy})"
              >{i + 1}</button>
            {/each}
          </div>
        </div>
        <div class="endpoint-row">
          <span class="endpoint-label">End 2</span>
          <div class="chip-row" role="radiogroup" aria-label="Trail end 2">
            {#each editorState.points as tipPt, i}
              <button
                class="chip chip-tip"
                class:active={rightTipIndex === i}
                role="radio"
                aria-checked={rightTipIndex === i}
                onclick={() => selectTip("right", i)}
                title="Tip {i + 1}: ({tipPt.dx}, {tipPt.dy})"
              >{i + 1}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Custom coordinate inputs -->
  {#if mode === "custom"}
    <div class="custom-section">
      <div class="endpoint-row">
        <span class="endpoint-label">{isSingleEnded ? "Tip" : "End 1"}</span>
        <div class="custom-coords">
          <label class="coord-field">
            <span class="coord-label">dx</span>
            <input
              type="number"
              class="coord-input"
              step="0.1"
              value={leftSource?.type === "custom" ? leftSource.dx : 0}
              onchange={(e) => handleCustomDxDy("left", "dx", (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="coord-field">
            <span class="coord-label">dy</span>
            <input
              type="number"
              class="coord-input"
              step="0.1"
              value={leftSource?.type === "custom" ? leftSource.dy : 0}
              onchange={(e) => handleCustomDxDy("left", "dy", (e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
      </div>
      {#if !isSingleEnded}
        <div class="endpoint-row">
          <span class="endpoint-label">End 2</span>
          <div class="custom-coords">
            <label class="coord-field">
              <span class="coord-label">dx</span>
              <input
                type="number"
                class="coord-input"
                step="0.1"
                value={rightSource?.type === "custom" ? rightSource.dx : 0}
                onchange={(e) => handleCustomDxDy("right", "dx", (e.target as HTMLInputElement).value)}
              />
            </label>
            <label class="coord-field">
              <span class="coord-label">dy</span>
              <input
                type="number"
                class="coord-input"
                step="0.1"
                value={rightSource?.type === "custom" ? rightSource.dy : 0}
                onchange={(e) => handleCustomDxDy("right", "dy", (e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .section {
    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
  }

  .section h3 {
    margin: 0 0 var(--spacing-xs, 4px);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
  }

  .section-desc {
    margin: 0 0 var(--spacing-sm, 8px);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Base chip */
  .chip {
    min-width: 36px;
    height: 36px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 120ms ease;
    user-select: none;
  }

  .chip:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, white);
    background: rgba(255, 255, 255, 0.04);
  }

  .chip:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 1px;
  }

  /* Active state - glowing accent */
  .chip.active {
    border-color: var(--theme-accent, #8b5cf6);
    color: var(--theme-accent, #8b5cf6);
    background: color-mix(in srgb, var(--theme-accent, #8b5cf6) 12%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #8b5cf6) 25%, transparent);
  }

  /* Numbered tip chips */
  .chip-tip {
    min-width: 36px;
    font-weight: 700;
    font-size: var(--font-size-min, 14px);
  }

  /* Off chip - red tint when active */
  .chip-off.active {
    border-color: var(--semantic-error, #ef4444);
    color: var(--semantic-error, #ef4444);
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
  }

  /* L/R endpoint rows */
  .endpoint-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: var(--spacing-sm, 8px);
  }

  .endpoint-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .endpoint-label {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    width: 40px;
    flex-shrink: 0;
    text-align: center;
  }

  /* Custom coordinate inputs */
  .custom-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: var(--spacing-sm, 8px);
  }

  .custom-coords {
    display: flex;
    gap: 6px;
    flex: 1;
  }

  .coord-field {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .coord-label {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  .coord-input {
    width: 100%;
    min-width: 0;
    height: 36px;
    padding: 6px 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: var(--border-radius-sm, 4px);
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.3));
    color: var(--theme-text, white);
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-min, 14px);
    text-align: right;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .coord-input::-webkit-inner-spin-button,
  .coord-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .coord-input:focus {
    outline: none;
    border-color: var(--theme-accent, #8b5cf6);
  }

  @media (prefers-reduced-motion: reduce) {
    .chip {
      transition: none;
    }
  }
</style>
