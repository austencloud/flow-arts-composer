import {
  ArrowHelper,
  Group,
  Mesh,
  Vector3,
  type Camera,
  type Material,
} from "three";
import {
  Plane,
  PlaneMode,
  PLANE_COLORS,
  PLANE_MODE_CONFIGS,
} from "@austencloud/scene-3d/worker";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { LOCATION_ANGLES } from "$lib/shared/foundation/domain/math-constants";
import {
  CENTER_POINT_SIZE,
  HAND_POINT_SIZE,
  OUTER_POINT_SIZE,
  getHandPoints,
  getOuterPoints,
} from "$lib/shared/3d/domain/constants/grid-layout";
import {
  PLANE_NORMALS,
  getPlaneRotation,
  planeAngleToWorldPosition,
} from "$lib/shared/3d/domain/constants/plane-transforms";
import {
  getGridMarkerGeometry,
  getGridMaterial,
  getGridOrientationHelperArgs,
  getGridPlaneGeometry,
  getGridRingGeometry,
} from "$lib/shared/3d/components/grid-render-resources";
import {
  createWorkerGridLabel,
  resolveWorkerGridCanvasFactory,
  updateWorkerGridLabelScale,
} from "./worker-grid-labels";
import type {
  WorkerGridCanvasFactory,
  WorkerGrid3D,
  WorkerGridCapability,
  WorkerGridOptions,
} from "./worker-grid-types";

const DEFAULT_PLANE_OPACITY = 0.15;
const DEFAULT_LABEL_FONT_FAMILY = "sans-serif";
const LABEL_POSITION_SCALE = 1.08;
const CENTER_COLOR = 0xf59e0b;

interface PlaneVisual {
  readonly plane: Plane;
  readonly labelRoot: Group;
  readonly labels: Array<NonNullable<ReturnType<typeof createWorkerGridLabel>>>;
}

function marker(
  name: string,
  radius: number,
  segments: number,
  material: Material
): Mesh {
  const mesh = new Mesh(getGridMarkerGeometry(radius, segments), material);
  mesh.name = name;
  return mesh;
}

function createPlaneVisual(
  options: WorkerGridOptions,
  parent: Group,
  plane: Plane,
  labelsEnabled: boolean,
  canvasFactory: WorkerGridCanvasFactory | null
): PlaneVisual {
  const root = new Group();
  root.name = `worker-grid-plane:${plane}`;
  root.rotation.copy(getPlaneRotation(plane));
  parent.add(root);

  const color = PLANE_COLORS[plane];
  const planeOpacity = options.planeOpacity ?? DEFAULT_PLANE_OPACITY;
  const planeMesh = new Mesh(
    getGridPlaneGeometry(options.size),
    getGridMaterial(color, {
      opacity: planeOpacity,
      doubleSided: true,
      depthWrite: false,
    })
  );
  planeMesh.name = `worker-grid-surface:${plane}`;
  root.add(planeMesh);

  const handRing = new Mesh(
    getGridRingGeometry(options.handPointRadius, 0.015, 64),
    getGridMaterial(color, { opacity: 0.5, doubleSided: true })
  );
  handRing.position.z = 0.005;
  handRing.name = `worker-grid-hand-ring:${plane}`;
  root.add(handRing);

  const outerRing = new Mesh(
    getGridRingGeometry(options.outerPointRadius, 0.01, 64),
    getGridMaterial(color, { opacity: 0.25, doubleSided: true })
  );
  outerRing.position.z = 0.003;
  outerRing.name = `worker-grid-outer-ring:${plane}`;
  root.add(outerRing);

  const center = marker(
    `worker-grid-plane-center:${plane}`,
    CENTER_POINT_SIZE,
    16,
    getGridMaterial(CENTER_COLOR)
  );
  center.position.z = 0.01;
  root.add(center);

  const pointMaterial = getGridMaterial(color);
  for (const location of getHandPoints(options.gridMode ?? "diamond")) {
    const point = marker(
      `worker-grid-hand-point:${plane}:${location}`,
      HAND_POINT_SIZE,
      16,
      pointMaterial
    );
    point.position.copy(
      planeAngleToWorldPosition(
        plane,
        LOCATION_ANGLES[location],
        options.handPointRadius
      )
    );
    parent.add(point);
  }

  const labelRoot = new Group();
  labelRoot.name = `worker-grid-labels:${plane}`;
  labelRoot.visible = false;
  parent.add(labelRoot);
  const labels: PlaneVisual["labels"] = [];
  const outerPointMaterial = getGridMaterial(color, { opacity: 0.6 });
  for (const location of getOuterPoints(options.gridMode ?? "diamond")) {
    const position = planeAngleToWorldPosition(
      plane,
      LOCATION_ANGLES[location],
      options.outerPointRadius
    );
    const point = marker(
      `worker-grid-outer-point:${plane}:${location}`,
      OUTER_POINT_SIZE,
      12,
      outerPointMaterial
    );
    point.position.copy(position);
    parent.add(point);

    if (!labelsEnabled || !canvasFactory) continue;
    const label = createWorkerGridLabel(
      location,
      color,
      options.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
      canvasFactory
    );
    if (!label) continue;
    label.sprite.position.copy(position).multiplyScalar(LABEL_POSITION_SCALE);
    labelRoot.add(label.sprite);
    labels.push(label);
  }

  return { plane, labelRoot, labels };
}

