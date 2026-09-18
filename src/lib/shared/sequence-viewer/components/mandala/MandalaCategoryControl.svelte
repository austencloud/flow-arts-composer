<!--
  MandalaCategoryControl.svelte

  The per-category control body for one mandala dock category — extracted
  verbatim from MandalaControlDock so the SAME markup powers both the bottom
  dock (mobile/standalone) and the Art-mode right sidebar's IconRailNav.

  Pass `category` to pick which body renders; all bodies drive the supplied
  `ctrl` (MandalaViewerController). Layout chrome (the tray slide-in, the
  category bar) stays in the consumer — this component is JUST the inner
  control for the active category, so both consumers share identical behavior.
-->
<script lang="ts">
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { MandalaViewerController } from "../../state/mandala-viewer-controller.svelte";
  import type {
    MandalaPathShape,
    MandalaPresetId,
    MandalaRenderOptions,
  } from "$lib/shared/mandala/domain/mandala-types";
  import {
    PRESET_COLORS,
    mixColors,
    withAlpha,
  } from "$lib/shared/mandala/domain/mandala-palette";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import LabeledColorPairPicker from "$lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import MandalaPreviewOption from "./MandalaPreviewOption.svelte";

  /** "download" holds the export config (loops / fidelity / fps + estimate). */
  export type MandalaCategory =
    | "speed"
    | "shape"
    | "spin"
    | "colors"
    | "weight"
    | "depth"
    | "download";

  interface Props {
    ctrl: MandalaViewerController;
    category: MandalaCategory;
    /**
     * The download body's "Export MP4" button — the dock closes its tray before
     * exporting, the sidebar doesn't have a tray to close. When omitted, the
     * button just calls `ctrl.startExport()`.
     */
    onExport?: () => void;
    /** Hide the inline "Export MP4" button (the stacked sidebar pins its own
     *  footer export, so the download section shows config only). Default true. */
    showExportButton?: boolean;
    /** Optional semantic sink used by scan analytics. */
    onSettingChange?: (
      group: string,
      setting: string,
      previousValue: string | number | boolean | null,
      value: string | number | boolean | null,
      coalesce?: boolean
    ) => void;
  }
  let {
    ctrl,
    category,
    onExport,
    showExportButton = true,
    onSettingChange,
  }: Props = $props();

  type AnalyticsValue = string | number | boolean | null;
  function reportSetting(
    setting: string,
    previousValue: AnalyticsValue,
    value: AnalyticsValue,
    coalesce = false
  ): void {
    if (previousValue === value) return;
    onSettingChange?.("art_mandala", setting, previousValue, value, coalesce);
  }

  function changeSetting(
    setting: string,
    previousValue: AnalyticsValue,
    value: AnalyticsValue,
    mutate: () => void,
    coalesce = false
  ): void {
    mutate();
    reportSetting(setting, previousValue, value, coalesce);
  }

  // Reduced-motion gate for the JS (Svelte) transitions reused from the dock.
  let reduceMotion = $state(false);
  $effect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const onChange = () => (reduceMotion = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  /**
   * Stroke width for the option thumbnails. The renderer takes stroke width in
   * the same user units as its viewBox, so the production 2.5 on a 500px
   * mandala is 0.5% of the width — at a 56px tile that is a third of a pixel.
   * 0.8 reads as a line at tile size while keeping the four shapes comparable
   * to each other, which is the only comparison the tiles are asked to make.
   */
  const PREVIEW_STROKE = 1;

  /**
   * The tiles wear the chosen palette so they read as previews of THIS mandala,
   * but they take the preset's two fixed colors rather than `ctrl.palette` —
   * that one is sampled from the colour phase and changes every frame in flow
   * mode, which would re-render four SVGs at 60fps to animate a thumbnail
   * nobody is watching.
   */
  const previewPalette = $derived.by(() => {
    const [a, b] = ctrl.accentPair;
    const mix = mixColors(a, b);
    return {
      leftStroke: a,
      leftFill: withAlpha(a, 0.15),
      rightStroke: b,
      rightFill: withAlpha(b, 0.15),
      purpleStroke: mix,
      purpleFill: withAlpha(mix, 0.2),
    };
  });

  const PATH_SHAPES: { id: MandalaPathShape; label: string }[] = [
    { id: "arc", label: "Arc" },
    { id: "linear", label: "Linear" },
    { id: "concave", label: "Concave" },
    { id: "hybrid", label: "Hybrid" },
  ];
  const STROKE_WIDTHS: { value: number; label: string }[] = [
    { value: 1, label: "Thin" },
    { value: 2.5, label: "Normal" },
    { value: 4, label: "Thick" },
  ];
  type MotionMode = "static" | "animated";
  const MOTION_OPTIONS: { value: MotionMode; label: string }[] = [
    { value: "static", label: "Static" },
    { value: "animated", label: "Animated" },
  ];
  const SHOW_OPTIONS: {
    value: MandalaRenderOptions["show"];
    label: string;
    tone: "blue" | "red" | "accent";
  }[] = [
		{ value: "left", label: "Left", tone: "blue" },
    { value: "both", label: "Both", tone: "accent" },
		{ value: "right", label: "Right", tone: "red" },
  ];
  const motionMode = $derived<MotionMode>(ctrl.paused ? "static" : "animated");
  // Derived from PRESET_COLORS (the single source of truth) so a preset added
  // there is automatically selectable here — no second list to drift out of
  // sync (this list previously hardcoded a stale 4-of-6 subset).
  const PRESETS: { id: MandalaPresetId; label: string }[] = (
    Object.keys(PRESET_COLORS) as Exclude<MandalaPresetId, "custom">[]
  ).map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
  const presetLabel = $derived(
    PRESETS.find((p) => p.id === ctrl.preset)?.label ?? "Custom"
  );

  const FIDELITIES: { value: 720 | 1080 | 2160; label: string }[] = [
    { value: 720, label: "HD" },
    { value: 1080, label: "Full HD" },
    { value: 2160, label: "4K" },
  ];
  const EXPORT_FPS: (30 | 60)[] = [30, 60];

  function formatEstimate(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  const estimateLabel = $derived(
    `${ctrl.hasMetrics ? "~" : "≈"}${formatEstimate(ctrl.estimateSeconds)}`
  );

  // Hidden native color inputs (styled chips trigger the OS picker).
  let presetsOpen = $state(false);

  function handleExport() {
    if (onExport) onExport();
    else ctrl.startExport();
  }

  function handleMotionChange(value: MotionMode): void {
    changeSetting(
      "motion",
      motionMode,
      value,
      () => (ctrl.paused = value === "static")
    );
  }

  function handleShowChange(value: MandalaRenderOptions["show"]): void {
    changeSetting("show", ctrl.show, value, () => (ctrl.show = value));
  }
</script>

{#if category === "speed"}
  <div
    class="tray-stack"
    transition:slide|local={{ duration: dur(220), easing: cubicOut }}
  >
    <div class="control-field">
      <span class="control-label">Motion</span>
      <SegmentedControl
        options={MOTION_OPTIONS}
        value={motionMode}
        onchange={handleMotionChange}
        color="accent"
        size="sm"
      />
    </div>
    {#if !ctrl.paused}
      <div class="tray-slider">
        <input
          type="range"
          min="0.25"
          max="3"
          step="0.05"
          value={ctrl.speed}
          oninput={(e) => {
            const value = Number((e.target as HTMLInputElement).value);
            changeSetting(
              "speed",
              ctrl.speed,
              value,
              () => (ctrl.speed = value),
              true
            );
          }}
          class="slider"
          aria-label="Undulation speed"
        />
        <span class="slider-value">{ctrl.speed.toFixed(2)}x</span>
      </div>
    {/if}
  </div>
{:else if category === "shape"}
  <!-- Four words nobody can rank without trying them, replaced by four
       mandalas of the sequence on screen. The stroke is drawn heavier than the
       real render because a 0.5%-of-width hairline is sub-pixel at this size;
       everything that carries the difference — the path geometry — is the
       renderer's own. -->
  <div
    class="tray-previews"
    transition:slide|local={{ duration: dur(220), easing: cubicOut }}
  >
    {#each PATH_SHAPES as sh}
      <MandalaPreviewOption
        sequence={ctrl.sequence}
        label={sh.label}
        active={ctrl.pathShape === sh.id}
        pathShape={sh.id}
        strokeWidth={PREVIEW_STROKE}
        size={72}
        show={ctrl.show}
        palette={previewPalette}
        leftPropType={ctrl.leftPropType}
        rightPropType={ctrl.rightPropType}
        onselect={() =>
          changeSetting(
            "path_shape",
            ctrl.pathShape,
            sh.id,
            () => (ctrl.pathShape = sh.id)
          )}
      />
    {/each}
  </div>
{:else if category === "spin"}
  <div
    class="tray-slider"
    transition:slide|local={{ duration: dur(220), easing: cubicOut }}
  >
    <input
      type="range"
      min="0"
      max="360"
      step="15"
      value={ctrl.rotation}
      oninput={(e) => {
        const value = Number((e.target as HTMLInputElement).value);
        changeSetting(
          "rotation",
          ctrl.rotation,
          value,
          () => (ctrl.rotation = value),
          true
        );
      }}
      class="slider"
      aria-label="Spin"
    />
    <span class="slider-value">{ctrl.rotation}°</span>
  </div>
{:else if category === "colors"}
  <div
    class="tray-colors"
    transition:slide|local={{ duration: dur(220), easing: cubicOut }}
  >
    <div class="control-field">
      <span class="control-label">Show</span>
      <SegmentedControl
        options={SHOW_OPTIONS}
        value={ctrl.show}
        onchange={handleShowChange}
        color="accent"
        size="sm"
      />
    </div>
    <div class="colors-head">
      <div class="mode-toggle">
        <button
          class="chip mini"
          class:active={ctrl.colorMode === "solid"}
          onclick={() =>
            changeSetting(
              "color_mode",
              ctrl.colorMode,
              "solid",
              () => (ctrl.colorMode = "solid")
            )}
          aria-pressed={ctrl.colorMode === "solid"}>Solid</button
        >
        <button
          class="chip mini"
          class:active={ctrl.colorMode === "flow"}
          onclick={() =>
            changeSetting(
              "color_mode",
              ctrl.colorMode,
              "flow",
              () => (ctrl.colorMode = "flow")
            )}
          aria-pressed={ctrl.colorMode === "flow"}>Flow</button
        >
      </div>
      <button
        class="palette-toggle"
        onclick={() => (presetsOpen = !presetsOpen)}
        aria-expanded={presetsOpen}
        aria-label="Choose palette"
      >
        <span
          class="palette-chip"
          style:background={ctrl.previewGradient(ctrl.preset)}
        ></span>
        <span class="palette-name">{presetLabel}</span>
        <i
          class="fas fa-chevron-{presetsOpen ? 'up' : 'down'}"
          aria-hidden="true"
        ></i>
      </button>
    </div>
    {#if presetsOpen}
      <div
        class="preset-row"
        transition:slide|local={{ duration: dur(240), easing: cubicOut }}
      >
        {#each PRESETS as p}
          <button
            class="swatch"
            class:active={ctrl.preset === p.id}
            onclick={() => {
              changeSetting(
                "palette",
                ctrl.preset,
                p.id,
                () => (ctrl.preset = p.id)
              );
              presetsOpen = false;
            }}
            aria-label={p.label}
            aria-pressed={ctrl.preset === p.id}
          >
            <span
              class="swatch-fill"
              style:background={ctrl.previewGradient(p.id)}
            ></span>
            <span class="swatch-label">{p.label}</span>
          </button>
        {/each}
        <button
          class="swatch custom"
          class:active={ctrl.preset === "custom"}
          onclick={() => {
            changeSetting(
              "palette",
              ctrl.preset,
              "custom",
              () => (ctrl.preset = "custom")
            );
            presetsOpen = false;
          }}
          aria-label="Custom colors"
          aria-pressed={ctrl.preset === "custom"}
        >
          <span
            class="swatch-fill"
            style:background={ctrl.previewGradient("custom")}
          >
            <i class="fas fa-eye-dropper" aria-hidden="true"></i>
          </span>
          <span class="swatch-label">Custom</span>
        </button>
      </div>
    {/if}
    {#if ctrl.preset === "custom"}
      <div
        class="custom-flow"
        transition:slide|local={{ duration: dur(240), easing: cubicOut }}
      >
        <span
          class="flow-preview"
          style:background={ctrl.previewGradient("custom")}
          aria-hidden="true"
        ></span>
        <LabeledColorPairPicker
          left={ctrl.customLeft}
          right={ctrl.customRight}
          leftLabel="Left pathway"
          rightLabel="Right pathway"
          groupLabel="Pathway colors"
          onchange={(hand, value) => {
            if (hand === "left") ctrl.customLeft = value;
            else ctrl.customRight = value;
            reportSetting(
              hand === "left" ? "custom_color_a" : "custom_color_b",
              "custom",
              "changed",
              true
            );
          }}
          onswap={() => {
            const left = ctrl.customLeft;
            ctrl.customLeft = ctrl.customRight;
            ctrl.customRight = left;
          }}
        />
      </div>
    {/if}
  </div>
{:else if category === "weight"}
  <!-- A stroke sample, not a mandala. At thumbnail size the real line is half
       a pixel wide, so three mandalas would look identical; three arcs at the
       ratio between the widths show the actual difference. -->
  <div
    class="tray-previews"
    transition:slide|local={{ duration: dur(220), easing: cubicOut }}
  >
    {#each STROKE_WIDTHS as sw}
      <button
        type="button"
        class="preview-option"
        class:active={ctrl.lineWeight === sw.value}
        aria-pressed={ctrl.lineWeight === sw.value}
        onclick={() =>
          changeSetting(
            "line_weight",
            ctrl.lineWeight,
            sw.value,
            () => (ctrl.lineWeight = sw.value)
          )}
      >
        <span class="thumb">
          <svg viewBox="0 0 72 72" aria-hidden="true">
            <circle
              cx="36"
              cy="36"
              r="22"
              fill="none"
              stroke={ctrl.accentPair[0]}
              stroke-width={sw.value * 1.6}
            />
            <circle
              cx="36"
              cy="36"
              r="11"
              fill="none"
              stroke={ctrl.accentPair[1]}
              stroke-width={sw.value * 1.6}
            />
          </svg>
        </span>
        <span class="caption">{sw.label}</span>
      </button>
    {/each}
  </div>
{:else if category === "depth"}
  <div
    class="tray-slider"
    transition:slide|local={{ duration: dur(220), easing: cubicOut }}
  >
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={ctrl.depth}
      oninput={(e) => {
        const value = Number((e.target as HTMLInputElement).value);
        changeSetting(
          "depth",
          ctrl.depth,
          value,
          () => (ctrl.depth = value),
          true
        );
      }}
      class="slider"
      aria-label="Depth"
    />
    <span class="slider-value">{ctrl.depth}%</span>
  </div>
{:else if category === "download"}
  <div class="download-tray">
    <div class="dl-row">
      <span class="dl-label">Loops</span>
      <input
        type="range"
        min="1"
        max="10"
        step="1"
        value={ctrl.exportReps}
        oninput={(e) => {
          const value = Number((e.target as HTMLInputElement).value);
          changeSetting(
            "export_loops",
            ctrl.exportReps,
            value,
            () => (ctrl.exportReps = value),
            true
          );
        }}
        class="slider"
        aria-label="Repetitions"
      />
      <span class="slider-value">{ctrl.exportReps}×</span>
    </div>
    <div class="dl-row">
      <span class="dl-label">Fidelity</span>
      <div class="tray-chips">
        {#each FIDELITIES as f}
          <button
            class="chip"
            class:active={ctrl.exportResolution === f.value}
            onclick={() =>
              changeSetting(
                "export_resolution",
                ctrl.exportResolution,
                f.value,
                () => (ctrl.exportResolution = f.value)
              )}
            aria-pressed={ctrl.exportResolution === f.value}>{f.label}</button
          >
        {/each}
      </div>
    </div>
    <div class="dl-row">
      <span class="dl-label">FPS</span>
      <div class="tray-chips">
        {#each EXPORT_FPS as f}
          <button
            class="chip"
            class:active={ctrl.exportFps === f}
            onclick={() =>
              changeSetting(
                "export_fps",
                ctrl.exportFps,
                f,
                () => (ctrl.exportFps = f)
              )}
            aria-pressed={ctrl.exportFps === f}>{f}</button
          >
        {/each}
      </div>
    </div>
    <div class="dl-foot">
      <span class="dl-estimate"
        ><i class="fas fa-clock" aria-hidden="true"></i>
        {estimateLabel} · {ctrl.exportFrameCount} frames</span
      >
      {#if showExportButton}
        <button class="dl-export" onclick={handleExport}>
          <i class="fas fa-film" aria-hidden="true"></i> Export MP4
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* These styles are copied verbatim from MandalaControlDock so both consumers
     render the controls identically. */
  .tray-chips {
    display: flex;
    gap: 6px;
  }

  /* One row, always — four shapes that wrap to 3 + 1 stop being a comparison.
     Equal auto columns shrink the tiles on a phone instead of orphaning one. */
  .tray-previews {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 8px;
    justify-items: center;
  }

  /* The weight samples are drawn here rather than by MandalaPreviewOption, so
     they carry that component's tile styling locally. */
  .preview-option {
    display: grid;
    justify-items: center;
    width: 100%;
    min-width: 0;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid transparent;
    border-radius: 0.625rem;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      color 140ms ease;
  }
  .preview-option .thumb {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 72px;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 0.5rem;
    background: #05060a;
    box-shadow: inset 0 0 0 1px var(--theme-stroke, rgba(255, 255, 255, 0.09));
  }
  .preview-option .thumb svg {
    width: 100%;
    height: 100%;
  }
  .preview-option:hover {
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #4cc9f0) 10%,
      transparent
    );
  }
  .preview-option.active {
    border-color: var(--theme-accent, #4cc9f0);
    background: color-mix(
      in srgb,
      var(--theme-accent, #4cc9f0) 16%,
      transparent
    );
    color: var(--theme-text, #fff);
  }
  .preview-option.active .thumb {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #4cc9f0) 60%, transparent);
  }
  .preview-option:focus-visible {
    outline: 2px solid var(--theme-accent, #4cc9f0);
    outline-offset: 2px;
  }
  .preview-option .caption {
    line-height: 1.1;
    white-space: nowrap;
  }
  .tray-stack,
  .control-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .control-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tray-slider {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tray-colors {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .colors-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .mode-toggle {
    display: flex;
    gap: 6px;
  }
  .palette-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    min-height: 36px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 70%,
      transparent
    );
    color: var(--theme-text, #fff);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 180ms ease,
      background 180ms ease,
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .palette-toggle:active {
    transform: scale(0.95);
  }
  .palette-chip {
    width: 28px;
    height: 18px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
  }
  .palette-name {
    font-size: 12px;
    font-weight: 600;
  }
  .palette-toggle i {
    font-size: 10px;
    opacity: 0.55;
  }
  /* 10 swatches (9 presets + custom) no longer fit one row at tray widths —
     wrap instead of shrinking below the 44px touch-target floor. */
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .custom-flow {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .flow-preview {
    display: block;
    width: 100%;
    height: 14px;
    border-radius: 999px;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .chip {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 8px 6px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 70%,
      transparent
    );
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background 200ms ease,
      border-color 200ms ease,
      color 200ms ease,
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .chip:active {
    transform: scale(0.94);
  }
  .chip.mini {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 6px 14px;
    font-size: 12px;
  }
  .chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 60%,
      transparent
    );
    color: white;
  }

  .swatch {
    flex: 1 1 64px;
    min-width: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .swatch-fill {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 40px;
    border-radius: 10px;
    border: 2px solid transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease,
      transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .swatch:active .swatch-fill {
    transform: scale(0.93);
  }
  .swatch.active .swatch-fill {
    border-color: white;
    transform: translateY(-2px);
    box-shadow:
      0 0 0 2px
        color-mix(in srgb, var(--theme-accent, #6366f1) 60%, transparent),
      0 6px 16px rgba(0, 0, 0, 0.4);
  }
  .swatch-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }
  .swatch.active .swatch-label {
    color: var(--theme-text, white);
  }

  .slider {
    flex: 1;
    height: 6px;
    appearance: none;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    cursor: pointer;
  }
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--theme-accent, #6366f1);
    border: 2px solid var(--theme-panel-bg, rgba(10, 10, 26, 0.9));
    cursor: pointer;
  }
  .slider-value {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
    min-width: 44px;
    text-align: right;
  }

  /* Download config tray */
  .download-tray {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .dl-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .dl-label {
    flex: 0 0 64px;
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }
  .dl-row .tray-chips {
    flex: 1;
  }
  .dl-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 2px;
  }
  .dl-estimate {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }
  .dl-estimate i {
    font-size: 11px;
    opacity: 0.7;
  }
  .dl-export {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 18px;
    border-radius: 12px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 70%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1),
      box-shadow 200ms ease,
      background 200ms ease;
  }
  .dl-export:active {
    transform: scale(0.95);
  }

  /* Staggered entrance for tray controls. */
  .tray-chips > *,
  .preset-row > *,
  .mode-toggle > *,
  .custom-flow > * {
    animation: popIn 340ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  }
  .tray-chips > *:nth-child(2),
  .preset-row > *:nth-child(2) {
    animation-delay: 45ms;
  }
  .tray-chips > *:nth-child(3),
  .preset-row > *:nth-child(3) {
    animation-delay: 90ms;
  }
  .tray-chips > *:nth-child(4),
  .preset-row > *:nth-child(4) {
    animation-delay: 135ms;
  }
  .preset-row > *:nth-child(5) {
    animation-delay: 180ms;
  }
  .preset-row > *:nth-child(6) {
    animation-delay: 225ms;
  }
  .preset-row > *:nth-child(7) {
    animation-delay: 270ms;
  }
  .preset-row > *:nth-child(8) {
    animation-delay: 315ms;
  }
  .preset-row > *:nth-child(9) {
    animation-delay: 360ms;
  }
  .preset-row > *:nth-child(10) {
    animation-delay: 405ms;
  }
  .custom-flow > *:nth-child(2) {
    animation-delay: 60ms;
  }
  @keyframes popIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (hover: hover) {
    .chip:hover:not(.active) {
      background: color-mix(
        in srgb,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 88%,
        white 8%
      );
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 35%,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
      color: var(--theme-text, #fff);
    }
    .swatch:hover .swatch-fill {
      transform: translateY(-2px);
    }
    .palette-toggle:hover {
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 45%,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
      background: color-mix(
        in srgb,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 85%,
        white 6%
      );
    }
    .dl-export:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px
        color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tray-chips > *,
    .preset-row > *,
    .mode-toggle > *,
    .custom-flow > * {
      animation: none !important;
    }
    .chip:active,
    .swatch:active .swatch-fill {
      transform: none;
    }
    .dl-export:active {
      transform: none;
    }
  }
</style>
