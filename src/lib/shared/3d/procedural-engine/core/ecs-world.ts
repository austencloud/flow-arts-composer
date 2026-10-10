/**
 * ECS World
 *
 * Miniplex-based Entity Component System for infinite worlds.
 * Components are plain TypeScript objects stored in typed arrays where performance matters.
 *
 * Architecture:
 * - Entities are just IDs with attached components
 * - Components are data-only (no methods)
 * - Systems operate on entities with specific component combinations
 * - No inheritance - compose entities from components
 */

import { World } from "miniplex";
import type { Object3D } from "three";
import type { RigidBody, Collider } from "@dimforge/rapier3d-compat";
import { CameraMode } from "#lib/shared/3d/camera/types.js";


/**
 * Transform component - position, rotation, scale in world space
 * Uses Float32Array for GPU-friendly data layout
 */
export interface TransformComponent {
  position: Float32Array; // [x, y, z]
  rotation: Float32Array; // [x, y, z, w] quaternion
  scale: Float32Array; // [x, y, z]
}

/**
 * Velocity component - linear and angular velocity
 */
export interface VelocityComponent {
  linear: Float32Array; // [x, y, z]
  angular: Float32Array; // [x, y, z]
}

/**
 * Mesh component - reference to Three.js Object3D
 * Kept separate from ECS data for rendering integration
 */
export interface MeshComponent {
  object3D: Object3D;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}

/**
 * Physics body component - Rapier rigid body and collider
 */
export interface PhysicsBodyComponent {
  rigidBody: RigidBody;
  collider: Collider;
  bodyType: "dynamic" | "static" | "kinematic";
}

/**
 * Chunk component - for terrain/world chunks
 */
export interface ChunkComponent {
  chunkX: number;
  chunkY: number;
  chunkZ: number;
  lod: number; // Level of detail (0 = highest)
  seed: number; // Deterministic seed for this chunk
  generated: boolean;
  lastAccessTime: number;
}

/**
 * Player component - marks the local player entity
 */
export interface PlayerComponent {
  isLocal: boolean;
  playerId: string;
  health: number;
  stamina: number;
}

/**
 * Camera component - attached to player for first-person view
 */
export interface CameraComponent {
  fov: number;
  near: number;
  far: number;
  yaw: number;
  pitch: number;
  // Camera mode switching (1st person <-> 3rd person)
  mode: CameraMode;
  targetDistance: number; // 5.0 for third-person orbit distance
  targetHeight: number; // 2.0 above player eye height
}

/**
 * Input component - player input state
 */
export interface InputComponent {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
}

/**
 * Grounded component - whether entity is on the ground
 */
export interface GroundedComponent {
  isGrounded: boolean;
  groundNormal: Float32Array; // [x, y, z]
  groundDistance: number;
}

/**
 * Procedural component - marks entities for procedural generation
 */
export interface ProceduralComponent {
  generatorId: string;
  seed: number;
  params: Record<string, number>;
}

/**
 * LOD component - level of detail management
 */
export interface LODComponent {
  currentLOD: number;
  maxLOD: number;
  lodDistances: number[]; // Distance thresholds for each LOD level
}

/**
 * Spatial component - octree node reference
 */
export interface SpatialComponent {
  octreeNodeId: number;
  bounds: Float32Array; // [minX, minY, minZ, maxX, maxY, maxZ]
}


/**
 * Full entity type with all possible components
 * Entities only have the components that are attached
 */
export interface Entity {
  // Core
  id?: string;
  transform?: TransformComponent;
  velocity?: VelocityComponent;

  // Rendering
  mesh?: MeshComponent;
  lod?: LODComponent;

  // Physics
  physicsBody?: PhysicsBodyComponent;
  grounded?: GroundedComponent;

  // World
  chunk?: ChunkComponent;
  procedural?: ProceduralComponent;
  spatial?: SpatialComponent;

  // Player
  player?: PlayerComponent;
  camera?: CameraComponent;
  input?: InputComponent;

  // Tags (presence = true)
  isActive?: true;
  isPersistent?: true;
  needsSync?: true;
}


/**
 * The ECS world - single source of truth for all entities
 */
export const world = new World<Entity>();

// ARCHETYPES (pre-defined queries for common entity types)

/**
 * All entities with transform
 */
export const withTransform = world.with("transform");

/**
 * All entities with physics bodies
 */
export const withPhysics = world.with("physicsBody", "transform");

/**
 * All renderable entities
 */
export const withMesh = world.with("mesh", "transform");

/**
 * All chunk entities
 */
export const withChunk = world.with("chunk");

/**
 * Player entities (local and remote)
 */
export const withPlayer = world.with("player", "transform");

/**
 * Local player only
 */
export const localPlayer = world.with("player", "input", "camera");

/**
 * Dynamic physics bodies (need simulation)
 */
export const dynamicBodies = world.with("physicsBody", "transform", "velocity");

/**
 * Entities needing LOD updates
 */
export const withLOD = world.with("lod", "transform", "mesh");


/**
 * Create a transform component with default values
 */
export function createTransform(
  x = 0,
  y = 0,
  z = 0,
  scale = 1
): TransformComponent {
  return {
    position: new Float32Array([x, y, z]),
    rotation: new Float32Array([0, 0, 0, 1]), // Identity quaternion
    scale: new Float32Array([scale, scale, scale]),
  };
}

/**
 * Create a velocity component with default values
 */
export function createVelocity(): VelocityComponent {
  return {
    linear: new Float32Array([0, 0, 0]),
    angular: new Float32Array([0, 0, 0]),
  };
}

/**
 * Create an input component with default values
 */
export function createInput(): InputComponent {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    sprint: false,
    crouch: false,
    interact: false,
  };
}

export function createPlayerEntity(
  playerId: string,
  isLocal: boolean,
  x = 0,
  y = 1.7,
  z = 0
): Entity {
  const entity: Entity = {
    id: playerId,
    transform: createTransform(x, y, z),
    velocity: createVelocity(),
    player: {
      isLocal,
      playerId,
      health: 100,
      stamina: 100,
    },
    grounded: {
      isGrounded: false,
      groundNormal: new Float32Array([0, 1, 0]),
      groundDistance: 0,
    },
    isActive: true,
  };

  if (isLocal) {
    entity.input = createInput();
    entity.camera = {
      fov: 75,
      near: 0.1,
      far: 1000,
      yaw: 0,
      pitch: 0,
      mode: CameraMode.FIRST_PERSON,
      targetDistance: 5.0,
      targetHeight: 2.0,
    };
  }

  return world.add(entity);
}

export function createChunkEntity(
  chunkX: number,
  chunkY: number,
  chunkZ: number,
  seed: number
): Entity {
  return world.add({
    chunk: {
      chunkX,
      chunkY,
      chunkZ,
      lod: 0,
      seed,
      generated: false,
      lastAccessTime: Date.now(),
    },
    isActive: true,
  });
}


/**
 * Clear all entities from the world
 */
export function clearWorld(): void {
  for (const entity of world.entities) {
    world.remove(entity);
  }
}

/**
 * Get entity count by archetype
 */
export function getEntityStats(): Record<string, number> {
  return {
    total: world.entities.length,
    withTransform: withTransform.entities.length,
    withPhysics: withPhysics.entities.length,
    withMesh: withMesh.entities.length,
    withChunk: withChunk.entities.length,
    withPlayer: withPlayer.entities.length,
  };
}
