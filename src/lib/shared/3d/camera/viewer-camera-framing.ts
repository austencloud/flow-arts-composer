import type { CameraStateSnapshot } from "@austencloud/scene-3d";
import type { SceneEnvironmentId } from "../environments/domain/scene-environment";

import { GRID_RADIUS_3D } from "../domain/constants/plane-transforms";
import { getViewerFrontStageCameraZ } from "../domain/viewer-formation-facing";
import { getBlossomOpeningCamera } from "../environments/scenes/cherry-blossom/blossom-site";

const GRID_CENTER_Y = 0;
const GRID_CENTER_Z = 0.3;

export interface ViewerCameraFraming {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
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
  const target = { x: 0, y: GRID_CENTER_Y, z: GRID_CENTER_Z };
  let fallback = {
    position: {
      x: 0,
      y: 0,
      z: getViewerFrontStageCameraZ(GRID_CENTER_Z, 2.8, options.environmentId),
    },
    target,
  };
  const ownerDocument =
    options.document === undefined
      ? typeof document === "undefined"
        ? null
        : document
      : options.document;
  if (options.environmentId === "blossom") {
    const view = ownerDocument?.defaultView;
    const camera = getBlossomOpeningCamera(
      Boolean(view && view.innerWidth < view.innerHeight)
    );
    const [x, y, z] = camera.position;
    const [tx, ty, tz] = camera.target;
    fallback = { position: { x, y, z }, target: { x: tx, y: ty, z: tz } };
  }
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

  const aspect = paneBounds.width / paneBounds.height;
  const verticalHalfFov = ((options.fov / 2) * Math.PI) / 180;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const visibleWidthAtUnitDistance = 2 * Math.tan(horizontalHalfFov);
  const handDistance = options.handDistance ?? GRID_RADIUS_3D;
  const distance =
    (handDistance * 2) / (diameterFraction * visibleWidthAtUnitDistance);
  const cameraYOffset =
    (0.5 - centerYFraction) * (2 * distance * Math.tan(verticalHalfFov));

  return {
    position: {
      x: 0,
      y: GRID_CENTER_Y + cameraYOffset,
      z: getViewerFrontStageCameraZ(
        GRID_CENTER_Z,
        distance,
        options.environmentId
      ),
    },
    target,
  };
}
