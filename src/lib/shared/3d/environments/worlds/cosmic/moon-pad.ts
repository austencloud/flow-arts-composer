import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { createMoonSurfaceMaterial } from "./moon-surface-materials";
import {
  MOON_APRON_HEIGHT,
  moonPadLightCount,
  moonPadLightLevel,
} from "./moon-outpost-layout";

/**
 * The landing pad the performer stands on: packed regolith with worn paint,
 * flush with the authored apron, and a ring of small flush lights chasing
 * slowly round its edge. It is built for one radius and grows by scaling,
 * which keeps its markings in proportion.
 */
export interface MoonPad {
  object: Group;
  readonly radius: number;
  setRadius(radius: number): void;
  update(elapsedSeconds: number, motionScale: number): void;
  dispose(): void;
}

/** The surface reaches past the painted edge so it can fade into the ground. */
const SURFACE_REACH = 1.18;
const LIGHT_COLOUR = new Color(1.0, 0.62, 0.28);

export function createMoonPad(initialRadius: number): MoonPad {
  const object = new Group();
  object.name = "MoonLandingPad";
  const baseRadius = initialRadius;
  const surfaceGeometry = new CircleGeometry(baseRadius * SURFACE_REACH, 96);
  const surfaceMaterial = createMoonSurfaceMaterial("pad", baseRadius);
  const surface = new Mesh(surfaceGeometry, surfaceMaterial);
  surface.name = "MoonPadSurface";
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = MOON_APRON_HEIGHT + 0.004;
  surface.receiveShadow = true;
  object.add(surface);

  const lightGeometry = new CylinderGeometry(0.055, 0.07, 0.024, 12);
  const lightMaterial = new MeshBasicMaterial({ color: 0xffffff });
  lightMaterial.name = "MoonPadLightMaterial";
  // Room for the largest ring this pad is likely to grow to.
  const capacity = moonPadLightCount(baseRadius * 3);
  const lights = new InstancedMesh(lightGeometry, lightMaterial, capacity);
  lights.name = "MoonPadLights";
  lights.frustumCulled = false;
  object.add(lights);

  const matrix = new Matrix4();
  const position = new Vector3();
  const colour = new Color();
  let radius = baseRadius;
  let count = 0;

  function layout(): void {
    const scale = radius / baseRadius;
    surface.scale.set(scale, scale, 1);
    count = Math.min(capacity, moonPadLightCount(radius));
    lights.count = count;
    const ringRadius = radius * 1.0;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      position.set(
        Math.sin(angle) * ringRadius,
        MOON_APRON_HEIGHT + 0.006,
        Math.cos(angle) * ringRadius
      );
      matrix.makeTranslation(position.x, position.y, position.z);
      lights.setMatrixAt(index, matrix);
    }
    lights.instanceMatrix.needsUpdate = true;
  }

  function paint(elapsedSeconds: number, motionScale: number): void {
    for (let index = 0; index < count; index += 1) {
      const level = moonPadLightLevel(index, count, elapsedSeconds, motionScale);
      colour.copy(LIGHT_COLOUR).multiplyScalar(level * 2.2);
      lights.setColorAt(index, colour);
    }
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
  }

  layout();
  paint(0, 0);

  return {
    object,
    get radius() {
      return radius;
    },
    setRadius(next) {
      if (next === radius) return;
      radius = next;
      layout();
    },
    update(elapsedSeconds, motionScale) {
      paint(elapsedSeconds, motionScale);
    },
    dispose() {
      surfaceGeometry.dispose();
      surfaceMaterial.dispose();
      lightGeometry.dispose();
      lightMaterial.dispose();
      lights.dispose();
      object.clear();
    },
  };
}
