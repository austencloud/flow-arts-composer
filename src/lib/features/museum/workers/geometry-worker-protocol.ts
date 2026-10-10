import type { SerializedTileBuckets } from "#lib/features/museum/domain/room-descriptor.js";
import type { WingTheme } from "#lib/features/museum/domain/museum-grid-types.js";

// ─── Request types (main thread → worker) ────────────────────────────────────

export interface BuildRoomRequest {
  type: "build-room";
  roomId: string;
  buckets: SerializedTileBuckets;
  wing: {
    bounds: { x: number; y: number; width: number; height: number };
    theme: WingTheme;
  };
  // 0 = highest priority (current room), 1 = adjacent, 2 = prefetch
  priority: number;
}

export interface RebuildFromCacheRequest {
  type: "rebuild-from-cache";
  roomId: string;
  buckets: SerializedTileBuckets;
  wing: {
    bounds: { x: number; y: number; width: number; height: number };
    theme: WingTheme;
  };
  priority: number;
}

export interface CancelRequest {
  type: "cancel";
  roomId: string;
}

export type GeometryWorkerRequest =
  | BuildRoomRequest
  | RebuildFromCacheRequest
  | CancelRequest;

// ─── Response types (worker → main thread) ───────────────────────────────────

// A batch of instanced geometry sharing the same material.
// positions is a flat array of [x0, z0, x1, z1, ...] pairs - Float32Array so
// it can be transferred zero-copy via postMessage transferables.
export interface BatchTransfer {
  color: string;
  positions: Float32Array;
  floorMaterial?: string;
  wingTheme?: string;
}

export interface RoomBuiltResponse {
  type: "room-built";
  roomId: string;
  floorBatches: BatchTransfer[];
  wallBatches: BatchTransfer[];
  // Flat [x0, z0, x1, z1, ...] pairs for pedestal and sign spawning
  pedestalPositions: Float32Array;
  signPositions: Float32Array;
  totalFloorInstances: number;
  totalWallInstances: number;
  // The ArrayBuffers backing every Float32Array above - pass these as the
  // second argument to postMessage so they are transferred, not copied.
  transferables: ArrayBuffer[];
}

export interface ProgressResponse {
  type: "progress";
  roomId: string;
  phase: string;
}

export type GeometryWorkerResponse = RoomBuiltResponse | ProgressResponse;
