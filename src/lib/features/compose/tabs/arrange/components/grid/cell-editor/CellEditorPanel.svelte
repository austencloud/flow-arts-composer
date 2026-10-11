<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { GridCell } from "../../../state/arrange-grid-state.svelte";
  import type {
    TransformType,
    CellMediaType,
    CellEffect,
    PropColors,
  } from "#lib/shared/animation-engine/domain/compose-types.js";
  import type {
    TipEffectMap,
    TipEffortMap,
  } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import type { PillId } from "#lib/shared/animation-panel/pill-nav/pill-types.js";
  import { buildPillSpecs } from "#lib/shared/animation-panel/pill-nav/pill-types.js";
  import IconRailNav from "#lib/shared/animation-panel/pill-nav/IconRailNav.svelte";
  import {
    EFFECT_COLORS,
    effectNavIcon,
  } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import ScopeBreadcrumb, {
    type BreadcrumbSegment,
  } from "./ScopeBreadcrumb.svelte";
  import {
    createCellEditorPanelState,
    type ScopeLevel,
  } from "./state/cell-editor-panel-state.svelte";
  import LayerSection from "./LayerSection.svelte";
  import TransformSection from "./sections/TransformSection.svelte";
  import SpeedSection from "./sections/SpeedSection.svelte";
  import ColorsSection from "./sections/ColorsSection.svelte";
  import UnifiedEffectsSection from "./sections/UnifiedEffectsSection.svelte";
  import UnifiedEffortSection from "./sections/UnifiedEffortSection.svelte";
  import OffsetSection from "./sections/OffsetSection.svelte";
  import DisplaySection from "./sections/DisplaySection.svelte";
  import GridLayoutControls from "../GridLayoutControls.svelte";

  type PresetLayoutType =
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

  interface Props {
    // Grid layout
    gridRows: number;
    gridCols: number;
    hasContent: boolean;
    onSetGridRows: (n: number) => void;
    onSetGridCols: (n: number) => void;
    onSetDimensions: (rows: number, cols: number) => void;
    onPresetLayout: (preset: PresetLayoutType) => void;

    // Cell editor (null when no cell selected)
    cell: GridCell | null;
    cellIndex: number;
    clipboardHasData?: boolean;
    transformingLayer?: { cellId: string; layerIndex: number } | null;
    onAddSequence: () => void;
    onRemoveLayer: (layerIndex: number) => void;
    onEditLayerOffset: (layerIndex: number) => void;
    onClearCell: () => void;
    onMediaTypeChange: (mediaType: CellMediaType) => void;
    onCopyLayer?: (layerIndex: number) => void;
    onCopyCell?: () => void;
    onPasteLayer?: () => void;
    onTransformLayer?: (
      layerIndex: number,
      transformType: TransformType
    ) => void;
    onSetSpeed?: (speed: number) => void;
    onSetEffect?: (effect: CellEffect) => void;
    onSetTrailMode?: (mode: TrailMode) => void;
    onSetEffort?: (effort: string) => void;
    onSetColors?: (colors: PropColors) => void;
    onSetLeftVisible?: (visible: boolean) => void;
    onSetRightVisible?: (visible: boolean) => void;
    onSetOffset?: (offset: number) => void;
    onSetTipEffectMap?: (map: TipEffectMap) => void;
    onSetTipEffortMap?: (map: TipEffortMap) => void;
  }

  const p: Props = $props();
  const cell = $derived(p.cell);
  const cellIndex = $derived(p.cellIndex);
  const clipboardHasData = $derived(p.clipboardHasData ?? false);
  const transformingLayer = $derived(p.transformingLayer ?? null);

  const panelState = createCellEditorPanelState();

  // Auto-switch to grid pill when cell deselected, effects when selected
  let prevCellId: string | null = null;
  $effect(() => {
    const id = cell?.id ?? null;
    if (id !== prevCellId) {
      if (id === null) {
        panelState.setActivePill("grid");
      } else if (prevCellId === null) {
        panelState.setActivePill("effects");
      }
      if (id !== null && prevCellId !== null) {
        panelState.resetForNewCell();
      }
      prevCellId = id;
    }
  });

  const gridSummary = $derived(`${p.gridCols}×${p.gridRows}`);

  const effectsSummary = $derived(
    cell?.effect && cell.effect !== "none"
      ? cell.effect.charAt(0).toUpperCase() + cell.effect.slice(1)
      : "None"
  );

  // The pill shows the chosen effect itself — its glyph and its color — the
  // same way the Props pill shows the chosen prop. The wand is the "none" state.
  const effectsIcon = $derived(effectNavIcon(cell?.effect));
  const effectsAccent = $derived(
    cell?.effect ? EFFECT_COLORS[cell.effect] : undefined
  );

  const effortLabel = $derived(cell?.effort ?? "Linear");
  const colorLabel = $derived.by(() => {
    const colors = cell?.layers[0]?.propColors;
    if (!colors) return "Blue/Red";
    const labels: Record<string, string> = {
      "#3b82f6": "Blue/Red",
      "#a855f7": "Purple/Orange",
      "#10b981": "Emerald/Pink",
      "#06b6d4": "Cyan/Yellow",
    };
    return labels[colors.left] ?? "Custom";
  });
  const styleSummary = $derived(`${effortLabel} · ${colorLabel}`);

  const playbackSummary = $derived(
    `${(cell?.speedMultiplier ?? 1).toFixed(1)}x · +${cell?.beatOffset ?? 0}`
  );

  const displaySummary = $derived(
    cell?.mediaType === "choreo-card" ? "Card" : "Anim"
  );

  const effortAccent = $derived.by(() => {
    if (!cell?.effort || cell.effort === "none") return "#94a3b8";
    const colors: Record<string, string> = {
      linear: "#94a3b8",
      smooth: "#60a5fa",
      sharp: "#f97316",
      bounce: "#a855f7",
      elastic: "#34d399",
    };
    return colors[cell.effort] ?? "#94a3b8";
  });

  const layersSummary = $derived(cell ? `${cell.layers.length}/4` : "0/4");

  const pillSpecs = $derived(
    buildPillSpecs({
      grid: { icon: "fa-th", label: "GRID", summary: gridSummary },
      layers: {
        icon: "fa-layer-group",
        label: "LAYERS",
        summary: layersSummary,
      },
      effects: {
        icon: effectsIcon,
        label: "EFFECTS",
        summary: effectsSummary,
        accentColor: effectsAccent,
      },
      effort: {
        label: "STYLE",
        summary: styleSummary,
        accentColor: effortAccent,
      },
      playback: {
        icon: "fa-play",
        label: "PLAYBACK",
        summary: playbackSummary,
      },
      display: { icon: "fa-eye", label: "DISPLAY", summary: displaySummary },
    })
  );

  // ── Breadcrumb ──

  const pillLabels: Record<PillId, string> = {
    grid: "Grid",
    layers: "Layers",
    props: "Props",
    effects: "Effects",
    effort: "Style",
    playback: "Playback",
    display: "Display",
    export: "Export",
  };

  const breadcrumbSegments = $derived.by<BreadcrumbSegment[]>(() => {
    const rootLabel = pillLabels[panelState.activePill] ?? "Grid";
    const segs: BreadcrumbSegment[] = [{ level: "grid", label: rootLabel }];
    if (cell) {
      segs.push({ level: "cell", label: `Cell ${cellIndex + 1}` });
      if (
        panelState.scopeLevel === "layer" ||
        panelState.scopeLevel === "hand" ||
        panelState.scopeLevel === "tip"
      ) {
        segs.push({ level: "layer", label: "L1" });
      }
    }
    return segs;
  });

  function handleBreadcrumbNav(level: ScopeLevel) {
    panelState.setScopeLevel(level);
    if (level === "grid") {
      panelState.setActivePill("grid");
    }
  }

  // ── Handlers ──

  function handleTransform(type: TransformType) {
    p.onTransformLayer?.(0, type);
  }

  function handleToggleLeftVisibility() {
    if (!cell) return;
    p.onSetLeftVisible?.(cell.leftMotionVisible === false);
  }

  function handleToggleRightVisibility() {
    if (!cell) return;
    p.onSetRightVisible?.(cell.rightMotionVisible === false);
  }

  const leftVisible = $derived(cell ? cell.leftMotionVisible !== false : true);
  const rightVisible = $derived(
    cell ? cell.rightMotionVisible !== false : true
  );

  function handleKeydown(e: KeyboardEvent) {
    if (!cell) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    const key = e.key.toLowerCase();
    const shift = e.shiftKey;
    const map: Record<string, TransformType> = {
      m: "mirror",
      v: "flip",
      s: "swapHands",
      i: "invert",
      f: "shiftStart",
    };
    if (shift && key === "r") {
      handleTransform("rewind");
      e.preventDefault();
    } else if (map[key]) {
      handleTransform(map[key]);
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="cell-editor-rail-layout">
  <IconRailNav
    pills={pillSpecs}
    activeId={panelState.activePill}
    onSelect={(id) => panelState.setActivePill(id)}
  />

  <div class="cell-editor-main">
    <ScopeBreadcrumb
      segments={breadcrumbSegments}
      onNavigate={handleBreadcrumbNav}
    />

    {#if panelState.activePill === "grid"}
      <!-- Grid layout controls -->
      <div
        class="pill-body-scroll"
        role="region"
        aria-label={t("compose_ui_grid_settings")}
      >
        <GridLayoutControls
          gridRows={p.gridRows}
          gridCols={p.gridCols}
          hasContent={p.hasContent}
          onSetGridRows={p.onSetGridRows}
          onSetGridCols={p.onSetGridCols}
          onSetDimensions={p.onSetDimensions}
          onPresetLayout={p.onPresetLayout}
        />
      </div>
    {:else if cell}
      {#if panelState.activePill === "layers"}
        <div
          class="pill-body-scroll"
          role="region"
          aria-label={t("compose_ui_layer_management")}
        >
          <LayerSection
            {cell}
            {clipboardHasData}
            {transformingLayer}
            onAddSequence={p.onAddSequence}
            onRemoveLayer={p.onRemoveLayer}
            onCopyLayer={p.onCopyLayer}
            onPasteLayer={p.onPasteLayer}
          />
        </div>
      {:else if cell.layers.length > 0}
        <div
          class="pill-body-scroll"
          role="region"
          aria-label="{panelState.activePill} settings"
        >
          {#if panelState.activePill === "effects"}
            <UnifiedEffectsSection
              currentEffect={cell.effect ?? "none"}
              currentTrailMode={cell.trailMode}
              currentMap={cell.tipEffectMap ?? {}}
              leftPropType="staff"
              rightPropType="staff"
              onSetEffect={(effect) => p.onSetEffect?.(effect)}
              onSetTrailMode={(mode) => p.onSetTrailMode?.(mode)}
              onUpdateMap={(map) => p.onSetTipEffectMap?.(map)}
            />
          {:else if panelState.activePill === "effort"}
            <div class="style-sections">
              <TransformSection {panelState} onTransform={handleTransform} />
              <ColorsSection
                currentColors={cell.layers[0]?.propColors ?? {
                  left: "#3b82f6",
                  right: "#ef4444",
                }}
                onSetColors={(colors) => p.onSetColors?.(colors)}
              />
              <UnifiedEffortSection
                currentEffort={cell.effort}
                currentMap={cell.tipEffortMap ?? {}}
                leftPropType="staff"
                rightPropType="staff"
                onSetEffort={(effort) => p.onSetEffort?.(effort)}
                onUpdateMap={(map) => p.onSetTipEffortMap?.(map)}
              />
              <div class="visibility-section">
                <span class="section-label">VISIBILITY</span>
                <div class="visibility-row">
                  <button
                    type="button"
                    class="vis-btn"
                    class:active={leftVisible}
                    style:--vis-color="var(--semantic-info, #60a5fa)"
                    aria-pressed={leftVisible}
                    onclick={handleToggleLeftVisibility}
                  >
                    <i class="fas fa-eye" aria-hidden="true"></i> Blue
                  </button>
                  <button
                    type="button"
                    class="vis-btn"
                    class:active={rightVisible}
                    style:--vis-color="var(--semantic-error, #dc2626)"
                    aria-pressed={rightVisible}
                    onclick={handleToggleRightVisibility}
                  >
                    <i class="fas fa-eye" aria-hidden="true"></i> Red
                  </button>
                </div>
              </div>
            </div>
          {:else if panelState.activePill === "playback"}
            <SpeedSection
              currentSpeed={cell.speedMultiplier ?? 1.0}
              onSetSpeed={(speed) => p.onSetSpeed?.(speed)}
            />
            <OffsetSection
              currentOffset={cell.beatOffset}
              onSetOffset={(offset) => p.onSetOffset?.(offset)}
            />
          {:else if panelState.activePill === "display"}
            <DisplaySection
              currentMediaType={cell.mediaType}
              layerCount={cell.layers.length}
              onMediaTypeChange={(type) => p.onMediaTypeChange(type)}
            />
          {/if}
        </div>

        <div class="panel-footer">
          {#if p.onCopyCell}
            <button
              class="footer-btn copy-all-btn"
              type="button"
              onclick={p.onCopyCell}
            >
              <i class="fas fa-copy" aria-hidden="true"></i>
              Copy All
            </button>
          {/if}
          <button
            class="footer-btn clear-all-btn"
            type="button"
            onclick={p.onClearCell}
          >
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
            Clear All
          </button>
        </div>
      {:else}
        <div class="empty-state">
          <i class="fas fa-layer-group" aria-hidden="true"></i>
          <span>{t("compose_ui_no_sequences_yet")}</span>
          <button
            type="button"
            class="go-layers-btn"
            onclick={() => panelState.setActivePill("layers")}
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
            Add in Layers
          </button>
        </div>
      {/if}
    {:else}
      <div class="empty-state">
        <i class="fas fa-mouse-pointer" aria-hidden="true"></i>
        <span>{t("compose_ui_click_a_cell_to_edit")}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .cell-editor-rail-layout {
    display: flex;
    height: 100%;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: var(--surface-panel, #0f1119);
    container-type: inline-size;
    container-name: celleditorpanel;

    --chip-radius: 22px;
    --action-radius: 10px;
    --badge-radius: 4px;
    --surface-idle: rgba(255, 255, 255, 0.05);
    --surface-hover: rgba(255, 255, 255, 0.08);
    --surface-active-pct: 12%;
    --stroke-idle: rgba(255, 255, 255, 0.08);
    --stroke-hover: rgba(255, 255, 255, 0.15);
    --stroke-active-pct: 35%;
    --chip-gap: clamp(6px, 1.5cqi, 8px);
    --group-gap: clamp(10px, 2.5cqi, 14px);
    --section-gap: clamp(12px, 3cqi, 20px);
  }

  .cell-editor-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .pill-body-scroll {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .style-sections {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .visibility-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
  }

  .visibility-row {
    display: flex;
    gap: 6px;
  }

  .vis-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 44px;
    padding: 8px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.55);
    font-size: 12px;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }

  .vis-btn.active {
    background: color-mix(in srgb, var(--vis-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--vis-color) 30%, transparent);
    color: color-mix(in srgb, var(--vis-color) 100%, white 30%);
  }

  .vis-btn i {
    font-size: 11px;
  }

  .export-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .download-btn {
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #8b5cf6),
      var(--theme-accent-strong, #6d28d9)
    );
    color: white;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 150ms ease;
  }

  .download-btn:hover {
    opacity: 0.9;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.15);
    font-size: 12px;
    font-style: italic;
    padding: 10px;
  }

  .empty-state i {
    font-size: 18px;
    opacity: 0.5;
  }

  .go-layers-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 8px 16px;
    border-radius: 8px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 12%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 25%, transparent);
    color: color-mix(in srgb, var(--theme-accent, #8b5cf6) 90%, transparent);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .go-layers-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
  }

  .panel-footer {
    flex-shrink: 0;
    display: flex;
    gap: var(--chip-gap, 6px);
    padding: 8px 10px;
    border-top: 1px solid var(--stroke-idle, rgba(255, 255, 255, 0.08));
  }

  .footer-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: var(--action-radius, 10px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease;
  }

  .copy-all-btn {
    background: var(--surface-idle);
    border: 1px solid var(--stroke-idle);
    color: rgba(255, 255, 255, 0.6);
  }

  .copy-all-btn:hover {
    background: var(--surface-hover);
    border-color: var(--stroke-hover);
  }

  .clear-all-btn {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 6%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 60%, transparent);
  }

  .clear-all-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) var(--surface-active-pct),
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .vis-btn,
    .footer-btn,
    .download-btn {
      transition: none;
    }
  }
</style>
