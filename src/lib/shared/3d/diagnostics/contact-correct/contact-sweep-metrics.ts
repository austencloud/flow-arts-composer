import { Quaternion, Vector3 } from "three";
import type { PosedMeshAuditResult } from "./posed-mesh-audit";

export interface ContactSweepFrame {
  authoredEndpoints: readonly [Readonly<Vector3>, Readonly<Vector3>];
  renderedEndpoints: readonly [Readonly<Vector3>, Readonly<Vector3>];
  thumbToPinkyAxis: Readonly<Vector3> | null;
  meshAudit: PosedMeshAuditResult;
  body: {
    leftHand: Readonly<Vector3>;
    rightHand: Readonly<Vector3>;
    leftElbow: Readonly<Vector3>;
    rightElbow: Readonly<Vector3>;
    head: Readonly<Vector3>;
    rootRotation: Readonly<Quaternion>;
  } | null;
}

export interface ContactSweepMetrics {
  meshAvailable: boolean;
  endpointDriftM: number;
  directedAxisErrorDeg: number | null;
  meshPenetrationM: number | null;
  affectedRegions: readonly string[];
  bodyAvailable: boolean;
}

export type ContactSweepVerdict = "pass" | "fail" | "unavailable";

export interface ContactSweepGrade {
  verdict: ContactSweepVerdict;
  failingMetrics: readonly string[];
  maximumEndpointDriftM: number | null;
  maximumContinuityM: number | null;
}

export function directedAxisErrorDeg(
  axis: Readonly<Vector3> | null,
  staffA: Readonly<Vector3>,
  staffB: Readonly<Vector3>
): number | null {
  if (!axis || axis.lengthSq() <= 1e-12) return null;
  const staff = new Vector3().subVectors(staffB, staffA);
  if (staff.lengthSq() <= 1e-12) return null;
  return (
    (new Vector3().copy(axis).normalize().angleTo(staff.normalize()) * 180) /
    Math.PI
  );
}

export function measureContactSweepFrame(
  frame: ContactSweepFrame
): ContactSweepMetrics {
  const [authoredA, authoredB] = frame.authoredEndpoints;
  const [renderedA, renderedB] = frame.renderedEndpoints;
  return {
    meshAvailable: frame.meshAudit.status === "available",
    endpointDriftM: Math.max(
      authoredA.distanceTo(renderedA),
      authoredB.distanceTo(renderedB)
    ),
    directedAxisErrorDeg: directedAxisErrorDeg(
      frame.thumbToPinkyAxis,
      renderedA,
      renderedB
    ),
    meshPenetrationM:
      frame.meshAudit.status === "available"
        ? frame.meshAudit.maximumPenetrationM
        : null,
    affectedRegions: frame.meshAudit.affectedRegions,
    bodyAvailable: frame.body !== null,
  };
}

export function endpointContinuityM(
  previous: ContactSweepFrame,
  next: ContactSweepFrame
): number {
  return Math.max(
    previous.renderedEndpoints[0].distanceTo(next.renderedEndpoints[0]),
    previous.renderedEndpoints[1].distanceTo(next.renderedEndpoints[1])
  );
}

export function endpointAngularContinuityDeg(
  previous: ContactSweepFrame,
  next: ContactSweepFrame
): number {
  const before = new Vector3().subVectors(
    previous.renderedEndpoints[1],
    previous.renderedEndpoints[0]
  );
  const after = new Vector3().subVectors(
    next.renderedEndpoints[1],
    next.renderedEndpoints[0]
  );
  if (before.lengthSq() <= 1e-12 || after.lengthSq() <= 1e-12) return Infinity;
  return (before.angleTo(after) * 180) / Math.PI;
}

export function bodyContinuity(
  previous: ContactSweepFrame,
  next: ContactSweepFrame
): { displacementM: number; rotationDeg: number } | null {
  if (!previous.body || !next.body) return null;
  const displacementM = Math.max(
    previous.body.leftHand.distanceTo(next.body.leftHand),
    previous.body.rightHand.distanceTo(next.body.rightHand),
    previous.body.leftElbow.distanceTo(next.body.leftElbow),
    previous.body.rightElbow.distanceTo(next.body.rightElbow),
    previous.body.head.distanceTo(next.body.head)
  );
  return {
    displacementM,
    rotationDeg:
      (previous.body.rootRotation.angleTo(next.body.rootRotation) * 180) /
      Math.PI,
  };
}

export function gradeContactSweep(
  frames: readonly ContactSweepFrame[],
  limits: {
    endpointDriftM: number;
    directedAxisDeg: number;
    continuityM: number;
    requireVolumetricMesh?: boolean;
  }
): ContactSweepGrade {
  if (
    frames.length === 0 ||
    frames.some(
      (frame) =>
        frame.meshAudit.status !== "available" ||
        frame.body === null ||
        (limits.requireVolumetricMesh !== false &&
          frame.meshAudit.interiorContainment === "unavailable")
    )
  ) {
    const unavailable = frames.some(
      (frame) => frame.meshAudit.status !== "available"
    )
      ? "mesh-clearance"
      : frames.some(
            (frame) =>
              limits.requireVolumetricMesh !== false &&
              frame.meshAudit.interiorContainment === "unavailable"
          )
        ? "mesh-volume"
        : "body-continuity";
    return {
      verdict: "unavailable",
      failingMetrics: [unavailable],
      maximumEndpointDriftM: null,
      maximumContinuityM: null,
    };
  }
  let maximumEndpointDriftM = 0;
  let maximumContinuityM = 0;
  const failingMetrics = new Set<string>();
  for (let index = 0; index < frames.length; index += 1) {
    const metrics = measureContactSweepFrame(frames[index]!);
    maximumEndpointDriftM = Math.max(
      maximumEndpointDriftM,
      metrics.endpointDriftM
    );
    if (metrics.endpointDriftM > limits.endpointDriftM)
      failingMetrics.add("endpoint-drift");
    if (
      metrics.directedAxisErrorDeg === null ||
      metrics.directedAxisErrorDeg > limits.directedAxisDeg
    )
      failingMetrics.add("directed-axis");
    if ((metrics.meshPenetrationM ?? Infinity) > 0)
      failingMetrics.add("mesh-penetration");
    if (frames[index]!.meshAudit.interiorContainment === "contained")
      failingMetrics.add("mesh-contained");
    if (frames[index]!.meshAudit.interiorContainment === "ambiguous")
      failingMetrics.add("mesh-ambiguous");
    if (index > 0) {
      const continuity = endpointContinuityM(frames[index - 1]!, frames[index]!);
      maximumContinuityM = Math.max(maximumContinuityM, continuity);
      if (continuity > limits.continuityM) failingMetrics.add("continuity");
      const body = bodyContinuity(frames[index - 1]!, frames[index]!);
      if (
        !body ||
        body.displacementM > limits.continuityM ||
        body.rotationDeg > limits.directedAxisDeg
      )
        failingMetrics.add("body-continuity");
    }
  }
  return {
    verdict: failingMetrics.size === 0 ? "pass" : "fail",
    failingMetrics: [...failingMetrics].sort(),
    maximumEndpointDriftM,
    maximumContinuityM,
  };
}