function createCapability(
  options: WorkerGridOptions,
  canvasFactory: WorkerGridCanvasFactory | null
): WorkerGridCapability {
  if (options.showLabels === false) {
    return {
      coreExact: true,
      exact: true,
      supported: true,
      limitations: [],
      labelMode: "disabled",
    };
  }
  if (!canvasFactory) {
    return {
      coreExact: true,
      exact: false,
      supported: false,
      limitations: ["labels-require-offscreen-canvas"],
      labelMode: "unavailable",
    };
  }
  return {
    coreExact: true,
    exact: false,
    supported: true,
    limitations: ["labels-use-canvas-textures-instead-of-dom"],
    labelMode: "offscreen-canvas",
  };
}

export function getWorkerGridCapability(
  options: WorkerGridOptions
): WorkerGridCapability {
  return createCapability(
    options,
    options.showLabels === false
      ? null
      : resolveWorkerGridCanvasFactory(options.createCanvas)
  );
}

export function createWorkerGrid3D(options: WorkerGridOptions): WorkerGrid3D {
  const root = new Group();
  root.name = "worker-grid-3d";
  const canvasFactory =
    options.showLabels === false
      ? null
      : resolveWorkerGridCanvasFactory(options.createCanvas);
  const capability = createCapability(options, canvasFactory);
  const planeVisuals: PlaneVisual[] = [];
  const visiblePlanes = (Object.values(Plane) as Plane[]).filter((plane) =>
    options.visiblePlanes.has(plane)
  );
  const staffHalfLength =
    options.staffHalfLength ??
    PLANE_MODE_CONFIGS[PlaneMode.DUAL_WHEEL].blueLateralOffset;
  const wheelOffsets =
    options.planeMode === PlaneMode.DUAL_WHEEL
      ? [staffHalfLength, -staffHalfLength]
      : [0];

  for (const plane of visiblePlanes) {
    const offsets = plane === Plane.WHEEL ? wheelOffsets : [0];
    for (const [index, lateralOffset] of offsets.entries()) {
      const container = new Group();
      container.name = `worker-grid-plane-container:${plane}:${index}`;
      container.position.x = lateralOffset;
      root.add(container);

      const visual = createPlaneVisual(
        options,
        container,
        plane,
        capability.labelMode === "offscreen-canvas" && index === 0,
        canvasFactory
      );
      planeVisuals.push(visual);
    }
  }

  const arrows: ArrowHelper[] = [];
  if (options.showOrientationHelpers !== false && visiblePlanes.length > 0) {
    const center = marker(
      "worker-grid-orientation-center",
      0.04,
      32,
      getGridMaterial(CENTER_COLOR)
    );
    root.add(center);
    for (const [index, args] of getGridOrientationHelperArgs(
      options.size
    ).entries()) {
      const arrow = new ArrowHelper(...args);
      arrow.name = `worker-grid-orientation-axis:${index}`;
      arrows.push(arrow);
      root.add(arrow);
    }
  }

  const viewDirection = new Vector3();
  let disposed = false;
  return {
    root,
    capability,
    updateView(camera: Camera, viewportHeight: number) {
      if (disposed) return;
      camera.getWorldDirection(viewDirection);
      let labelPlane: Plane | null = null;
      let bestDot = -1;
      for (const plane of visiblePlanes) {
        const dot = Math.abs(
          viewDirection.dot(
            PLANE_NORMALS[plane as unknown as keyof typeof PLANE_NORMALS]
          )
        );
        if (dot > bestDot) {
          bestDot = dot;
          labelPlane = plane;
        }
      }
      let shownPlane = false;
      for (const visual of planeVisuals) {
        visual.labelRoot.visible =
          !shownPlane &&
          visual.plane === labelPlane &&
          visual.labels.length > 0;
        if (visual.labelRoot.visible) shownPlane = true;
        for (const label of visual.labels) {
          updateWorkerGridLabelScale(label, camera, viewportHeight);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const visual of planeVisuals) {
        for (const label of visual.labels) label.dispose();
      }
      for (const arrow of arrows) {
        arrow.line.geometry.dispose();
        (arrow.line.material as Material).dispose();
        arrow.cone.geometry.dispose();
        (arrow.cone.material as Material).dispose();
      }
      root.clear();
    },
  };
}

export { GridLocation };
