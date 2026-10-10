import type { CopyOp } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";

export type TunnelReflection = "none" | "mirror" | "flip";

export interface TunnelRelationshipRule {
  rotationSteps: number;
  reflect: TunnelReflection;
  invert: boolean;
  rewind: boolean;
}

export const DEFAULT_TUNNEL_RELATIONSHIP: TunnelRelationshipRule = {
  rotationSteps: 0,
  reflect: "none",
  invert: false,
  rewind: false,
};

export function tunnelRelationshipOps(rule: TunnelRelationshipRule): CopyOp[] {
  const ops: CopyOp[] = [];
  const rotationSteps = ((Math.round(rule.rotationSteps) % 8) + 8) % 8;
  if (rotationSteps > 0) {
    ops.push({ kind: "rotate", amount: rotationSteps });
  }
  if (rule.reflect === "mirror") ops.push({ kind: "mirror" });
  if (rule.reflect === "flip") ops.push({ kind: "flip" });
  if (rule.invert) ops.push({ kind: "invert" });
  if (rule.rewind) ops.push({ kind: "rewind" });
  return ops;
}

/** Rebuild the creator controls from a persisted derived-performer rule. */
export function tunnelRelationshipFromOps(
  ops: CopyOp[]
): TunnelRelationshipRule {
  const rotation = ops.find((op) => op.kind === "rotate");
  return {
    rotationSteps:
      rotation?.kind === "rotate"
        ? ((Math.round(rotation.amount) % 8) + 8) % 8
        : 0,
    reflect: ops.some((op) => op.kind === "mirror")
      ? "mirror"
      : ops.some((op) => op.kind === "flip")
        ? "flip"
        : "none",
    invert: ops.some((op) => op.kind === "invert"),
    rewind: ops.some((op) => op.kind === "rewind"),
  };
}

export function updateTunnelRelationship(
  rule: TunnelRelationshipRule,
  patch: Partial<TunnelRelationshipRule>
): TunnelRelationshipRule {
  return {
    ...rule,
    ...patch,
    rotationSteps:
      ((Math.round(patch.rotationSteps ?? rule.rotationSteps) % 8) + 8) % 8,
  };
}
