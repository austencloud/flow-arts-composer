import type { CameraStateSnapshot } from "@austencloud/scene-3d";
import { Plane } from "@austencloud/scene-3d";
import type { GridJoinSpec } from "@tka/render-core";
import type { SceneEnvironmentId } from "../environments/domain/scene-environment";

import { GRID_RADIUS_3D } from "../domain/constants/plane-transforms";
import { getViewerFrontStageCameraZ } from "../domain/viewer-formation-facing";
import { getBlossomOpeningCamera } from "../environments/scenes/cherry-blossom/blossom-site";
import { gridJoinOffset3D } from "../services/grid-join-3d";
import { CANONICAL_PERFORMER_ANCHOR_Y } from "../environments/domain/stage-coordinate-frame";
import {
  DEFAULT_PERFORMER_HAND_DISTANCE,
  fixedHandDistance,
  type PerformerHandDistance,
} from "../domain/performer-hand-distance";

const GRID_CENTER_Y = 0;
const GRID_CENTER_Z = 0.3;

export interface ViewerCameraFraming {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/** Level a joined opening at the rig's grid center without losing the elevated shot's fit distance. */
export function levelJoinedViewerOpeningShot(
  shot: {
    eye: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  },
  stageGroundOffset: number,
  environmentId: SceneEnvironmentId
): ViewerCameraFraming {
  const distance = Math.hypot(
    shot.eye.x - shot.target.x,
    shot.eye.y - stageGroundOffset,
    shot.eye.z - shot.target.z
  );
  return {
    position: {
      x: shot.target.x,
      y: stageGroundOffset,
      z: getViewerFrontStageCameraZ(shot.target.z, distance, environmentId),
    },
    target: { x: shot.target.x, y: stageGroundOffset, z: shot.target.z },
  };
}

export interface ViewerCameraFramingOptions {
  environmentId: SceneEnvironmentId;
  fov: number;
  document?: Document | null;
  /**
   * The lead performer's largest hand distance in meters. The opening shot
   * sizes the 3D hand ring to the 2D card's, so a longer reach frames wider.
   */
  handDistance?: number;
  conjoined?: GridJoinSpec | null;
  performers?: readonly {
    position: { x: number; z: number };
    handDistance?: PerformerHandDistance;
    conjoined?: GridJoinSpec | null;
  }[];
}

export function joinedPerformerExtent(
  hands: PerformerHandDistance = DEFAULT_PERFORMER_HAND_DISTANCE,
  conjoined?: GridJoinSpec | null
): number {
  const handReach = Math.max(hands.left.max, hands.right.max);
  if (!conjoined) return handReach;
  let extent = handReach;
  for (const plane of [Plane.WALL, Plane.WHEEL, Plane.FLOOR]) {
    for (const hand of ["left", "right"] as const) {
      const offset = gridJoinOffset3D(conjoined, hand, plane, hands[hand]);
      extent = Math.max(
        extent,
        Math.hypot(offset.x, offset.y, offset.z) + hands[hand].max
      );
    }
  }
  return extent;
}

function isFinitePoint(
  point: { x: number; y: number; z: number } | undefined | null
): point is { x: number; y: number; z: number } {
  return Boolean(
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

function distanceSquared(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * OrbitControls enforces a one-metre minimum radius. A saved pose tighter than
 * that cannot be a healthy result of the production controls.
 */
export function isValidViewerCameraSnapshot(
  snapshot: CameraStateSnapshot | null | undefined
): snapshot is CameraStateSnapshot {
  if (!snapshot) return false;
  return isValidViewerCameraPose(
    snapshot.position,
    snapshot.target,
    snapshot.fov
  );
}

export function isValidViewerCameraPose(
  position: { x: number; y: number; z: number } | null | undefined,
  target: { x: number; y: number; z: number } | null | undefined,
  fov: number
): boolean {
  return (
    isFinitePoint(position) &&
    isFinitePoint(target) &&
    Number.isFinite(fov) &&
    fov > 0 &&
    // Damped travel and three-decimal camera URLs can land just below one metre.
    distanceSquared(position, target) >= 0.999 ** 2 &&
    target.y >= -0.5
  );
}

/**
 * Match the 3D stage to the neighboring 2D Choreo card when that canvas is
 * present. Both the Threlte and worker renderers use this owner so switching
 * backends never changes the opening shot.
 */
export function computeViewerAlignedCamera(
  options: ViewerCameraFramingOptions
): ViewerCameraFraming {
  const performers = options.performers;
  const centerX = performers?.length
    ? performers.reduce((sum, performer) => sum + performer.position.x, 0) /
      performers.length
    : 0;
  const centerZ = performers?.length
    ? performers.reduce((sum, performer) => sum + performer.position.z, 0) /
      performers.length
    : 0;
  const handDistance = performers?.length
    ? Math.max(
        ...performers.map(
          (performer) =>
            Math.hypot(
              performer.position.x - centerX,
              performer.position.z - centerZ
            ) +
            joinedPerformerExtent(performer.handDistance, performer.conjoined)
        )
      )
    : options.conjoined
      ? joinedPerformerExtent(
          {
            left: fixedHandDistance(options.handDistance ?? GRID_RADIUS_3D),
            right: fixedHandDistance(options.handDistance ?? GRID_RADIUS_3D),
          },
          options.conjoined
        )
      : (options.handDistance ?? GRID_RADIUS_3D);
  const hasJoinedGrid =
    Boolean(options.conjoined) ||
    Boolean(performers?.some((performer) => performer.conjoined));
  const target = {
    x: centerX,
    y: hasJoinedGrid ? CANONICAL_PERFORMER_ANCHOR_Y : GRID_CENTER_Y,
    z: GRID_CENTER_Z + centerZ,
  };
  const ownerDocument =
    options.document === undefined
      ? typeof document === "undefined"
        ? null
        : document
      : options.document;
  const view = ownerDocument?.defaultView;
  const aspect =
    view && view.innerHeight > 0 ? view.innerWidth / view.innerHeight : 1;
  const verticalHalfFov = ((options.fov / 2) * Math.PI) / 180;
  const horizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * Math.max(0.1, aspect)
  );
  const fallbackDistance = Math.max(
    2.8 * Math.max(1, handDistance / GRID_RADIUS_3D),
    (handDistance * 1.15) /
      Math.tan(Math.min(verticalHalfFov, horizontalHalfFov))
  );
  let fallback = {
    position: {
      x: centerX,
      y: target.y,
      z: getViewerFrontStageCameraZ(
        target.z,
        fallbackDistance,
        options.environmentId
      ),
    },
    target,
  };
  const defaultBlossomFormation =
    !options.conjoined &&
    (!performers?.length ||
      (performers.length === 1 &&
        performers[0]?.position.x === 0 &&
        performers[0]?.position.z === 0 &&
        !performers[0]?.conjoined));
  if (options.environmentId === "blossom" && defaultBlossomFormation) {
    const camera = getBlossomOpeningCamera(
      Boolean(view && view.innerWidth < view.innerHeight)
    );
    const [x, y, z] = camera.position;
    const [tx, ty, tz] = camera.target;
    fallback = { position: { x, y, z }, target: { x: tx, y: ty, z: tz } };
  }
  // The neighboring 2D card scales a single grid. Its pixel diameter cannot
  // size the joined outer rings, so retain the 3D FOV fit for those scores.
  if (hasJoinedGrid) return fallback;
  if (!ownerDocument) return fallback;

  let canvas2D: HTMLCanvasElement | null = null;
  let paneElement: Element | null = null;
  for (const canvas of ownerDocument.querySelectorAll("canvas")) {
    const bounds = canvas.getBoundingClientRect();
    if (
      Math.abs(bounds.width - bounds.height) < 10 &&
      bounds.width > 200 &&
      bounds.width < 1200
    ) {
      canvas2D = canvas;
      paneElement =
        canvas.closest(".animation-pane") || canvas.closest(".media-pane");
      break;
    }
  }
  if (!canvas2D || !paneElement) return fallback;

  const canvasBounds = canvas2D.getBoundingClientRect();
  const paneBounds = paneElement.getBoundingClientRect();
  if (paneBounds.width <= 0 || paneBounds.height <= 0) return fallback;

  const gridDiameterPx = canvasBounds.width * 0.286 * 2;
  const gridCenterY =
    canvasBounds.top + canvasBounds.height / 2 - paneBounds.top;
  const centerYFraction = gridCenterY / paneBounds.height;
  const diameterFraction = gridDiameterPx / paneBounds.width;
  if (!Number.isFinite(diameterFraction) || diameterFraction <= 0)
    return fallback;

  const paneAspect = paneBounds.width / paneBounds.height;
  const paneHorizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * paneAspect
  );
  const visibleWidthAtUnitDistance = 2 * Math.tan(paneHorizontalHalfFov);
  const distance =
    (handDistance * 2) / (diameterFraction * visibleWidthAtUnitDistance);
  const cameraYOffset =
    (0.5 - centerYFraction) * (2 * distance * Math.tan(verticalHalfFov));

  return {
    position: {
      x: centerX,
      y: GRID_CENTER_Y + cameraYOffset,
      z: getViewerFrontStageCameraZ(target.z, distance, options.environmentId),
    },
    target,
  };
}
