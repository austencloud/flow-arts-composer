import { describe, it, expect } from "vitest";
import { toExportTakeoverPhase, exportPhaseLabelKey } from "../export-takeover-phase";
import type { VideoExportProgress } from "#lib/shared/compose/domain/video-export-types.js";

const p = (stage: VideoExportProgress["stage"], extra: Partial<VideoExportProgress> = {}): VideoExportProgress =>
  ({ progress: 0.5, stage, ...extra }) as VideoExportProgress;

describe("toExportTakeoverPhase", () => {
  it("is idle when not exporting and no progress", () => {
    expect(toExportTakeoverPhase(null, false)).toEqual({ phase: "idle", labelKey: "" });
  });

  it("maps capturing/encoding/complete stages to phase + label key while exporting", () => {
    expect(toExportTakeoverPhase(p("capturing"), true)).toEqual({
      phase: "capturing",
      labelKey: "export_capturing_progress",
    });
    expect(toExportTakeoverPhase(p("encoding"), true)).toEqual({
      phase: "encoding",
      labelKey: "export_encoding",
    });
    expect(toExportTakeoverPhase(p("complete"), true)).toEqual({
      phase: "complete",
      labelKey: "export_done",
    });
  });

  it("defaults to capturing when exporting with no stage", () => {
    expect(toExportTakeoverPhase(null, true)).toEqual({
      phase: "capturing",
      labelKey: "export_capturing_progress",
    });
  });

  it("surfaces error (no label) — from progress.error or explicit opt", () => {
    expect(toExportTakeoverPhase(p("error", { error: "boom" }), true)).toEqual({
      phase: "error",
      labelKey: "",
    });
    // error-first: shows even after isExporting flips false
    expect(toExportTakeoverPhase(p("error", { error: "boom" }), false)).toEqual({
      phase: "error",
      labelKey: "",
    });
    expect(toExportTakeoverPhase(null, true, { error: "explicit" })).toEqual({
      phase: "error",
      labelKey: "",
    });
  });

  it("forces idle when the host marks its export kind inactive", () => {
    expect(toExportTakeoverPhase(p("capturing"), true, { active: false })).toEqual({
      phase: "idle",
      labelKey: "",
    });
    // inactive wins even over an error
    expect(toExportTakeoverPhase(p("error", { error: "x" }), true, { active: false })).toEqual({
      phase: "idle",
      labelKey: "",
    });
  });
});

describe("exportPhaseLabelKey", () => {
  it("maps each phase to its label key (mandala + progress hosts share this)", () => {
    expect(exportPhaseLabelKey("capturing")).toBe("export_capturing_progress");
    expect(exportPhaseLabelKey("encoding")).toBe("export_encoding");
    expect(exportPhaseLabelKey("complete")).toBe("export_done");
    expect(exportPhaseLabelKey("idle")).toBe("");
    expect(exportPhaseLabelKey("error")).toBe("");
  });
});
