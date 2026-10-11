/**
 * Export-takeover phase mapper.
 *
 * Single source of truth for what the `ExportTakeover` progress ring shows,
 * given the shared video-export progress signals. Consolidates the derivation
 * that was duplicated (and had drifted) across the QR viewer, the tunnel/Art
 * pane, the animation share drawer, and the in-app animation player.
 *
 * Pure + i18n-agnostic: returns an i18n KEY for the phase label so the consumer
 * resolves it with the reactive `t()` (keeps this unit-testable without i18n).
 */
import type { ExportPhase, VideoExportProgress } from "#lib/shared/compose/domain/video-export-types.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

export interface ExportTakeoverView {
  phase: ExportPhase;
  /** i18n key for the phase label, or "" for idle/error (no label). */
  labelKey: TranslationKey | "";
}

/**
 * Phase → i18n label key. The single place the export ring's phase wording is
 * decided; both `toExportTakeoverPhase` (VideoExportProgress hosts) and the
 * mandala takeover (controller-driven) resolve their label through this.
 */
export function exportPhaseLabelKey(phase: ExportPhase): TranslationKey | "" {
  return phase === "capturing"
    ? "export_capturing_progress"
    : phase === "encoding"
      ? "export_encoding"
      : phase === "complete"
        ? "export_done"
        : "";
}

/**
 * @param progress   The current export progress (stage + optional error), or null.
 * @param isExporting Whether an export is actively running.
 * @param opts.active When false, force `idle` — lets a host suppress the ring
 *   when its export kind isn't the active one (e.g. ArtPane: tunnel only).
 * @param opts.error  Explicit error string; falls back to `progress.error`.
 *
 * Precedence is error-first: a failed export surfaces the error state (with the
 * host's Retry/Close) even after `isExporting` flips false, rather than silently
 * hiding it.
 */
export function toExportTakeoverPhase(
  progress: VideoExportProgress | null,
  isExporting: boolean,
  opts: { active?: boolean; error?: string | null } = {},
): ExportTakeoverView {
  const active = opts.active ?? true;
  const error = opts.error ?? progress?.error ?? null;

  let phase: ExportPhase;
  if (!active) {
    phase = "idle";
  } else if (error) {
    phase = "error";
  } else if (isExporting) {
    phase = (progress?.stage as ExportPhase | undefined) ?? "capturing";
  } else {
    phase = "idle";
  }

  return { phase, labelKey: exportPhaseLabelKey(phase) };
}
