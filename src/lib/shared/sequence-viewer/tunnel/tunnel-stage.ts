import { t } from "#lib/shared/i18n/i18n.svelte.js";
import {
  generateCopyOps,
  imageCount,
  type CopyOp,
  type TunnelConfig,
} from "./tunnel-config";

export interface TunnelStageInstance {
  id: string;
  performerId: string;
  /** Position inside the current formation recipe. Zero is the base arm. */
  arm: number;
}

export interface TunnelStage {
  instances: TunnelStageInstance[];
}

export type TunnelStageIdFactory = (
  performerId: string,
  index: number
) => string;

/** All transform positions a formation offers, including the identity arm. */
export function tunnelFormationArms(config: TunnelConfig): CopyOp[][] {
  return [[], ...generateCopyOps(config)];
}

/**
 * Spread occupied positions across the available frame. Three performers in a
 * four-position radial frame use 0, 1, and 3 instead of bunching into 0, 1, 2.
 */
export function balancedTunnelStageArms(
  instanceCount: number,
  slotCount: number
): number[] {
  const count = Math.max(0, Math.min(Math.floor(instanceCount), slotCount));
  if (count === 0) return [];
  if (count === slotCount)
    return Array.from({ length: count }, (_, arm) => arm);
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * slotCount) / count)
  );
}

export function cloneTunnelStage(stage: TunnelStage): TunnelStage {
  return {
    instances: stage.instances.map((instance) => ({ ...instance })),
  };
}

/** One authored performer becomes one visible stage instance. */
export function createExplicitTunnelStage(
  performerIds: readonly string[],
  config: TunnelConfig,
  createId: TunnelStageIdFactory = (performerId, index) =>
    `stage-${performerId}-${index + 1}`
): TunnelStage {
  const arms = balancedTunnelStageArms(performerIds.length, imageCount(config));
  return {
    instances: performerIds.map((performerId, index) => ({
      id: createId(performerId, index),
      performerId,
      arm: arms[index] ?? index,
    })),
  };
}

/**
 * Materialize the renderer's historical round-robin assignment. Saving the
 * inferred instances turns an old implicit result into something the author
 * can inspect and edit without changing the picture they opened.
 */
export function createLegacyTunnelStage(
  performerIds: readonly string[],
  config: TunnelConfig
): TunnelStage {
  if (performerIds.length === 0) return { instances: [] };
  return {
    instances: Array.from({ length: imageCount(config) }, (_, arm) => ({
      id: `legacy-stage-${arm + 1}`,
      performerId: performerIds[arm % performerIds.length]!,
      arm,
    })),
  };
}

/** Keep identity and assignment while fitting the occupied positions to a frame. */
export function fitTunnelStageToFormation(
  stage: TunnelStage,
  config: TunnelConfig
): TunnelStage | null {
  const slots = imageCount(config);
  if (stage.instances.length > slots) return null;
  const arms = balancedTunnelStageArms(stage.instances.length, slots);
  return {
    instances: stage.instances.map((instance, index) => ({
      ...instance,
      arm: arms[index] ?? index,
    })),
  };
}

export function describeTunnelStageArm(
  config: TunnelConfig,
  arm: number
): string {
  const ops = tunnelFormationArms(config)[arm] ?? [];
  if (ops.length === 0) return t("tunnel_base_position");
  return ops
    .map((op) => {
      switch (op.kind) {
        case "rotate":
          return t("tunnel_rotate_degrees", { degrees: op.amount * 45 });
        case "mirror":
          return t("tunnel_mirror");
        case "flip":
          return t("tunnel_flip");
        case "invert":
          return t("tunnel_invert");
        case "rewind":
          return t("tunnel_echo");
      }
    })
    .join(" + ");
}
