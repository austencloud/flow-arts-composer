/**
 * Solving one inspection camera.
 *
 * An inspection lab frames a REGION — a grip zone, a reach envelope — rather
 * than a performer, so it cannot use
 * `#lib/shared/3d/camera/compute-framing-shot.js`, which bakes in a 1.2 m
 * per-performer horizontal extent and a 2 m minimum distance. The vocabulary
 * here is the one `test/film-director/_lib/camera-language.ts` uses: declare a
 * subject box, an azimuth and an elevation, and solve the distance.
 *
 * This is the shared arithmetic only. Which subjects exist and which views a
 * lab offers stay with that lab: `staff-grip/inspection-framing.ts` owns the
 * grip lab's four panes, `negative-space-reach/reach-framing.ts` owns the reach
 * lab's. Both solve through this function so the panes across the two labs
 * share one magnification law.
 */

export interface InspectionSubject {
  /** World-space point every camera for this subject looks at. */
  center: [number, number, number];
  /** Half the region's width in the image plane, in metres. */
  halfWidth: number;
  /** Half the region's height in the image plane, in metres. */
  halfHeight: number;
  /**
   * Half the region's extent along the performer's chest-forward axis. The
   * grips work on a plane standing in front of the chest, so an off-axis
   * camera sees that depth as extra width and an overhead one sees it as extra
   * height. Carrying it explicitly is what keeps the performer centred in the
   * three-quarter and overhead panes instead of drifting to one side.
   */
  halfDepth: number;
}

export interface InspectionShot {
  position: [number, number, number];
  target: [number, number, number];
}

/** One focal length across the set, so magnification reads as distance alone. */
export const INSPECTION_FOV_DEG = 36;

/** Keeps a close pane clear of the camera's near plane. */
export const MIN_INSPECTION_DISTANCE_METERS = 0.4;

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Place the eye so the whole subject box fits both frustum axes. A pane that
 * is tall and narrow has a much smaller horizontal field than its vertical
 * one, so fitting only the height would push the sides of the subject out of
 * frame.
 */
export function solveInspectionShot(
  subject: InspectionSubject,
  options: {
    fovDeg?: number;
    aspectRatio: number;
    azimuthDeg: number;
    elevationDeg: number;
    padding?: number;
  }
): InspectionShot {
  const {
    fovDeg = INSPECTION_FOV_DEG,
    aspectRatio,
    azimuthDeg,
    elevationDeg,
    padding = 1.08,
  } = options;

  const azimuthRad = azimuthDeg * DEGREES_TO_RADIANS;
  const elevationRad = elevationDeg * DEGREES_TO_RADIANS;

  const halfFovRad = (fovDeg / 2) * DEGREES_TO_RADIANS;
  const safeAspect = Math.max(0.1, aspectRatio);
  const horizontalHalfFovRad = Math.atan(Math.tan(halfFovRad) * safeAspect);

  // The in-plane extent is never foreshortened away: keeping it whole is what
  // makes the panes share one magnification instead of the off-axis views
  // quietly zooming in on a squashed circle. The chest-forward depth is added
  // to whichever screen axis the swing rotates it into.
  const viewHalfWidth =
    subject.halfWidth + subject.halfDepth * Math.abs(Math.sin(azimuthRad));
  const viewHalfHeight =
    subject.halfHeight + subject.halfDepth * Math.abs(Math.sin(elevationRad));

  const verticalDistance = (viewHalfHeight * padding) / Math.tan(halfFovRad);
  const horizontalDistance =
    (viewHalfWidth * padding) / Math.tan(horizontalHalfFovRad);
  const distance = Math.max(
    MIN_INSPECTION_DISTANCE_METERS,
    verticalDistance,
    horizontalDistance
  );

  const horizontal = distance * Math.cos(elevationRad);

  return {
    position: [
      subject.center[0] + Math.sin(azimuthRad) * horizontal,
      subject.center[1] + Math.sin(elevationRad) * distance,
      subject.center[2] + Math.cos(azimuthRad) * horizontal,
    ],
    target: [subject.center[0], subject.center[1], subject.center[2]],
  };
}
