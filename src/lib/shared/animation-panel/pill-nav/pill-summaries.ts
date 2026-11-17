import { t } from "#lib/shared/i18n/i18n.svelte.js";

export function computePropsSummary(propLabel: string): string {
  return propLabel || t("viewer_ui_pill_staff_default");
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
  return t("viewer_ui_pill_visible_count", {
    shown: on,
    total: values.length,
  });
}

export function computeEffectsSummary(
  activeEffect: string,
  labels: Record<string, string>
): string {
  if (typeof activeEffect !== "string" || activeEffect === "") {
    console.warn("[pill-summaries] invalid activeEffect:", activeEffect);
    return t("viewer_ui_trails_off");
  }
  if (activeEffect === "none") return t("viewer_ui_trails_off");
  return labels[activeEffect] ?? t("viewer_ui_custom");
}

export type PlaybackModeLike = "continuous" | "step";

export function computePlaybackSummary(
  bpm: number,
  mode: PlaybackModeLike
): string {
  const modeLabel =
    mode === "step"
      ? t("train_mode_step")
      : t("viewer_ui_pill_continuous_short");
  if (!Number.isFinite(bpm) || bpm <= 0) {
    console.warn("[pill-summaries] invalid bpm:", bpm);
    return t("viewer_ui_pill_bpm_unknown_mode", { mode: modeLabel });
  }
  return t("viewer_ui_pill_bpm_mode", { bpm, mode: modeLabel });
}

export interface ExportSummaryInput {
  resolution: number;
  fps: number;
  loopCount: number;
  renderMode: "2d" | "3d";
}

const CANONICAL_RESOLUTIONS = new Set<number>([720, 1080, 2160, 4320]);

/** One resolution as the Export chips name it: 1080p / 4K / 8K, or a square in 3D. */
export function exportResolutionLabel(
  resolution: number,
  renderMode: "2d" | "3d"
): string {
  return renderMode === "3d"
    ? `${resolution}×${resolution}`
    : resolution >= 4320
      ? "8K"
      : resolution >= 2160
        ? "4K"
        : `${resolution}p`;
}

export function computeExportSummary(input: ExportSummaryInput): string {
  const { resolution: r, fps, loopCount, renderMode } = input;
  if (!CANONICAL_RESOLUTIONS.has(r) || !Number.isFinite(fps) || fps <= 0) {
    console.warn("[pill-summaries] invalid export input:", {
      resolution: r,
      fps,
    });
    return "- • - fps";
  }
  const resLabel = exportResolutionLabel(r, renderMode);
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

export interface ExportBoxInput {
  renderMode: "2d" | "3d";
  opener: "first-beat" | "this-frame" | "mandala";
  fps: number;
  resolution: number;
  quality: "standard" | "cinema";
  startHold: boolean;
  endHold: boolean;
  loopCount: number;
  carousel: "off" | "above" | "below" | "left" | "right";
}

/**
 * What each Export box shows under its name in the dock tray, so a closed box
 * still says what it holds. Pure: the same option state always gives the same
 * words. Quality carries the render quality only in 3D, where it exists, and
 * Timing lists the holds that are on (as Start and End, which is all a box
 * two columns wide has room for) before the loop count.
 */
export function computeExportBoxValues(input: ExportBoxInput): {
  opens: string;
  quality: string;
  timing: string;
  carousel: string;
} {
  const opens =
    input.opener === "mandala"
      ? t("share_mandala")
      : input.opener === "this-frame"
        ? t("share_current_frame")
        : t("share_first_beat");
  const quality = [
    `${input.fps} fps`,
    exportResolutionLabel(input.resolution, input.renderMode),
    ...(input.renderMode === "3d"
      ? [
          input.quality === "cinema"
            ? t("share_quality_cinema")
            : t("share_quality_standard"),
        ]
      : []),
  ].join(" · ");
  const timing = [
    ...(input.startHold ? [t("viewer_ui_start")] : []),
    ...(input.endHold ? [t("create_ui_end")] : []),
    `${input.loopCount}×`,
  ].join(" · ");
  const carousel = {
    off: t("share_video_carousel_off"),
    above: t("share_video_carousel_above"),
    below: t("share_video_carousel_below"),
    left: t("share_video_carousel_left"),
    right: t("share_video_carousel_right"),
  }[input.carousel];
  return { opens, quality, timing, carousel };
}
