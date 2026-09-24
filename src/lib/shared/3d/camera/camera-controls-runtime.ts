import CameraControls from "camera-controls";
import {
  Box3,
  MathUtils,
  Matrix4,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from "three";

CameraControls.install({
  THREE: {
    Vector2,
    Vector3,
    Vector4,
    Quaternion,
    Matrix4,
    Spherical,
    Box3,
    Sphere,
    Raycaster,
    MathUtils,
  },
});

export type CameraRightDragAction = "pan" | "rotate" | "none";
export type CameraControlsMouseAction =
  | typeof CameraControls.ACTION.ROTATE
  | typeof CameraControls.ACTION.TRUCK
  | typeof CameraControls.ACTION.NONE;

export function resolveCameraControlsRightAction(
  rightDragAction: CameraRightDragAction | undefined,
  enablePan: boolean
): CameraControlsMouseAction {
  if (rightDragAction === "rotate") return CameraControls.ACTION.ROTATE;
  if (rightDragAction === "pan") return CameraControls.ACTION.TRUCK;
  if (rightDragAction === "none") return CameraControls.ACTION.NONE;
  return enablePan ? CameraControls.ACTION.TRUCK : CameraControls.ACTION.NONE;
}

export function applyCameraControlsInputActions(
  controls: CameraControls,
  rightAction: CameraControlsMouseAction,
  enablePan: boolean
): void {
  controls.mouseButtons.right = rightAction;
  controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
  controls.touches.two = enablePan
    ? CameraControls.ACTION.TOUCH_DOLLY_TRUCK
    : CameraControls.ACTION.TOUCH_DOLLY_ROTATE;
}

export { CameraControls };

// Travelling past minDistance carries the pivot along only minDistance ahead of
// the lens, so the next drag would spin the view around the viewer's own head.
// A rotate that starts on a pivot travel pushed there re-seats it this far out,
// matching the stage's default framing radius.
export const VIEWER_ORBIT_REST_DISTANCE = 3;
// Travel holds the radius a little above minDistance (about 8% in practice)
// while it pushes the pivot, so "at the floor" is a band, not an exact value.
const ORBIT_FLOOR_BAND = 1.25;
// Travel shorter than this is treated as stopping on what was being approached,
// such as a performer, so that deliberate close pivot stays where it is.
const PIVOT_PUSH_TOLERANCE = 0.25;

const ROTATE_ACTIONS = [
  CameraControls.ACTION.ROTATE,
  CameraControls.ACTION.TOUCH_ROTATE,
];

/**
 * Viewer orbit navigation: wheel/pinch travel continues past the orbit limits,
 * and a pivot that travel dragged against the camera is moved back out before
 * the next rotate. Returns the cleanup for the listeners it adds.
 */
export function configureViewerOrbitNavigation(
  controls: CameraControls
): () => void {
  // Exploring a scene must not strand the camera at an empty, panned target.
  // Continue travelling past the orbit limits, toward the pointer/pinch centre.
  controls.infinityDolly = true;
  controls.dollyToCursor = true;

  const target = new Vector3();
  const position = new Vector3();
  // Where the pivot sat when the orbit radius first reached the floor.
  let floorAnchor: Vector3 | null = null;

  const isAtFloor = () =>
    controls.distance <= controls.minDistance * ORBIT_FLOOR_BAND;

  const trackFloor = () => {
    if (!isAtFloor()) {
      floorAnchor = null;
      return;
    }
    if (!floorAnchor) floorAnchor = controls.getTarget(new Vector3());
  };

  const reseatPushedPivot = () => {
    const action = controls.currentAction;
    if (!ROTATE_ACTIONS.some((rotate) => (action & rotate) === rotate)) return;
    if (!floorAnchor || !isAtFloor()) return;
    controls.getTarget(target);
    if (target.distanceTo(floorAnchor) < PIVOT_PUSH_TOLERANCE) return;
    const restDistance = Math.min(
      VIEWER_ORBIT_REST_DISTANCE,
      controls.maxDistance
    );
    if (restDistance <= controls.distance) return;
    // Slide the pivot out along the current view ray. The camera and its view
    // direction are unchanged, so nothing moves until the drag itself does.
    controls.getPosition(position);
    target.sub(position).normalize().multiplyScalar(restDistance).add(position);
    controls.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
      false
    );
    floorAnchor = null;
  };

  controls.addEventListener("update", trackFloor);
  controls.addEventListener("controlstart", reseatPushedPivot);
  return () => {
    controls.removeEventListener("update", trackFloor);
    controls.removeEventListener("controlstart", reseatPushedPivot);
  };
}
