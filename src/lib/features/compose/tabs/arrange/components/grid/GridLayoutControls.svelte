<!--
  GridLayoutControls.svelte — Grid pill content.
  Centered dimension readout + visual preset cards.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";

  type PresetType =
    | "single"
    | "vertical"
    | "horizontal"
    | "line"
    | "square"
    | "filmstrip"
    | "tower"
    | "hero-thumbs"
    | "main-banner"
    | "pip"
    | "split-half"
    | "quad"
    | "gallery";

  interface PresetCard {
    id: PresetType;
    label: string;
    dims: string;
    cols: number;
    rows: number;
    spans?: [number, number, number, number][];
  }

  let {
    gridRows,
    gridCols,
    hasContent,
    onSetGridRows,
    onSetGridCols,
    onSetDimensions,
    onPresetLayout,
  }: {
    gridRows: number;
    gridCols: number;
    hasContent: boolean;
    onSetGridRows: (n: number) => void;
    onSetGridCols: (n: number) => void;
    onSetDimensions: (rows: number, cols: number) => void;
    onPresetLayout: (preset: PresetType) => void;
  } = $props();

  const haptic = getHapticFeedback();
  const MAX_GRID = 8;

  const presets: PresetCard[] = [
    { id: "single", label: "Solo", dims: "1×1", cols: 1, rows: 1 },
    { id: "horizontal", label: "Duo", dims: "1×2", cols: 2, rows: 1 },
    { id: "vertical", label: "Stacked", dims: "2×1", cols: 1, rows: 2 },
    { id: "square", label: "Quad", dims: "2×2", cols: 2, rows: 2 },
    { id: "gallery", label: "Gallery", dims: "3×3", cols: 3, rows: 3 },
    { id: "filmstrip", label: "Strip", dims: "1×4", cols: 4, rows: 1 },
    {
      id: "hero-thumbs",
      label: "Hero",
      dims: "6×5",
      cols: 5,
      rows: 6,
      spans: [[0, 0, 5, 5]],
    },
    {
      id: "pip",
      label: "PiP",
      dims: "5×5",
      cols: 5,
      rows: 5,
      spans: [[0, 0, 4, 5]],
    },
    {
      id: "main-banner",
      label: "Banner",
      dims: "6×1",
      cols: 1,
      rows: 6,
      spans: [[0, 0, 1, 5]],
    },
  ];

  const presetDimensions: Record<string, { rows: number; cols: number }> = {
    single: { rows: 1, cols: 1 },
    horizontal: { rows: 1, cols: 2 },
    vertical: { rows: 2, cols: 1 },
    square: { rows: 2, cols: 2 },
    gallery: { rows: 3, cols: 3 },
    filmstrip: { rows: 1, cols: 4 },
    tower: { rows: 4, cols: 1 },
    "hero-thumbs": { rows: 6, cols: 5 },
    "main-banner": { rows: 6, cols: 6 },
    pip: { rows: 6, cols: 6 },
    "split-half": { rows: 4, cols: 2 },
    quad: { rows: 6, cols: 6 },
  };

  function isPresetActive(preset: PresetCard): boolean {
    const dims = presetDimensions[preset.id];
    return dims ? gridRows === dims.rows && gridCols === dims.cols : false;
  }

  function buildThumbCells(
    preset: PresetCard
  ): { col: number; row: number; w: number; h: number; hero: boolean }[] {
    const cells: {
      col: number;
      row: number;
      w: number;
      h: number;
      hero: boolean;
    }[] = [];
    const occupied = new Set<string>();
    if (preset.spans) {
      for (const [sc, sr, sw, sh] of preset.spans) {
        cells.push({ col: sc, row: sr, w: sw, h: sh, hero: true });
        for (let r = sr; r < sr + sh; r++)
          for (let c = sc; c < sc + sw; c++) occupied.add(`${c},${r}`);
      }
    }
    for (let r = 0; r < preset.rows; r++)
      for (let c = 0; c < preset.cols; c++)
        if (!occupied.has(`${c},${r}`))
          cells.push({ col: c, row: r, w: 1, h: 1, hero: false });
    return cells;
  }

  // Confirmation
  let pendingPreset = $state<PresetType | null>(null);
  let pendingDimensions = $state<{ rows: number; cols: number } | null>(null);
  const hasPending = $derived(
    pendingPreset !== null || pendingDimensions !== null
  );

  function handlePresetClick(preset: PresetCard) {
    haptic.trigger("selection");
    if (hasContent) {
      pendingPreset = preset.id;
      pendingDimensions = null;
    } else {
      onPresetLayout(preset.id);
    }
  }

  function applyDimChange(rows: number, cols: number) {
    if (rows === gridRows && cols === gridCols) return;
    haptic.trigger("selection");
    if (hasContent) {
      pendingDimensions = { rows, cols };
      pendingPreset = null;
    } else {
      onSetDimensions(rows, cols);
    }
  }

  function stepCols(d: number) {
    applyDimChange(gridRows, Math.max(1, Math.min(MAX_GRID, gridCols + d)));
  }
  function stepRows(d: number) {
    applyDimChange(Math.max(1, Math.min(MAX_GRID, gridRows + d)), gridCols);
  }

  function confirmChange() {
    haptic.trigger("warning");
    if (pendingPreset) {
      onPresetLayout(pendingPreset);
      pendingPreset = null;
    } else if (pendingDimensions) {
      onSetDimensions(pendingDimensions.rows, pendingDimensions.cols);
      pendingDimensions = null;
    }
  }

  function cancelChange() {
    pendingPreset = null;
    pendingDimensions = null;
  }
</script>

