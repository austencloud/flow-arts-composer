import {
  Color,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  type ShaderMaterial,
} from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

import { ReflectivePoolShader } from "../../primitives/reflective-pool-shader";
import {
  getBlossomRiverBounds,
  getBlossomRiverOutline,
  getBlossomRiverShoreFade,
  getBlossomRiverShoreline,
  getBlossomRiverSurfaceElevation,
} from "../../scenes/cherry-blossom/blossom-water";

export interface BlossomRiver {
  object: Reflector;
  update(deltaSeconds: number): void;
  setGroundY(groundY: number): void;
  setStageZOffset(stageZOffset: number): void;
  setActive(active: boolean): void;
  dispose(): void;
}

const MAX_SHORELINE_SEGMENTS = 32;

function createRiverGeometry(outline: Array<[number, number]>): ShapeGeometry {
  const shape = new Shape();
  const [first, ...rest] = outline;
  shape.moveTo(first![0], first![1]);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (bounds && positions && uv) {
    const spanX = Math.max(bounds.max.x - bounds.min.x, 0.001);
    const spanY = Math.max(bounds.max.y - bounds.min.y, 0.001);
    for (let index = 0; index < positions.count; index += 1) {
      uv.setXY(
        index,
        (positions.getX(index) - bounds.min.x) / spanX,
        (positions.getY(index) - bounds.min.y) / spanY
      );
    }
    uv.needsUpdate = true;
  }
  return geometry;
}

/** Exact imperative form of Blossom's authored-footprint reflective river. */
export function createBlossomRiver(
  groundY: number,
  stageZOffset: number
): BlossomRiver {
  const outline = getBlossomRiverOutline();
  const shoreline = getBlossomRiverShoreline().slice(0, MAX_SHORELINE_SEGMENTS);
  const { width, depth, centerX, centerZ } = getBlossomRiverBounds();
  const geometry = createRiverGeometry(outline);
  const reflector = new Reflector(geometry, {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 512,
    color: 0xa7afc4,
    shader: ReflectivePoolShader,
  });
  reflector.name = "blossom-reflective-river";
  reflector.rotation.x = -Math.PI / 2;

  const material = reflector.material as ShaderMaterial;
  const starts = Array.from({ length: MAX_SHORELINE_SEGMENTS }, (_, index) => {
    const point = shoreline[index % shoreline.length]!;
    return new Vector2(point[0], point[1]);
  });
  const ends = Array.from({ length: MAX_SHORELINE_SEGMENTS }, (_, index) => {
    const point = shoreline[(index + 1) % shoreline.length]!;
    return new Vector2(point[0], point[1]);
  });
  const values: Record<string, unknown> = {
    uDeepColor: new Color("#293c50"),
    uShallowColor: new Color("#697b80"),
    uSize: new Vector2(width, depth),
    uSunDirection: new Vector3(-0.42, 0.58, -0.7).normalize(),
    uSunColor: new Color("#5d738f"),
    uRippleScale: 2.4,
    uRippleStrength: 0.32,
    uFoamWidth: 0.1,
    uFoamOpacity: 0.08,
    uShoreFade: getBlossomRiverShoreFade(),
    uWaveAmplitude: new Vector2(1, 1),
    uShorelineCount: shoreline.length,
    uShorelineStarts: starts,
    uShorelineEnds: ends,
    uTime: 0,
  };
  for (const [key, value] of Object.entries(values)) {
    const uniform = material.uniforms[key];
    if (uniform) uniform.value = value;
  }

  const surfaceElevation = getBlossomRiverSurfaceElevation();
  let currentGroundY = groundY;
  let currentStageZOffset = stageZOffset;
  function setGroundY(nextGroundY: number): void {
    currentGroundY = nextGroundY;
    reflector.position.set(
      centerX,
      nextGroundY + surfaceElevation + 0.012,
      currentStageZOffset + centerZ
    );
  }
  setGroundY(groundY);

  return {
    object: reflector,
    update(deltaSeconds) {
      material.uniforms.uTime!.value += deltaSeconds * 0.28;
    },
    setGroundY,
    setStageZOffset(nextStageZOffset) {
      currentStageZOffset = nextStageZOffset;
      setGroundY(currentGroundY);
    },
    setActive(active) {
      reflector.visible = active;
    },
    dispose() {
      reflector.getRenderTarget().dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
