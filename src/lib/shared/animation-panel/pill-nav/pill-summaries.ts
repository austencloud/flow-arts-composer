import { t } from "$lib/shared/i18n/i18n.svelte.js";

export function computePropsSummary(propLabel: string): string {
  return propLabel || "Staff";
}

/**
 * The nine toggles the Display page actually renders. `progressBar` is
 * deliberately absent: on screen it gated the whole transport rather than a
 * progress bar, so the transport became unconditional and the export-side
 * progress bar became an Export concern. Counting a switch this page no longer
 * offers made the denominator lie.
 */
export interface DisplayFlags {
  tkaGlyph: boolean;
  /** Hand timing-and-direction glyph. */
  elementalGlyph: boolean;
  /** Prop timing-and-direction glyph. */
  propElementalGlyph: boolean;
  stepNumbers: boolean;
  props: boolean;
  wordHeader: boolean;
  mandala: boolean;
  pathLines: boolean;
  grid: boolean;
}

/**
 * The Display pill counts what the canvas draws, and nothing else. It used to
 * append the path shape, from the era when path shape and visibility shared a
 * section; the shape is motion behavior and now lives under the Motion pill,
 * so reporting it here described a control the section no longer holds.
 * Denominator is arity-derived — adding a toggle updates it on its own.
 */
export function computeDisplaySummary(flags: DisplayFlags): string {
  const values = Object.values(flags);
  const on = values.filter(Boolean).length;
  return `${on} / ${values.length} visible`;
}

export function computeEffectsSummary(
  activeEffect: string,
  labels: Record<string, string>
): string {
  if (typeof activeEffect !== "string" || activeEffect === "") {
    console.warn("[pill-summaries] invalid activeEffect:", activeEffect);
    return "Off";
  }
  if (activeEffect === "none") return "Off";
  return labels[activeEffect] ?? "Custom";
}

export type PlaybackModeLike = "continuous" | "step";

export function computePlaybackSummary(
  bpm: number,
  mode: PlaybackModeLike
): string {
  const modeLabel = mode === "step" ? "Step" : "Cont.";
  if (!Number.isFinite(bpm) || bpm <= 0) {
    console.warn("[pill-summaries] invalid bpm:", bpm);
    return `- BPM • ${modeLabel}`;
  }
  return `${bpm} BPM • ${modeLabel}`;
}

export interface ExportSummaryInput {
  resolution: number;
  fps: number;
  loopCount: number;
  renderMode: "2d" | "3d";
}

const CANONICAL_RESOLUTIONS = new Set<number>([720, 1080, 2160, 4320]);

export function computeExportSummary(input: ExportSummaryInput): string {
  const { resolution: r, fps, loopCount, renderMode } = input;
  if (!CANONICAL_RESOLUTIONS.has(r) || !Number.isFinite(fps) || fps <= 0) {
    console.warn("[pill-summaries] invalid export input:", {
      resolution: r,
      fps,
    });
    return "- • - fps";
  }
  const resLabel =
    renderMode === "3d"
      ? `${r}×${r}`
      : r >= 4320
        ? "8K"
        : r >= 2160
          ? "4K"
          : `${r}p`;
  const loopLabel =
    Number.isFinite(loopCount) && loopCount > 1 ? ` • ${loopCount}×` : "";
  return `${resLabel} • ${fps} fps${loopLabel}`;
}

/** Tunnel's Speed pill: which surface the rates belong to, and whether
 *  performers have diverged from a single shared rate. */
export function speedRailCopy(
  stageAware: boolean,
  hasSpeedOverrides: boolean
): { label: string; summary: string } {
  return {
    label: stageAware
      ? t("viewer_ui_stage_speed")
      : t("viewer_ui_copy_speed"),
    summary: hasSpeedOverrides
      ? t("viewer_ui_mixed_rates")
      : t("viewer_ui_uniform"),
  };
}

/** AnimatorInspectorShell's aria region label for Tunnel: its own settings
 *  panel vs. the bare animation dock. */
export function tunnelRegionLabel(showTitle: boolean): string {
  return showTitle
    ? t("viewer_ui_tunnel_settings")
    : t("viewer_ui_animation_controls");
}
