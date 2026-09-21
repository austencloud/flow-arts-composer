import { Vector3, type Object3D } from "three";
import {
  auditPosedMeshAgainstStaff,
  type PosedMeshAuditResult,
} from "./posed-mesh-audit";

// Conservative physical envelopes from build-fire-double-staff-model.py.
// Knots have a wider envelope than the wrapped grip; no part uses SVG scale.
const PROFILE = [
  { from: -0.45, to: -0.376, radius: 0.027 },
  { from: -0.376, to: -0.362, radius: 0.00912 },
  { from: -0.362, to: -0.209, radius: 0.008 },
  // The narrow ridges and marker bands stand above the nominal 19 mm grip.
  { from: -0.209, to: 0.209, radius: 0.01045 },
  { from: 0.209, to: 0.362, radius: 0.008 },
  { from: 0.362, to: 0.376, radius: 0.00912 },
  { from: 0.376, to: 0.45, radius: 0.027 },
] as const;

export function auditFireStaffProfile(
  root: Object3D | null,
  a: Readonly<Vector3>,
  b: Readonly<Vector3>,
  options: { maxTriangles?: number; deadlineMs?: number } = {}
): PosedMeshAuditResult {
  const center = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  const axis = new Vector3().subVectors(b, a).normalize();
  const startedAt = performance.now();
  let remaining = options.maxTriangles;
  const samples: PosedMeshAuditResult[] = [];
  for (const { from, to, radius } of PROFILE) {
    if (
      options.deadlineMs !== undefined &&
      performance.now() - startedAt >= options.deadlineMs
    ) {
      samples.push({
        status: "exhausted",
        maximumPenetrationM: null,
        affectedRegions: [],
        testedTriangles: 0,
        excludedPalmTriangles: 0,
        reason: "profile-deadline-exhausted",
        interiorContainment: "unavailable",
      });
      break;
    }
    const sample = auditPosedMeshAgainstStaff({
      root,
      staff: {
        a: center.clone().addScaledVector(axis, from),
        b: center.clone().addScaledVector(axis, to),
        radius,
      },
      maxTriangles: remaining,
    });
    samples.push(sample);
    if (remaining !== undefined) {
      remaining = Math.max(0, remaining - sample.testedTriangles);
      if (sample.status === "exhausted") break;
    }
  }
  const unavailable = samples.find((sample) => sample.status !== "available");
  const contains = samples.some(
    (sample) => sample.interiorContainment === "contained"
  );
  const ambiguous = samples.some(
    (sample) => sample.interiorContainment === "ambiguous"
  );
  return {
    status: unavailable?.status ?? "available",
    worstIntersection: samples.reduce<
      PosedMeshAuditResult["worstIntersection"]
    >(
      (worst, sample) =>
        sample.worstIntersection &&
        (!worst || sample.worstIntersection.penetrationM > worst.penetrationM)
          ? sample.worstIntersection
          : worst,
      null
    ),
    maximumPenetrationM: samples.every(
      (sample) => sample.maximumPenetrationM !== null
    )
      ? Math.max(...samples.map((sample) => sample.maximumPenetrationM!))
      : null,
    affectedRegions: [
      ...new Set(samples.flatMap((sample) => sample.affectedRegions)),
    ].sort(),
    testedTriangles: samples.reduce(
      (total, sample) => total + sample.testedTriangles,
      0
    ),
    excludedPalmTriangles: 0,
    reason: unavailable?.reason ?? null,
    interiorContainment: contains
      ? "contained"
      : ambiguous
        ? "ambiguous"
        : samples.some((sample) => sample.interiorContainment === "unavailable")
          ? "unavailable"
          : "clear",
  };
}
