import type { Camera, Group } from "three";
import type { Plane, PlaneMode } from "@austencloud/scene-3d";
import type { GridMode } from "#lib/shared/3d/domain/constants/grid-layout.js";

export type WorkerGridParityLimitation =
  | "labels-require-offscreen-canvas"
  | "labels-use-canvas-textures-instead-of-dom";

export interface WorkerGridCapability {
  /** Plane geometry, markers, rings, transforms, colors, and axis helpers match Grid3D. */
  readonly coreExact: true;
  /** True only when every requested visual has the same production implementation. */
  readonly exact: boolean;
  /** False when a requested visual cannot be produced in the current worker. */
  readonly supported: boolean;
  readonly limitations: readonly WorkerGridParityLimitation[];
  readonly labelMode: "disabled" | "offscreen-canvas" | "unavailable";
}

export interface WorkerGridCanvasSurface {
  readonly canvas: OffscreenCanvas;
  readonly context: OffscreenCanvasRenderingContext2D;
}

export type WorkerGridCanvasFactory = (
  width: number,
  height: number
) => WorkerGridCanvasSurface | null;

export interface WorkerGridOptions {
  readonly visiblePlanes: ReadonlySet<Plane>;
  readonly size: number;
  readonly handPointRadius: number;
  readonly outerPointRadius: number;
  readonly showLabels?: boolean;
  readonly planeOpacity?: number;
  readonly gridMode?: GridMode;
  readonly planeMode?: PlaneMode;
  /**
   * Half the performer's staff. Grid3D spaces the two dual-wheel copies by it
   * so each wheel sits on its hand; defaults to the dual-wheel lateral offset.
   */
  readonly staffHalfLength?: number;
  readonly showOrientationHelpers?: boolean;
  readonly labelFontFamily?: string;
  readonly createCanvas?: WorkerGridCanvasFactory;
}

export interface WorkerGrid3D {
  readonly root: Group;
  readonly capability: WorkerGridCapability;
  /**
   * Keeps the one visible label plane and its fixed screen size in sync with
   * the camera, matching Grid3D's per-frame label selection.
   */
  updateView(camera: Camera, viewportHeight: number): void;
  dispose(): void;
}
