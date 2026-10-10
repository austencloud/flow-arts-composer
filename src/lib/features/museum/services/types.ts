/**
 * Co-exported types from retired interface contracts.
 */

import type { RoomNode, RoomEdge, ValidationResult } from "../domain/layout-types";
import type {
  MuseumGrid,
  ExhibitDefinition,
  MuseumFurnitureRole,
} from "../domain/museum-grid-types";
import type { RoomDefinition } from "#lib/shared/3d/indoor/domain/room-types.js";


export interface DesignViolation {
  roomId: string;
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  exhibitRefId?: string;
}


export interface MuseumGridBuildResult {
  grid: MuseumGrid;
  validation: ValidationResult;
}


export interface MuseumModelDefinition {
  /** Asset path relative to the static root, e.g. "/assets/museum/models/furniture/bench.glb" */
  path: string;
  /** Uniform scale factor applied to the loaded model. */
  scale: number;
  /** Vertical offset so the model sits on the floor correctly. */
  yOffset: number;
}

export type MuseumModelRole = MuseumFurnitureRole;



export interface SerializationResult {
  rooms: RoomNode[];
  edges: RoomEdge[];
}

export interface ValidationError {
  path: string;
  message: string;
}


export type {
  PlaqueContent,
  PlaqueStyle,
  PlaqueAnnotation,
} from "../domain/museum-grid-types";

export type PlaqueSize = "standard" | "large" | "dev-whiteboard";


export enum RoomState {
  Unvisited = "unvisited",
  Active = "active",
  Cached = "cached",
}

export interface LifecycleUpdate {
  /** Rooms that need geometry built (first visit or returning from cache). */
  toActivate: string[];
  /** Rooms that should have their geometry torn down (player moved away). */
  toCache: string[];
  /**
   * Subset of toActivate that have cached descriptors.
   * These can skip the tile-bucketing phase - just replay the descriptor.
   */
  fromCache: string[];
  /**
   * Build priority for each room in toActivate.
   * 0 = current room (player is standing here), 1 = adjacent (prefetch).
   */
  priorities: Map<string, number>;
}


export interface StreamingUpdate {
  /** Room IDs that should be loaded (not already loaded) */
  toLoad: string[];
  /** Room IDs that should be disposed (loaded but no longer needed) */
  toDispose: string[];
  /** All room IDs that should currently be loaded */
  activeSet: Set<string>;
}


export interface AnalyzedMuseum {
	rooms: RoomDefinition[];
	connections: ConnectionDef[];
	exhibits: ExhibitPlacement[];
	performers: PerformerPlacement[];
	lights: LightPlacement[];
}

export interface ExhibitPlacement {
	id: string;
	position: [number, number, number];
	facing: number;
	sequenceId?: string;
}

export interface PerformerPlacement {
	id: string;
	position: [number, number, number];
	facing: number;
	sequenceId?: string;
	autoPlay: boolean;
}

export interface LightPlacement {
	type: "torch" | "spotlight";
	position: [number, number, number];
	intensity?: number;
}

export interface ConnectionDef {
	fromWingId: string;
	toWingId: string;
	position: [number, number, number];
}


export interface DoorPosition {
	x: number;
	y: number;
	wall: string;
	edgeId: string;
}

export interface StampResult {
	exhibits: ExhibitDefinition[];
	doorPositions: DoorPosition[];
}
