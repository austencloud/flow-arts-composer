import {
  CanvasTexture,
  LinearFilter,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Camera,
  type Group,
} from "three";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type {
  WorkerGridCanvasFactory,
  WorkerGridCanvasSurface,
} from "./worker-grid-types";

const LABEL_FONT_SIZE_PX = 9;
const LABEL_SCALE = 2;
const LABEL_PADDING_PX = 2;
const LABEL_SHADOW_ALPHA = 0.6;
const LABEL_FONT_WEIGHT = 700;

const LOCATION_LABELS: Record<GridLocation, string> = {
  n: "N",
  ne: "NE",
  e: "E",
  se: "SE",
  s: "S",
  sw: "SW",
  w: "W",
  nw: "NW",
  c: "C",
};

interface WorkerGridLabel {
  readonly sprite: Sprite;
  readonly widthPx: number;
  readonly heightPx: number;
  dispose(): void;
}

function defaultCanvasFactory(
  width: number,
  height: number
): WorkerGridCanvasSurface | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  return context ? { canvas, context } : null;
}

export function resolveWorkerGridCanvasFactory(
  factory?: WorkerGridCanvasFactory
): WorkerGridCanvasFactory | null {
  const candidate =
    factory ??
    (typeof OffscreenCanvas === "undefined" ? null : defaultCanvasFactory);
  if (!candidate) return null;
  return candidate(1, 1) ? candidate : null;
}

function configureContext(
  context: OffscreenCanvasRenderingContext2D,
  fontFamily: string
): void {
  context.font = `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE_PX * LABEL_SCALE}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
}

function drawLabel(
  surface: WorkerGridCanvasSurface,
  text: string,
  color: string,
  fontFamily: string
): void {
  const { canvas, context } = surface;
  configureContext(context, fontFamily);
  const width = Math.ceil(context.measureText(text).width);
  canvas.width = width + LABEL_PADDING_PX * LABEL_SCALE * 2;
  canvas.height =
    LABEL_FONT_SIZE_PX * LABEL_SCALE + LABEL_PADDING_PX * LABEL_SCALE * 2;
  configureContext(context, fontFamily);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const shadowOffset = LABEL_SCALE;
  context.fillStyle = `rgba(0, 0, 0, ${LABEL_SHADOW_ALPHA})`;
  for (const [x, y] of [
    [-shadowOffset, -shadowOffset],
    [shadowOffset, -shadowOffset],
    [-shadowOffset, shadowOffset],
    [shadowOffset, shadowOffset],
  ] as const) {
    context.fillText(text, centerX + x, centerY + y);
  }
  context.fillStyle = color;
  context.fillText(text, centerX, centerY);
}

export function createWorkerGridLabel(
  location: GridLocation,
  color: string,
  fontFamily: string,
  createCanvas: WorkerGridCanvasFactory
): WorkerGridLabel | null {
  const surface = createCanvas(64, 32);
  if (!surface) return null;
  drawLabel(surface, LOCATION_LABELS[location], color, fontFamily);

  const texture = new CanvasTexture(surface.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new Sprite(material);
  sprite.renderOrder = 10_000;
  sprite.name = `worker-grid-label:${location}`;

  return {
    sprite,
    widthPx: surface.canvas.width / LABEL_SCALE,
    heightPx: surface.canvas.height / LABEL_SCALE,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export function updateWorkerGridLabelScale(
  label: WorkerGridLabel,
  camera: Camera,
  viewportHeight: number
): void {
  if (viewportHeight <= 0) return;
  const projectionY = Math.abs(camera.projectionMatrix.elements[5] ?? 1);
  if (!Number.isFinite(projectionY) || projectionY <= 0) return;
  const worldUnitsPerPixel = 2 / (viewportHeight * projectionY);
  label.sprite.scale.set(
    label.widthPx * worldUnitsPerPixel,
    label.heightPx * worldUnitsPerPixel,
    1
  );
}

export interface WorkerGridLabelGroup {
  readonly root: Group;
  readonly labels: readonly WorkerGridLabel[];
}
