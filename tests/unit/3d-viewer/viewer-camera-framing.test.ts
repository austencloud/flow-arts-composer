// @vitest-environment jsdom

import { BackgroundType } from "@austencloud/backgrounds";
import { describe, expect, it, vi } from "vitest";
import {
  getViewerFrontStageFacingAngle,
  getViewerFrontStageCameraZ,
} from "$lib/shared/3d/domain/viewer-formation-facing";

import {
  computeViewerAlignedCamera,
  joinedPerformerExtent,
  isValidViewerCameraPose,
  isValidViewerCameraSnapshot,
} from "$lib/shared/3d/camera/viewer-camera-framing";

function rect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("viewer camera framing", () => {
  it("fits the joined reach and all performers in both opening camera paths", () => {
    const single = joinedPerformerExtent();
    const joined = joinedPerformerExtent(undefined, { toward: "e", steps: 2 });
    expect(joined).toBeGreaterThan(single);

    const base = computeViewerAlignedCamera({
      environmentId: BackgroundType.OCEAN,
      fov: 50,
      document: null,
    });
    const group = computeViewerAlignedCamera({
      environmentId: BackgroundType.OCEAN,
      fov: 50,
      document: null,
      performers: [
        { position: { x: -1, z: 0 }, conjoined: { toward: "e", steps: 2 } },
        { position: { x: 2, z: 0 } },
      ],
    });
    expect(group.target.x).toBe(0.5);
    expect(group.position.x).toBe(0.5);
    expect(group.position.z - group.target.z).toBeGreaterThan(
      base.position.z - base.target.z
    );
  });

  it("moves back for a joined grid on a narrow portrait viewport", () => {
    document.body.innerHTML = "";
    vi.stubGlobal("innerWidth", 240);
    vi.stubGlobal("innerHeight", 960);
    const camera = computeViewerAlignedCamera({
      environmentId: BackgroundType.OCEAN,
      fov: 50,
      document,
      conjoined: { toward: "e", steps: 2 },
    });
    const halfHorizontalFov = Math.atan(Math.tan((50 * Math.PI) / 360) * 0.25);
    const visibleHalfWidth =
      (camera.position.z - camera.target.z) * Math.tan(halfHorizontalFov);
    expect(visibleHalfWidth).toBeGreaterThanOrEqual(
      joinedPerformerExtent(undefined, { toward: "e", steps: 2 })
    );
    vi.unstubAllGlobals();
  });
  it("opens Blossom on the garden approach and widens its portrait composition", () => {
    const desktop = computeViewerAlignedCamera({
      environmentId: "blossom",
      fov: 48,
      document: null,
    });
    expect(desktop.position.z).toBe(-24);
    expect(desktop.target.z).toBe(7);
    const withPerformer = computeViewerAlignedCamera({
      environmentId: "blossom",
      fov: 48,
      document: null,
      performers: [{ position: { x: 0, z: 0 } }],
    });
    expect(withPerformer).toEqual(desktop);
    expect(getViewerFrontStageFacingAngle("blossom")).toBe(Math.PI);
    expect(getViewerFrontStageCameraZ(0, 3, "blossom")).toBe(-3);
    document.body.innerHTML = "";
    vi.stubGlobal("innerWidth", 375);
    vi.stubGlobal("innerHeight", 667);
    const phone = computeViewerAlignedCamera({
      environmentId: "blossom",
      fov: 48,
      document,
    });
    expect(phone.position.z).toBeLessThan(desktop.position.z);
    expect(phone.target.x).toBe(-3);
    vi.unstubAllGlobals();
  });

  it("uses the canonical front-stage fallback without a 2D canvas", () => {
    const camera = computeViewerAlignedCamera({
      environmentId: BackgroundType.OCEAN,
      fov: 50,
      document: null,
    });

    expect(camera.position.x).toBe(0);
    expect(camera.position.y).toBe(0);
    expect(camera.position.z).toBeGreaterThan(1);
    expect(camera.target).toEqual({ x: 0, y: 0, z: 0.3 });
  });

  it("matches the 3D opening shot to the neighboring square Choreo card", () => {
    document.body.innerHTML = `
      <section class="animation-pane">
        <canvas></canvas>
      </section>
    `;
    const pane = document.querySelector(".animation-pane") as HTMLElement;
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(
      rect(100, 50, 800, 600)
    );
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      rect(200, 150, 500, 500)
    );

    const camera = computeViewerAlignedCamera({
      environmentId: BackgroundType.OCEAN,
      fov: 50,
      document,
    });

    expect(camera.position.z).toBeGreaterThan(1);
    expect(camera.position.y).not.toBe(0);

    // A performer whose hands reach twice as far is framed twice as far out,
    // so its hand ring still matches the card's.
    const wide = computeViewerAlignedCamera({
      environmentId: BackgroundType.OCEAN,
      fov: 50,
      document,
      handDistance: 1.04,
    });
    expect(wide.position.z - wide.target.z).toBeCloseTo(
      2 * (camera.position.z - camera.target.z),
      12
    );
    expect(wide.position.y).toBeCloseTo(2 * camera.position.y, 12);
    expect(camera.target).toEqual({ x: 0, y: 0, z: 0.3 });
  });

  it("accepts only finite, controllable persisted poses", () => {
    expect(
      isValidViewerCameraPose(
        { x: -1.371, y: 27.44, z: -70.88 },
        { x: -1.367, y: 27.09, z: -69.943 },
        50
      )
    ).toBe(true);
    expect(
      isValidViewerCameraPose({ x: 0, y: 2, z: 8 }, { x: 0, y: 0, z: 0.3 }, 50)
    ).toBe(true);
    expect(
      isValidViewerCameraPose({ x: 0, y: 0, z: 0.5 }, { x: 0, y: 0, z: 0 }, 50)
    ).toBe(false);
    expect(
      isValidViewerCameraSnapshot({
        position: { x: 0, y: 2, z: Number.POSITIVE_INFINITY },
        rotation: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 0.3 },
        fov: 50,
        timestamp: 1,
      })
    ).toBe(false);
  });
});
