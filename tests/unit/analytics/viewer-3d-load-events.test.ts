import { describe, expect, it } from "vitest";
import {
  startViewer3DLoadRecord,
  viewer3DAbandonedProperties,
  viewer3DVisibleProperties,
} from "#lib/shared/analytics/viewer-3d-load-events.js";

function record() {
  return startViewer3DLoadRecord({
    startedAt: 1000,
    entry: "switch",
    codeWarm: true,
    assetsWarm: false,
    workerCapable: true,
  });
}

describe("viewer 3D load record", () => {
  it("reports the wait from the tap, and what was warm", () => {
    expect(viewer3DVisibleProperties(record(), 3499.6)).toEqual({
      viewer_3d_wait_ms: 2500,
      viewer_3d_entry: "switch",
      viewer_3d_code_warm: true,
      viewer_3d_assets_warm: false,
      viewer_3d_worker_capable: true,
    });
  });

  it("adds the stage reached when the visitor leaves first", () => {
    expect(viewer3DAbandonedProperties(record(), 5000, "preparing")).toMatchObject(
      { viewer_3d_wait_ms: 4000, viewer_3d_stage_reached: "preparing" }
    );
  });

  it("ends each wait once: visible and abandoned never both fire", () => {
    const wait = record();
    expect(viewer3DVisibleProperties(wait, 2000)).not.toBeNull();
    expect(viewer3DAbandonedProperties(wait, 3000, "revealing")).toBeNull();
    expect(viewer3DVisibleProperties(wait, 3000)).toBeNull();
  });
});
