import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  buildCardExportAnalyticsConfig,
  buildPracticeConfigProperties,
  buildVideoExportAnalyticsConfig,
  buildViewerShareActions,
  resolveExportSidebarMinWidth,
  viewerInspectorConstraints,
} from "$lib/shared/sequence-viewer/services/viewer-shell-model";

describe("viewer shell model", () => {
  it("uses only valid persisted rail widths in the export threshold", () => {
    expect(resolveExportSidebarMinWidth(null)).toBe(1348);
    expect(resolveExportSidebarMinWidth("72")).toBe(1240);
    expect(resolveExportSidebarMinWidth("300")).toBe(1468);
    expect(resolveExportSidebarMinWidth("71")).toBe(1348);
    expect(resolveExportSidebarMinWidth("301")).toBe(1348);
    expect(resolveExportSidebarMinWidth("wide")).toBe(1348);
  });

  it("keeps Card compact without shrinking the stage or effects inspector", () => {
    expect(resolveExportSidebarMinWidth(null, "card")).toBe(1268);
    expect(resolveExportSidebarMinWidth(null, "art")).toBe(1268);
    expect(resolveExportSidebarMinWidth(null, "motion")).toBe(1348);
    expect(viewerInspectorConstraints("card")).toEqual({
      minWidth: 420,
      maxWidth: 840,
    });
    expect(viewerInspectorConstraints("motion")).toEqual({
      minWidth: 520,
      maxWidth: 1200,
    });
  });

  it("gives Performances a narrower inspector than the effects inspector", () => {
    // The default gap is the seam travel the Motion -> Performances transition
    // animates. Losing it turns Gate 5 back into a flat crossfade.
    expect(viewerInspectorConstraints("performance")).toEqual({
      minWidth: 360,
      maxWidth: 900,
    });
    expect(resolveExportSidebarMinWidth(null, "performance")).toBe(1188);
    expect(resolveExportSidebarMinWidth(null, "performance")).toBeLessThan(
      resolveExportSidebarMinWidth(null, "motion")
    );
  });

  it("keeps copied-link feedback in the open share menu", () => {
    const idle = buildViewerShareActions(false);
    const copied = buildViewerShareActions(true);

    expect(idle.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "share-sequence", label: "Share Sequence…" },
      { id: "send-sequence", label: "Send in Flow Arts Composer" },
      { id: "copy-link", label: "Copy Link" },
    ]);
    expect(copied[2]).toMatchObject({
      label: "Copied",
      icon: "fa-check",
      tone: "success",
      closeOnSelect: false,
    });
  });

  it("preserves video and card export attribution fields", () => {
    expect(
      buildVideoExportAnalyticsConfig({
        fps: 60,
        loopCount: 3,
        resolution: 2160,
        includeStartPosition: true,
        includeEndHold: false,
        renderMode: "3d",
        playbackMode: "continuous",
        leftPropType: PropType.STAFF,
        rightPropType: PropType.FAN,
      })
    ).toEqual({
      fps: 60,
      loop_count: 3,
      resolution: "2160",
      include_start_position: true,
      include_end_hold: false,
      render_mode: "3d",
      playback_mode: "continuous",
      left_prop: "staff",
      right_prop: "fan",
      mixed_props: true,
    });

    expect(
      buildCardExportAnalyticsConfig({
        stepCount: 16,
        darkMode: true,
        includeStartPosition: false,
        handPath: true,
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      })
    ).toEqual({
      step_count: 16,
      dark_mode: true,
      include_start_position: false,
      hand_path: true,
      left_prop: "staff",
      right_prop: "staff",
      mixed_props: false,
    });
  });

  it("keeps missing practice settings explicit in analytics", () => {
    expect(
      buildPracticeConfigProperties({ startBpm: 80, increment: 5 })
    ).toEqual({
      start_bpm: 80,
      max_bpm: null,
      increment: 5,
      rounds_per_level: null,
      target_enabled: null,
      target_bpm: null,
    });
  });
});
