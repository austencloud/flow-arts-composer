import {
  AdditiveBlending,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";

export type WorkerSelectionMarkerPosition = readonly [
  x: number,
  groundY: number,
  z: number,
];

/**
 * Final display state chosen by the application thread. The worker receives
 * no selection policy, only the clone-safe values needed to draw one marker.
 */
export interface WorkerSelectionMarkerSnapshot {
  groundPosition: WorkerSelectionMarkerPosition;
  color: number;
  selected: boolean;
  allPerformersSelected: boolean;
  present: boolean;
  pulsePhase: number;
  hovered?: boolean;
  dragging?: boolean;
}

export interface WorkerSelectionMarkerVisual {
  readonly root: Group;
  update(snapshot: WorkerSelectionMarkerSnapshot): void;
  dispose(): void;
}

const INDIVIDUAL_GROUND_OFFSET = 0.015;
const ALL_SELECTED_GROUND_OFFSET = 0.01;
const ALL_SELECTED_COLOR = 0x8b5cf6;

function namedMesh(
  name: string,
  geometry: RingGeometry | CircleGeometry,
  material: MeshBasicMaterial
): Mesh<RingGeometry | CircleGeometry, MeshBasicMaterial> {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

/**
 * Renderer-neutral copy of the selection marks in Viewer3DScene. Keeping the
 * final position and selection state at this boundary lets the application
 * remain the sole owner of performer-selection behavior.
 */
export function createWorkerSelectionMarker(
  initial: WorkerSelectionMarkerSnapshot
): WorkerSelectionMarkerVisual {
  const root = new Group();
  root.name = "worker-selection-marker";

  const individual = new Group();
  individual.name = "worker-selection-marker-individual";
  individual.position.y = INDIVIDUAL_GROUND_OFFSET;
  individual.rotation.x = -Math.PI / 2;

  const innerMaterial = new MeshBasicMaterial({
    color: initial.color,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const inner = namedMesh(
    "worker-selection-marker-inner-ring",
    new RingGeometry(0.42, 0.58, 64),
    innerMaterial
  );

  const outerMaterial = new MeshBasicMaterial({
    color: initial.color,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const outer = namedMesh(
    "worker-selection-marker-outer-ring",
    new RingGeometry(0.58, 1, 64),
    outerMaterial
  );

  const centerMaterial = new MeshBasicMaterial({
    color: initial.color,
    transparent: true,
    opacity: 0.15,
  });
  const center = namedMesh(
    "worker-selection-marker-center",
    new CircleGeometry(0.42, 64),
    centerMaterial
  );
  individual.add(inner, outer, center);

  const allSelectedMaterial = new MeshBasicMaterial({
    color: ALL_SELECTED_COLOR,
    transparent: true,
    opacity: 0.15,
  });
  const allSelected = namedMesh(
    "worker-selection-marker-all",
    new RingGeometry(0.42, 0.58, 48),
    allSelectedMaterial
  );
  allSelected.position.y = ALL_SELECTED_GROUND_OFFSET;
  allSelected.rotation.x = -Math.PI / 2;

  root.add(individual, allSelected);
  let disposed = false;

  const visual: WorkerSelectionMarkerVisual = {
    root,
    update(snapshot) {
      if (disposed) return;
      const [x, groundY, z] = snapshot.groundPosition;
      root.position.set(x, groundY, z);

      const showIndividual =
        snapshot.present &&
        snapshot.selected &&
        !snapshot.allPerformersSelected;
      individual.visible = showIndividual;
      allSelected.visible = snapshot.present && snapshot.allPerformersSelected;

      innerMaterial.color.setHex(snapshot.color);
      outerMaterial.color.setHex(snapshot.color);
      centerMaterial.color.setHex(snapshot.color);

      const pulse = 0.6 + 0.4 * Math.sin(snapshot.pulsePhase);
      innerMaterial.opacity = snapshot.dragging ? 1 : pulse * 0.75;
      outerMaterial.opacity = snapshot.dragging ? 0.45 : pulse * 0.18;
      centerMaterial.opacity = 0.06;
      allSelectedMaterial.opacity = snapshot.dragging ? 0.9 : 0.45;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      inner.geometry.dispose();
      outer.geometry.dispose();
      center.geometry.dispose();
      allSelected.geometry.dispose();
      innerMaterial.dispose();
      outerMaterial.dispose();
      centerMaterial.dispose();
      allSelectedMaterial.dispose();
    },
  };

  visual.update(initial);
  return visual;
}
