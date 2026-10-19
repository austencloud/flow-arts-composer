import { Vector3 } from "three";
import type {
  AvatarPoseDiagnostics,
  CollisionEvent,
} from "@austencloud/scene-3d";

type CollisionSeverity = CollisionEvent["severity"];
type CollisionZone = CollisionEvent["zone"];

const SEVERITY_RANK: Record<CollisionSeverity, number> = {
  graze: 0,
  clip: 1,
  penetrate: 2,
};
const MAX_DESCRIPTIONS_PER_CLUSTER = 12;
/** The browser snapshot is written every few frames, so it carries only the
 *  deepest spans. An 11 MB snapshot froze playback for 230 ms each write. */
const MAX_PUBLISHED_CLUSTERS = 40;

export const AVATAR_COLLISION_AUDIT_STORAGE_KEY =
  "__avatarCollisionAuditReport";
export const AVATAR_COLLISION_AUDIT_ATTRIBUTE =
  "data-avatar-collision-audit-report";

export interface CollisionCluster {
  performerId: string;
  zone: CollisionZone;
  severity: CollisionSeverity;
  frameCount: number;
  firstStep: number;
  firstProgress: number;
  lastStep: number;
  lastProgress: number;
  worstStep: number;
  worstProgress: number;
  worstPenetrationDepth: number;
  worstPose: AvatarPoseDiagnostics;
  worstDescription: string;
  descriptions: string[];
}

export interface CollisionAuditReport {
  sampledFrames: number;
  currentPoseByPerformer: Record<string, AvatarPoseDiagnostics>;
  clusters: CollisionCluster[];
}

/** The browser snapshot: the deepest clusters and how many exist in all. */
export interface CollisionAuditSnapshot extends CollisionAuditReport {
  totalClusters: number;
}

interface MutableCluster extends CollisionCluster {
  descriptionSet: Set<string>;
}

function clusterKey(performerId: string, zone: CollisionZone): string {
  return `${performerId}:${zone}`;
}

/**
 * Where a span starts, to a tenth of a beat. Every loop of a playing sequence
 * repeats the same spans with slightly different frame timing; folding them
 * by start keeps the audit the size of one loop however long playback runs.
 */
function spanKey(cluster: CollisionCluster): string {
  return `${cluster.performerId}:${cluster.zone}:${cluster.firstStep}:${Math.round(cluster.firstProgress * 10)}`;
}

function copyCluster(cluster: MutableCluster): CollisionCluster {
  const { descriptionSet: _descriptionSet, ...copy } = cluster;
  return { ...copy, descriptions: [...copy.descriptions] };
}

function descriptionCategory(description: string): string {
  return description
    .replace(/\d+(?:\.\d+)?cm/g, "#cm")
    .replace(/\s*\([^)]*\)\s*$/, "");
}

/** Groups per-render-frame collision events into reviewable motion spans. */
export class AvatarSequenceCollisionAudit {
  private readonly open = new Map<string, MutableCluster>();
  private readonly completed = new Map<string, CollisionCluster>();
  private readonly currentPoseByPerformer = new Map<
    string,
    AvatarPoseDiagnostics
  >();
  private sampledFrames = 0;

