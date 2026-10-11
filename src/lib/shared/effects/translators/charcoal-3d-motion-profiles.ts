import type { CharcoalEmissionStyle } from "#lib/shared/effects/domain/effects-config.js";

export interface Charcoal3DMotionProfile {
  idleEmissionScale: number;
  motionEmissionScale: number;
  packetMin: number;
  packetRange: number;
  ambientFragmentStride: number;
  burstSparkScale: number;
  burstFragmentScale: number;
  burstThresholdScale: number;
  coneScale: number;
  velocityScale: number;
  sparkLifetimeScale: number;
  fragmentLifetimeScale: number;
  sparkSizeScale: number;
  fragmentSizeScale: number;
  gravityScale: number;
}

const CHARCOAL_3D_MOTION_PROFILES: Readonly<
  Record<CharcoalEmissionStyle, Readonly<Charcoal3DMotionProfile>>
> = {
  "steel-wool": {
    idleEmissionScale: 0.05,
    motionEmissionScale: 1.55,
    packetMin: 4,
    packetRange: 6,
    ambientFragmentStride: 5,
    burstSparkScale: 0.6,
    burstFragmentScale: 0.35,
    burstThresholdScale: 1.15,
    coneScale: 0.45,
    velocityScale: 1.18,
    sparkLifetimeScale: 1.25,
    fragmentLifetimeScale: 0.72,
    sparkSizeScale: 0.72,
    fragmentSizeScale: 0.72,
    gravityScale: 0.82,
  },
  "forge-burst": {
    idleEmissionScale: 0.12,
    motionEmissionScale: 0.42,
    packetMin: 5,
    packetRange: 7,
    ambientFragmentStride: 2,
    burstSparkScale: 1.35,
    burstFragmentScale: 1.85,
    burstThresholdScale: 0.72,
    coneScale: 0.7,
    velocityScale: 0.88,
    sparkLifetimeScale: 0.72,
    fragmentLifetimeScale: 1.35,
    sparkSizeScale: 0.92,
    fragmentSizeScale: 1.6,
    gravityScale: 1.18,
  },
  "cinder-fan": {
    idleEmissionScale: 0.08,
    motionEmissionScale: 1,
    packetMin: 10,
    packetRange: 12,
    ambientFragmentStride: 3,
    burstSparkScale: 0.85,
    burstFragmentScale: 0.65,
    burstThresholdScale: 0.95,
    coneScale: 1.8,
    velocityScale: 1.25,
    sparkLifetimeScale: 1.1,
    fragmentLifetimeScale: 0.95,
    sparkSizeScale: 0.72,
    fragmentSizeScale: 0.9,
    gravityScale: 0.62,
  },
  "banked-ember": {
    idleEmissionScale: 0.85,
    motionEmissionScale: 0.16,
    packetMin: 2,
    packetRange: 3,
    ambientFragmentStride: 1,
    burstSparkScale: 0.25,
    burstFragmentScale: 0.45,
    burstThresholdScale: 1.45,
    coneScale: 0.28,
    velocityScale: 0.38,
    sparkLifetimeScale: 1.45,
    fragmentLifetimeScale: 1.8,
    sparkSizeScale: 1.05,
    fragmentSizeScale: 1.85,
    gravityScale: 1.35,
  },
};

export function resolveCharcoal3DMotionProfile(
  style: CharcoalEmissionStyle
): Readonly<Charcoal3DMotionProfile> {
  return CHARCOAL_3D_MOTION_PROFILES[style];
}
