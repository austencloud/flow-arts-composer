type Point3 = { x: number; y: number; z: number };

const PERFORMER_CENTER_Y = 1.2;
const FRAMING_PADDING = 1.5;

/** Refit Composer shots for Unreal's horizontal FOV and floor-level origin. */
export function frameNativeCamera(
  position: Point3,
  target: Point3,
  radius: number,
  viewportAspect: number,
  horizontalFov: number
): { position: Point3; target: Point3 } {
  const aspect = Math.max(0.1, viewportAspect);
  const horizontalHalfFov = (horizontalFov * Math.PI) / 360;
  const verticalHalfFov = Math.atan(Math.tan(horizontalHalfFov) / aspect);
  const minimumDistance =
    (radius * FRAMING_PADDING) /
    Math.sin(Math.min(horizontalHalfFov, verticalHalfFov));
  const requestedDirection = {
    x: position.x - target.x,
    y: position.y - target.y,
    z: position.z - target.z,
  };
  const distance = Math.hypot(
    requestedDirection.x,
    requestedDirection.y,
    requestedDirection.z
  );
  const direction =
    distance > 0.001 ? requestedDirection : { x: 0, y: 0, z: 1 };
  // Shared shots assume a vertical FOV. Preserve their direction, but refit
  // distance so a portrait viewport does not push the performer away.
  const scale = distance > 0.001 ? minimumDistance / distance : minimumDistance;
  const framedTarget = { ...target, y: Math.max(target.y, PERFORMER_CENTER_Y) };
  return {
    position: {
      x: framedTarget.x + direction.x * scale,
      y: framedTarget.y + direction.y * scale,
      z: framedTarget.z + direction.z * scale,
    },
    target: framedTarget,
  };
}
