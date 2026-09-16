import type { PointRef, Vec2 } from "../domain/models/grid-topology";
import type { GridMode } from "$lib/shared/render/core/types";
import type { Plane } from "@austencloud/scene-3d";


/** Pixel offsets to apply to each prop to separate them */
export interface BetaOffset {
  readonly left: Vec2;
  readonly right: Vec2;
}


export interface GridOptions {
  /** Grid rendering mode (default: "diamond") */
  mode?: GridMode;
  /** Explicit center position - overrides conjoin placement */
  center?: Vec2;
  /** Hand point radius in abstract units (default: 1.0) */
  radius?: number;
  /** Plane for 3D (default: "wall", L8+) */
  plane?: Plane;
}


export interface PlacementPair {
  readonly left: PointRef;
  readonly right: PointRef;
}


/** Render-ready prop data for direct SVG rendering */
export interface TopologyPropRenderData {
  /** SVG content string (colored, ready to render) */
  readonly svgContent: string;
  /** SVG viewBox dimensions */
  readonly viewBox: { width: number; height: number };
  /** SVG center point for transform origin */
  readonly center: { x: number; y: number };
  /** Position in 950x950 grid space (strict coordinates) */
  readonly position: { x: number; y: number };
  /** Rotation angle in degrees */
  readonly rotation: number;
}


export interface ViewBoxData {
  /** SVG viewBox string: "minX minY width height" */
  readonly viewBox: string;
  /** Width in SVG units */
  readonly width: number;
  /** Height in SVG units */
  readonly height: number;
  /** Origin offset: minX, minY */
  readonly origin: Vec2;
}