<div class="grid-layout-controls">
  <div class="dim-readout">
    <div class="dim-pair">
      <button
        class="dim-step"
        onclick={() => stepCols(-1)}
        disabled={gridCols <= 1}
        aria-label={t("compose_ui_fewer_columns")}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="dim-num">{gridCols}</span>
      <button
        class="dim-step"
        onclick={() => stepCols(1)}
        disabled={gridCols >= MAX_GRID}
        aria-label={t("compose_ui_more_columns")}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
    <span class="dim-x">×</span>
    <div class="dim-pair">
      <button
        class="dim-step"
        onclick={() => stepRows(-1)}
        disabled={gridRows <= 1}
        aria-label={t("compose_ui_fewer_rows")}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="dim-num">{gridRows}</span>
      <button
        class="dim-step"
        onclick={() => stepRows(1)}
        disabled={gridRows >= MAX_GRID}
        aria-label={t("compose_ui_more_rows")}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
  <div class="dim-labels">
    <span>columns</span>
    <span>rows</span>
  </div>

  <!-- ── Confirmation ── -->
  {#if hasPending}
    <div
      class="confirm-bar"
      role="alertdialog"
      aria-label={t("compose_ui_confirm_layout_change")}
    >
      <i class="fas fa-exclamation-triangle confirm-warn" aria-hidden="true"
      ></i>
      <span class="confirm-text">{t("compose_ui_clears_cells")}</span>
      <button class="confirm-btn cancel" onclick={cancelChange}
        >{t("action_cancel")}</button
      >
      <button class="confirm-btn apply" onclick={confirmChange}
        >{t("compose_ui_apply")}</button
      >
    </div>
  {/if}

  <div class="preset-grid">
    {#each presets as preset (preset.id)}
      {@const active = isPresetActive(preset)}
      {@const thumbCells = buildThumbCells(preset)}
      <button
        class="preset-card"
        class:active
        onclick={() => handlePresetClick(preset)}
        aria-label="{preset.label} layout ({preset.dims})"
        aria-pressed={active}
      >
        <div
          class="preset-thumb"
          class:tall={preset.rows > 3}
          style:grid-template-columns="repeat({preset.cols}, 1fr)"
          style:grid-template-rows="repeat({preset.rows}, 1fr)"
        >
          {#each thumbCells as c}
            <span
              class="thumb-cell"
              class:hero={c.hero}
              style:grid-column="{c.col + 1} / span {c.w}"
              style:grid-row="{c.row + 1} / span {c.h}"
            ></span>
          {/each}
        </div>
        <span class="preset-name">{preset.label}</span>
        <span class="preset-dims">{preset.dims}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .grid-layout-controls {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 10px;
  }

  .dim-readout {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0 2px;
  }

  .dim-pair {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    padding: 2px;
  }

  .dim-step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    transition:
      background 100ms ease,
      color 100ms ease;
  }

  .dim-step:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.8);
  }

  .dim-step:active:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    color: var(--theme-accent-light, #a78bfa);
  }

  .dim-step:disabled {
    opacity: 0.2;
    cursor: default;
  }

  .dim-step:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  .dim-num {
    min-width: 26px;
    text-align: center;
    font-size: 22px;
    font-weight: 800;
    color: white;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .dim-x {
    font-size: 14px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.2);
  }

  .dim-labels {
    display: flex;
    justify-content: center;
    /* Gap tuned so the 12px labels keep the same center positions under the
       two stepper pairs that the 9px labels had at 62px */
    gap: 52px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.22);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: -6px;
  }

  .confirm-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 6%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 18%, transparent);
    border-radius: 8px;
  }

  .confirm-warn {
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, transparent);
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }
  .confirm-text {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.55);
    flex: 1;
  }

  .confirm-btn {
    flex-shrink: 0;
    padding: 5px 10px;
    border: none;
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: background 100ms ease;
  }

  .confirm-btn.cancel {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .confirm-btn.apply {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      transparent
    );
    color: white;
  }

  @media (hover: hover) {
    .confirm-btn.cancel:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    }
    .confirm-btn.apply:hover {
      background: color-mix(
        in srgb,
        var(--semantic-error, #ef4444) 75%,
        transparent
      );
    }
  }

  .confirm-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .preset-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      transform 80ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .preset-card.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 12%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 40%,
      transparent
    );
    box-shadow:
      0 0 12px -2px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 25%, transparent),
      inset 0 1px 0
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 10%, transparent);
  }

  @media (hover: hover) {
    .preset-card:not(.active):hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
      border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    }
  }

  .preset-card:active {
    transform: scale(0.95);
  }

  .preset-card:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Thumbnails */
  .preset-thumb {
    display: grid;
    gap: 3px;
    width: 100%;
    aspect-ratio: 1.4;
  }

  .preset-thumb.tall {
    aspect-ratio: 0.9;
  }

  .thumb-cell {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 18%,
      transparent
    );
    border-radius: 3px;
    min-width: 0;
    min-height: 0;
  }

  .preset-card.active .thumb-cell {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 50%,
      transparent
    );
  }

  .preset-card.active .thumb-cell.hero {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 65%,
      transparent
    );
  }

  @media (hover: hover) {
    .preset-card:not(.active):hover .thumb-cell {
      background: color-mix(
        in srgb,
        var(--theme-accent, #8b5cf6) 28%,
        transparent
      );
    }
  }

  .preset-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1;
  }

  .preset-card.active .preset-name {
    color: rgba(255, 255, 255, 0.95);
  }

  .preset-dims {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.22);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .preset-card.active .preset-dims {
    color: color-mix(in srgb, var(--theme-accent, #8b5cf6) 70%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .preset-card,
    .dim-step,
    .confirm-btn {
      transition: none;
    }
  }
</style>
