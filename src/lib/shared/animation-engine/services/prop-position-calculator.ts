/**
 * Single source of truth for calculating prop endpoint positions for trail rendering.
 */

import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  resolveTrailPointConfig,
  type TrailPointSource,
} from "../domain/types/trail-point-types";
import { getTipPoints } from "../domain/types/prop-tip-points";

/** Configuration for prop endpoint calculations */
export interface PropEndpointConfig {
  /** Canvas size in pixels */
  canvasSize: number;
  /** Prop dimensions in viewbox coordinates */
  propDimensions: { width: number; height: number };
  /** Grid halfway point offset (default: 150) */
  gridHalfwayOffset?: number;
  /** Inward factor for radius (default: 1.0) */
  inwardFactor?: number;
  /**
   * Chirality flip, as drawn. The renderer mirrors a flipped sprite with
   * `scale(-1, 1)` after rotating it, so every prop-local source sits at
   * (-dx, dy). Trail tips and lab offsets follow the painted artwork.
   */
  flipped?: boolean;
}

/** Result of a single endpoint calculation */
export interface PropEndpointResult {
  x: number;
  y: number;
}

/** A trail endpoint plus the canonical tip it came from, when applicable. */
export interface TrailSourceEndpointResult extends PropEndpointResult {
  tipIndex: number | null;
}

/** Result of calculating both endpoints */
export interface PropEndpointPair {
  /** Left end (tipIndex 0) */
  left: PropEndpointResult;
  /** Right end (tipIndex 1, tip) */
  right: PropEndpointResult;
}

const VIEWBOX_SIZE = 950;
const DEFAULT_GRID_HALFWAY_OFFSET = 150;
const DEFAULT_INWARD_FACTOR = 1.0;

function resolveTrailSource(
  source: TrailPointSource,
  propType: string | null | undefined,
  config: PropEndpointConfig
): { offsetX: number; offsetY: number } | null {
  if (source.type === "none") return null;

  const gridScaleFactor = config.canvasSize / VIEWBOX_SIZE;
  const mirror = config.flipped ? -1 : 1;

  if (source.type === "tip") {
    const tipConfig = getTipPoints(propType);
    const tipPoint = tipConfig.points[source.index];
    if (!tipPoint) return null;
    return {
      offsetX: tipPoint.dx * mirror * gridScaleFactor,
      offsetY: tipPoint.dy * gridScaleFactor,
    };
  }

  if (source.type === "custom") {
    return {
      offsetX: source.dx * mirror * gridScaleFactor,
      offsetY: source.dy * gridScaleFactor,
    };
  }

  return null;
}

function resolveTrailEndpoint(
  prop: PropState,
  source: TrailPointSource,
  propType: string | null | undefined,
  config: PropEndpointConfig,
  center: PropEndpointResult
): TrailSourceEndpointResult | null {
  const resolved = resolveTrailSource(source, propType, config);
  if (!resolved) return null;

  // Trail sources live in the prop's local coordinate system, exactly like
  // the sprite. Rotate both canonical tips and custom lab offsets before
  // translating them to the prop center.
  const cosA = Math.cos(prop.staffRotationAngle);
  const sinA = Math.sin(prop.staffRotationAngle);
  return {
    x: center.x + resolved.offsetX * cosA - resolved.offsetY * sinA,
    y: center.y + resolved.offsetX * sinA + resolved.offsetY * cosA,
    tipIndex: source.type === "tip" ? source.index : null,
  };
}

export function calculatePropCenter(
  prop: PropState,
  config: PropEndpointConfig
): PropEndpointResult {
  const { canvasSize } = config;
  const gridHalfwayOffset =
    config.gridHalfwayOffset ?? DEFAULT_GRID_HALFWAY_OFFSET;
  const inwardFactor = config.inwardFactor ?? DEFAULT_INWARD_FACTOR;

  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const gridScaleFactor = canvasSize / VIEWBOX_SIZE;
  const scaledHalfwayRadius = gridHalfwayOffset * gridScaleFactor;

  if (prop.x !== undefined && prop.y !== undefined) {
    return {
      x: centerX + prop.x * scaledHalfwayRadius * inwardFactor,
      y: centerY + prop.y * scaledHalfwayRadius * inwardFactor,
    };
  }

  return {
    x:
      centerX +
      Math.cos(prop.centerPathAngle) * scaledHalfwayRadius * inwardFactor,
    y:
      centerY +
      Math.sin(prop.centerPathAngle) * scaledHalfwayRadius * inwardFactor,
  };
}

/**
 * Convert one canonical/custom trail source from prop-local coordinates into
 * canvas coordinates. `none` and invalid tip indices produce no endpoint.
 */
export function calculateTrailSourceEndpoint(
  prop: PropState,
  config: PropEndpointConfig,
  source: TrailPointSource,
  propType?: string | null
): TrailSourceEndpointResult | null {
  const center = calculatePropCenter(prop, config);
  return resolveTrailEndpoint(prop, source, propType, config, center);
}

export function calculatePropEndpoint(
  prop: PropState,
  config: PropEndpointConfig,
  endType: 0 | 1,
  propType?: string | null
): PropEndpointResult {
  const center = calculatePropCenter(prop, config);

  if (propType?.toLowerCase() === "hand") {
    return center;
  }

  if (propType) {
    const trailConfig = resolveTrailPointConfig(propType);
    const source = endType === 0 ? trailConfig.left : trailConfig.right;
    return (
      resolveTrailEndpoint(prop, source, propType, config, center) ?? center
    );
  }

  const gridScaleFactor = config.canvasSize / VIEWBOX_SIZE;
  const staffHalfWidth = (config.propDimensions.width / 2) * gridScaleFactor;
  const staffEndOffset = endType === 1 ? staffHalfWidth : -staffHalfWidth;

  return {
    x: center.x + Math.cos(prop.staffRotationAngle) * staffEndOffset,
    y: center.y + Math.sin(prop.staffRotationAngle) * staffEndOffset,
  };
}

export function calculatePropEndpoints(
  prop: PropState,
  config: PropEndpointConfig,
  propType?: string | null
): PropEndpointPair {
  const center = calculatePropCenter(prop, config);

  if (propType?.toLowerCase() === "hand") {
    return { left: { ...center }, right: { ...center } };
  }

  if (propType) {
    const trailConfig = resolveTrailPointConfig(propType);
    return {
      left:
        resolveTrailEndpoint(
          prop,
          trailConfig.left,
          propType,
          config,
          center
        ) ?? center,
      right:
        resolveTrailEndpoint(
          prop,
          trailConfig.right,
          propType,
          config,
          center
        ) ?? center,
    };
  }

  const gridScaleFactor = config.canvasSize / VIEWBOX_SIZE;
  const staffHalfWidth = (config.propDimensions.width / 2) * gridScaleFactor;

  const offsetX = Math.cos(prop.staffRotationAngle) * staffHalfWidth;
  const offsetY = Math.sin(prop.staffRotationAngle) * staffHalfWidth;

  return {
    left: { x: center.x - offsetX, y: center.y - offsetY },
    right: { x: center.x + offsetX, y: center.y + offsetY },
  };
}
