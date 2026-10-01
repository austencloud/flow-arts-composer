/**
 * Effect Types for 3D Animation
 *
 * Shared type definitions for all visual effects (trails, particles, etc.)
 */

import type { Vector3 } from "three";

// Trail Point & History

/**
 * A single point in the position history trail
 */
export interface TrailPoint {
  /** World position at this point */
  position: Vector3;
  /** Timestamp when this position was recorded (ms) */
  timestamp: number;
  /** Velocity magnitude at this point (units per second) */
  velocity: number;
}

/**
 * Position history for a single prop
 */
export interface PropPositionHistory {
  /** Recent trail points, newest first */
  points: TrailPoint[];
  /** Current velocity magnitude */
  currentVelocity: number;
}

// Trail Geometry Enums (used by 2D + 3D)

/**
 * Which prop end(s) to track for trails
 */
export enum TrackingMode {
  LEFT_END = "left_end", // Track only left end (base)
  RIGHT_END = "right_end", // Track only right end (tip)
  BOTH_ENDS = "both_ends", // Track both ends
}

/**
 * Trail rendering style
 */
export enum TrailStyle {
  RIBBON = "ribbon", // Physics-based ribbon (default)
  TUBE = "tube", // Simple tube geometry (legacy)
}

// Prop Identifier

/**
 * Prop identifier for effects
 */
export type PropId = "left" | "right";

// Tip Position Data (used by TipPositionBridge3D)

/**
 * World-space position, velocity, and jerk for a single prop tip.
 * Uses plain {x,y,z} objects instead of Three.js Vector3 so consumers
 * (including tests) don't need a Three.js dependency.
 */
export interface TipPositionData3D {
  /**
   * Logical end this tip owns: 0 = LEFT_END, 1 = RIGHT_END. Read this instead
   * of the array index — a single-ended prop (club, sword, fan…) publishes ONE
   * tip and it sits on slot 1, so position in the array no longer implies the
   * slot.
   */
  tipIndex: 0 | 1;
  /**
   * The 2D tip index its per-tip effect key names — `PropTipAnchor3D`
   * `effectKeyIndex`. Resolve effects with this, never with `tipIndex`: a
   * club's one tip is slot 1 but key 0.
   */
  effectKeyIndex: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  jerk: { x: number; y: number; z: number };
  speed: number;
}

/**
 * Per-tip positions for a single prop: two for the staff family, one for every
 * single-ended prop.
 */
export interface PropTipPositions3D {
  tips: TipPositionData3D[];
  propIndex: number;
}

// Quality Tier System

/**
 * Device capability tiers that determine particle budgets, dynamic light
 * limits, and feature toggles for all four effects (trails, LED, charcoal, fire).
 */
export enum QualityTier {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

/**
 * Per-tier limits and feature flags consumed by every effect implementation.
 */
export interface QualityTierConfig {
  tier: QualityTier;
  maxParticles: number;
  maxDynamicLights: number;
  enableShadows: boolean;
  enableBloom: boolean;
  bloomResolutionScale: number;
  bloomLevels: number;
  enableGroundInteraction: boolean;
}

export const TIER_CONFIGS: Record<QualityTier, QualityTierConfig> = {
  [QualityTier.HIGH]: {
    tier: QualityTier.HIGH,
    maxParticles: 50000,
    maxDynamicLights: 4,
    enableShadows: true,
    enableBloom: true,
    bloomResolutionScale: 1,
    bloomLevels: 8,
    enableGroundInteraction: true,
  },
  [QualityTier.MEDIUM]: {
    tier: QualityTier.MEDIUM,
    maxParticles: 10000,
    maxDynamicLights: 2,
    enableShadows: false,
    enableBloom: true,
    bloomResolutionScale: 0.5,
    bloomLevels: 5,
    enableGroundInteraction: false,
  },
  [QualityTier.LOW]: {
    tier: QualityTier.LOW,
    maxParticles: 2000,
    maxDynamicLights: 0,
    enableShadows: false,
    enableBloom: false,
    bloomResolutionScale: 0.5,
    bloomLevels: 0,
    enableGroundInteraction: false,
  },
};