  record(
    performerId: string,
    events: readonly CollisionEvent[],
    diagnostics: AvatarPoseDiagnostics = {
      requestedStanceYawRad: 0,
      achievedShoulderYawRad: 0,
      shoulderWidth: 0,
      requestedSpinePitchRad: 0,
      appliedStanceYawRad: 0,
      appliedReachLeanRad: 0,
      appliedHeadDodgeRad: 0,
      achievedTorsoPitchRad: 0,
      leftUpperArmLength: 0,
      leftForearmLength: 0,
      rightUpperArmLength: 0,
      rightForearmLength: 0,
      leftElbowWorld: new Vector3(),
      rightElbowWorld: new Vector3(),
    }
  ): void {
    this.sampledFrames += 1;
    this.currentPoseByPerformer.set(performerId, { ...diagnostics });
    const worstByZone = new Map<CollisionZone, CollisionEvent>();

    for (const event of events) {
      const current = worstByZone.get(event.zone);
      if (!current || event.penetrationDepth > current.penetrationDepth) {
        worstByZone.set(event.zone, event);
      }
    }

    for (const [key, cluster] of this.open) {
      if (cluster.performerId !== performerId) continue;
      if (!worstByZone.has(cluster.zone)) {
        this.complete(copyCluster(cluster));
        this.open.delete(key);
      }
    }

    for (const [zone, event] of worstByZone) {
      const key = clusterKey(performerId, zone);
      const cluster = this.open.get(key);
      if (!cluster) {
        this.open.set(key, {
          performerId,
          zone,
          severity: event.severity,
          frameCount: 1,
          firstStep: event.stepNumber,
          firstProgress: event.beatProgress,
          lastStep: event.stepNumber,
          lastProgress: event.beatProgress,
          worstStep: event.stepNumber,
          worstProgress: event.beatProgress,
          worstPenetrationDepth: event.penetrationDepth,
          worstPose: { ...diagnostics },
          worstDescription: event.description,
          descriptions: [event.description],
          descriptionSet: new Set([descriptionCategory(event.description)]),
        });
        continue;
      }

      cluster.frameCount += 1;
      cluster.lastStep = event.stepNumber;
      cluster.lastProgress = event.beatProgress;
      if (SEVERITY_RANK[event.severity] > SEVERITY_RANK[cluster.severity]) {
        cluster.severity = event.severity;
      }
      if (event.penetrationDepth > cluster.worstPenetrationDepth) {
        cluster.worstPenetrationDepth = event.penetrationDepth;
        cluster.worstStep = event.stepNumber;
        cluster.worstProgress = event.beatProgress;
        cluster.worstPose = { ...diagnostics };
        cluster.worstDescription = event.description;
      }
      const category = descriptionCategory(event.description);
      if (
        !cluster.descriptionSet.has(category) &&
        cluster.descriptions.length < MAX_DESCRIPTIONS_PER_CLUSTER
      ) {
        cluster.descriptionSet.add(category);
        cluster.descriptions.push(event.description);
      }
    }

    if (this.sampledFrames % 15 === 0) this.publishBrowserSnapshot();
  }

  report(): CollisionAuditReport {
    return this.buildReport(this.deepestFirst());
  }

  clear(): void {
    this.open.clear();
    this.completed.clear();
    this.currentPoseByPerformer.clear();
    this.sampledFrames = 0;
    this.publishBrowserSnapshot();
  }

  private complete(cluster: CollisionCluster): void {
    const key = spanKey(cluster);
    const previous = this.completed.get(key);
    if (
      !previous ||
      cluster.worstPenetrationDepth > previous.worstPenetrationDepth
    ) {
      this.completed.set(key, cluster);
    }
  }

  private deepestFirst(): (CollisionCluster | MutableCluster)[] {
    return [...this.completed.values(), ...this.open.values()].sort(
      (a, b) => b.worstPenetrationDepth - a.worstPenetrationDepth
    );
  }

  private buildReport(
    clusters: (CollisionCluster | MutableCluster)[]
  ): CollisionAuditReport {
    return {
      sampledFrames: this.sampledFrames,
      currentPoseByPerformer: Object.fromEntries(
        [...this.currentPoseByPerformer].map(([performerId, diagnostics]) => [
          performerId,
          { ...diagnostics },
        ])
      ),
      clusters: clusters.map((cluster) =>
        "descriptionSet" in cluster
          ? copyCluster(cluster)
          : { ...cluster, descriptions: [...cluster.descriptions] }
      ),
    };
  }

  private publishBrowserSnapshot(): void {
    const clusters = this.deepestFirst();
    const snapshot: CollisionAuditSnapshot = {
      ...this.buildReport(clusters.slice(0, MAX_PUBLISHED_CLUSTERS)),
      totalClusters: clusters.length,
    };
    const serializedReport = JSON.stringify(snapshot);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(
        AVATAR_COLLISION_AUDIT_STORAGE_KEY,
        serializedReport
      );
    }
    if (typeof document !== "undefined" && import.meta.env.DEV) {
      document.documentElement.setAttribute(
        AVATAR_COLLISION_AUDIT_ATTRIBUTE,
        serializedReport
      );
    }
  }
}

let audit: AvatarSequenceCollisionAudit | undefined;

export function getAvatarSequenceCollisionAudit(): AvatarSequenceCollisionAudit {
  audit ??= new AvatarSequenceCollisionAudit();
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    (
      window as typeof window & {
        __avatarCollisionAudit?: AvatarSequenceCollisionAudit;
      }
    ).__avatarCollisionAudit = audit;
  }
  return audit;
}
