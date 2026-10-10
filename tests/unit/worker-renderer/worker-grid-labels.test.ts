import { Group, PerspectiveCamera, Sprite } from "three";
import { Plane } from "@austencloud/scene-3d";
import { createWorkerGrid3D } from "#lib/shared/3d/worker-renderer/worlds/grid/worker-grid-3d.js";
import type {
  WorkerGridCanvasFactory,
  WorkerGridCanvasSurface,
} from "#lib/shared/3d/worker-renderer/worlds/grid/worker-grid-types.js";
import { describe, expect, it, vi } from "vitest";

function recordingCanvasFactory() {
  const fillText = vi.fn();
  const createCanvas: WorkerGridCanvasFactory = (width, height) => {
    const canvas = { width, height } as OffscreenCanvas;
    const context = {
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      fillStyle: "",
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText,
    } as unknown as OffscreenCanvasRenderingContext2D;
    return { canvas, context } satisfies WorkerGridCanvasSurface;
  };
  return { createCanvas, fillText };
}

function labelGroups(root: Group, plane: Plane): Group[] {
  const groups: Group[] = [];
  root.traverse((object) => {
    if (
      object instanceof Group &&
      object.name === `worker-grid-labels:${plane}`
    ) {
      groups.push(object);
    }
  });
  return groups;
}

describe("worker grid labels", () => {
  it("fails closed when production labels are requested without OffscreenCanvas", () => {
    const grid = createWorkerGrid3D({
      visiblePlanes: new Set([Plane.WALL]),
      size: 1.2,
      handPointRadius: 0.52,
      outerPointRadius: 0.95,
      createCanvas: () => null,
    });

    expect(grid.capability).toEqual({
      coreExact: true,
      exact: false,
      supported: false,
      limitations: ["labels-require-offscreen-canvas"],
      labelMode: "unavailable",
    });
    expect(labelGroups(grid.root, Plane.WALL)[0]?.children).toHaveLength(0);
    grid.dispose();
  });

  it("exposes the canvas-texture parity boundary instead of claiming DOM identity", () => {
    const { createCanvas, fillText } = recordingCanvasFactory();
    const grid = createWorkerGrid3D({
      visiblePlanes: new Set([Plane.WALL]),
      size: 1.2,
      handPointRadius: 0.52,
      outerPointRadius: 0.95,
      createCanvas,
    });

    expect(grid.capability).toEqual({
      coreExact: true,
      exact: false,
      supported: true,
      limitations: ["labels-use-canvas-textures-instead-of-dom"],
      labelMode: "offscreen-canvas",
    });
    expect(fillText).toHaveBeenCalledTimes(20);
    expect(labelGroups(grid.root, Plane.WALL)[0]?.children).toHaveLength(4);
    expect(
      labelGroups(grid.root, Plane.WALL)[0]?.children.every(
        (child) => child instanceof Sprite
      )
    ).toBe(true);
    grid.dispose();
  });

  it("shows labels only on the facing plane with a 9px glyph plus its shadow", () => {
    const { createCanvas } = recordingCanvasFactory();
    const grid = createWorkerGrid3D({
      visiblePlanes: new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]),
      size: 1.2,
      handPointRadius: 0.52,
      outerPointRadius: 0.95,
      createCanvas,
    });
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    grid.updateView(camera, 900);

    expect(labelGroups(grid.root, Plane.WALL)[0]?.visible).toBe(true);
    expect(labelGroups(grid.root, Plane.WHEEL)[0]?.visible).toBe(false);
    expect(labelGroups(grid.root, Plane.FLOOR)[0]?.visible).toBe(false);
    const wallLabel = labelGroups(grid.root, Plane.WALL)[0]
      ?.children[0] as Sprite;
    const screenHeight =
      (wallLabel.scale.y * camera.projectionMatrix.elements[5] * 900) / 2;
    expect(screenHeight).toBeCloseTo(13, 8);

    camera.position.set(5, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    grid.updateView(camera, 900);
    expect(labelGroups(grid.root, Plane.WALL)[0]?.visible).toBe(false);
    expect(labelGroups(grid.root, Plane.WHEEL)[0]?.visible).toBe(true);
    grid.dispose();
  });
});
