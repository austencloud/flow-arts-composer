import CameraControls from "camera-controls";
import {
  floorLift,
  seatPivotOnCast,
  type CastStanding,
} from "./cast-framing";
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
// Travel holds the radius near minDistance; under 75% of it the pivot is
// collapsing onto the lens.
const ORBIT_COLLAPSE_RATIO = 0.75;

const ROTATE_ACTIONS = [
  CameraControls.ACTION.ROTATE,
  CameraControls.ACTION.TOUCH_ROTATE,
];

/**
 * Viewer orbit navigation: wheel/pinch travel continues past the orbit limits,
 * and a pivot that travel dragged against the camera is moved back out before
 * the next rotate. Returns the cleanup for the listeners it adds.
 */
export interface ViewerOrbitNavigationOptions {
  /**
   * Where the performers stand. A rotate that starts with the pivot off them
   * re-seats it on the performers first (see seatPivotOnCast).
   */
  pivotCast?: () => CastStanding | null;
}

export function configureViewerOrbitNavigation(
  controls: CameraControls,
  options: ViewerOrbitNavigationOptions = {}
): () => void {
  // Exploring a scene must not strand the camera at an empty, panned target.
  // Continue travelling past the near limit, toward the pointer/pinch centre.
  controls.infinityDolly = true;
  controls.dollyToCursor = true;

  // Travel-through belongs to zooming IN only. camera-controls applies it in
  // both directions: past maxDistance a wheel-out keeps the radius and shoves
  // the pivot backwards, away from the cast, as far as the user keeps
  // scrolling (a reported pose had camera and pivot ~66 m out). And because
  // an infinity wheel-in queues an end radius below minDistance, a single
  // wheel-out tick that follows flips the travel direction, the near-limit
  // push stops, and the radius shrinks onto the queued value: the orbit
  // collapses with the pivot ~0.4 m in front of the lens. A wheel-out
  // therefore runs as a plain clamped dolly, which also lifts a queued
  // too-short radius back to minDistance.
  const element = (controls as unknown as { _domElement?: HTMLElement })
    ._domElement;
  //
  // Zooming out also runs about the pivot rather than the pointer: with
  // dolly-to-cursor, thirty ticks out with the pointer low in the view carried
  // the pivot 2 m sideways and 4 m above the floor, off the performers. The
  // sideways shift is applied in update() from a pending dolly amount, so a
  // wheel-out clears that amount as well. A pointer press restores the
  // defaults for drag and pinch dolly.
  type DollyInternals = { _changedDolly?: number };
  const chooseTravelForWheel = (event: WheelEvent) => {
    const zoomingIn = event.deltaY < 0;
    controls.infinityDolly = zoomingIn;
    controls.dollyToCursor = zoomingIn;
    if (!zoomingIn) (controls as unknown as DollyInternals)._changedDolly = 0;
  };
  const restoreDollyDefaults = () => {
    controls.infinityDolly = true;
    controls.dollyToCursor = true;
  };
  element?.addEventListener("wheel", chooseTravelForWheel, {
    capture: true,
    passive: true,
  });
  element?.addEventListener("pointerdown", restoreDollyDefaults, {
    capture: true,
    passive: true,
  });

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

  // Used only without cast information (keepPivotOnCast covers the rest).
  const reseatPushedPivot = () => {
    const action = controls.currentAction;
    if (!ROTATE_ACTIONS.some((rotate) => (action & rotate) === rotate)) return;
    if (options.pivotCast?.()) return;
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

  // A rotate orbits the performers at their real distance: wheel travel, a
  // pan or a stale pose can leave the pivot in the scenery or just in front
  // of the lens, and dragging would then swing the camera around that point.
  type FrustumCamera = { fov?: number; aspect?: number };
  const keepPivotOnCast = () => {
    const action = controls.currentAction;
    if (!ROTATE_ACTIONS.some((rotate) => (action & rotate) === rotate)) return;
    const cast = options.pivotCast?.();
    if (!cast) return;
    controls.getPosition(position);
    controls.getTarget(target);
    const camera = controls.camera as unknown as FrustumCamera;
    const next = seatPivotOnCast(position, target, cast, {
      fovDeg: camera.fov ?? 50,
      aspect: camera.aspect ?? 16 / 9,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
    });
    if (!next) return;
    controls.setLookAt(
      next.position.x,
      next.position.y,
      next.position.z,
      next.target.x,
      next.target.y,
      next.target.z,
      next.animate
    );
    floorAnchor = null;
  };

  // Last line of defence for any path (pinch reversal, a transition, a
  // restored pose): an orbit radius well under the floor is a collapsing
  // pivot, never a view anyone asked for. Slide the pivot out along the view
  // ray; the camera and its direction stay where they are.
  const keepPivotOffLens = () => {
    if (controls.distance >= controls.minDistance * ORBIT_COLLAPSE_RATIO) return;
    controls.getPosition(position);
    controls.getTarget(target);
    if (position.distanceToSquared(target) < 1e-12) return;
    const restDistance = Math.min(
      VIEWER_ORBIT_REST_DISTANCE,
      controls.maxDistance
    );
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
  };

  // Wheel zoom-in toward a point low in the picture drags the pivot down and
  // forward, and the polar clamp keeps the camera near pivot height, so the
  // camera sinks to the floor or under it. Lift the rig straight up, current
  // and end values each by their own amount, so a zoom, pan or transition in
  // flight carries on unchanged above the floor. The camera's position for
  // this frame is already set when "update" fires, so it is lifted too and the
  // frame never renders under the floor.
  type RigInternals = { _target: Vector3; _targetEnd: Vector3 };
  const rig = controls as unknown as RigInternals;
  const keepAboveFloor = () => {
    const cast = options.pivotCast?.();
    if (!cast) return;
    controls.getTarget(target, true);
    controls.getPosition(position, true);
    const liftEnd = floorLift(target.y, position.y, cast.floorY);
    if (liftEnd > 0) rig._targetEnd.y += liftEnd;
    controls.getTarget(target, false);
    controls.getPosition(position, false);
    const liftNow = floorLift(target.y, position.y, cast.floorY);
    if (liftNow > 0) {
      rig._target.y += liftNow;
      controls.camera.position.y += liftNow;
      controls.camera.updateMatrixWorld();
    }
  };

  controls.addEventListener("update", trackFloor);
  controls.addEventListener("update", keepPivotOffLens);
  controls.addEventListener("update", keepAboveFloor);
  controls.addEventListener("controlstart", reseatPushedPivot);
  controls.addEventListener("controlstart", keepPivotOnCast);
  return () => {
    element?.removeEventListener("wheel", chooseTravelForWheel, {
      capture: true,
    });
    element?.removeEventListener("pointerdown", restoreDollyDefaults, {
      capture: true,
    });
    controls.removeEventListener("update", trackFloor);
    controls.removeEventListener("update", keepPivotOffLens);
    controls.removeEventListener("update", keepAboveFloor);
    controls.removeEventListener("controlstart", reseatPushedPivot);
    controls.removeEventListener("controlstart", keepPivotOnCast);
  };
}
