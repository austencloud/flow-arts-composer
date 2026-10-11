/**
 * MuseumPhysicsProvider
 *
 * Grid-based collision detection for the museum's 3D mode.
 * Instead of Rapier physics, this checks the museum's tile grid
 * to determine if movement is allowed. Solid tiles (walls, ropes,
 * exhibit furniture, signs) block movement; floor, corridor, door,
 * and content tiles are walkable.
 *
 * Supports jumping: UCC handles jump impulse and gravity, we accept
 * the Y component of desiredMovement and report grounded state
 * based on whether the player is at standing height.
 */

import type { PhysicsProvider, Vector3 } from "#lib/shared/3d/camera/types.js";
import type { MuseumGrid, MuseumTerrainProgram } from "../domain/museum-grid-types";
import { getFurnitureObjectByRole } from "../domain/placeable-object-registry";

export const SOLID_TYPES = new Set([
	"wall",
	"rope",
	"scaffolding",
	"exhibit-panel",
	"pedestal",
	"performer-station",
	"sign",
]);

// Collision radius in world units - prevents clipping through wall corners.
// TILE_SIZE is 0.5, so 0.15 keeps the player ~30% of a tile away from walls.
const COLLISION_RADIUS = 0.15;

// UCC first-person eye height = position.y + 0.75 (from SETTINGS.firstPerson.height).
// For a 1.6m eye level on a ground-plane museum, we keep position.y at 0.85
// so that 0.85 + 0.75 = 1.6m. This matches the Rapier capsule center convention.
export const STANDING_Y = 0.85;

interface FurnitureCollider {
	x: number;
	z: number;
	rotationY: number;
	halfWidth: number;
	halfDepth: number;
}

interface PerformerCollider {
	x: number;
	z: number;
	radius: number;
}

export class MuseumPhysicsProvider implements PhysicsProvider {
	private position: Vector3;
	private velocity: Vector3 = { x: 0, y: 0, z: 0 };
	private furnitureColliders: FurnitureCollider[];
	private performerColliders: PerformerCollider[];
	private terrain: MuseumTerrainProgram | null;

	/** When true, movePlayer ignores XZ - animation drives XZ via applyRootMotion instead. */
	rootMotionEnabled = false;

	constructor(
		private grid: MuseumGrid,
		private tileSize: number,
		spawnPosition: Vector3
	) {
		this.terrain = grid.terrain ?? null;
		const spawnFloor = this.floorYAt(spawnPosition.x, spawnPosition.z);
		this.position = { x: spawnPosition.x, y: spawnFloor + STANDING_Y, z: spawnPosition.z };
		this.furnitureColliders = grid.furniture.flatMap((placement) => {
			const footprint = getFurnitureObjectByRole(placement.role)?.collisionHalfExtents;
			if (!footprint) return [];
			return [{
				x: placement.tileX * tileSize,
				z: placement.tileY * tileSize,
				rotationY: placement.rotationY,
				halfWidth: footprint[0],
				halfDepth: footprint[1],
			}];
		});
		this.performerColliders = grid.performers.flatMap((performer) => {
			if (!performer.collisionRadiusTiles) return [];
			return [{
				x: performer.tileX * tileSize,
				z: performer.tileY * tileSize,
				radius: performer.collisionRadiusTiles * tileSize,
			}];
		});
	}

	/**
	 * Local floor height at a world position. Rooms with no terrain program
	 * (every museum surface but the Drowned Gallery) sit on the 0 datum.
	 */
	private floorYAt(worldX: number, worldZ: number, fromY?: number): number {
		return this.terrain ? this.terrain.elevationAt(worldX, worldZ, fromY) : 0;
	}

	/** The player's foot height — what `elevationAt` needs to pick a surface. */
	private get feetY(): number {
		return this.position.y - STANDING_Y;
	}

	private collidesWithAuthoredObject(worldX: number, worldZ: number): boolean {
		for (const collider of this.furnitureColliders) {
			const dx = worldX - collider.x;
			const dz = worldZ - collider.z;
			const cos = Math.cos(collider.rotationY);
			const sin = Math.sin(collider.rotationY);
			const localX = cos * dx - sin * dz;
			const localZ = sin * dx + cos * dz;
			if (
				Math.abs(localX) <= collider.halfWidth + COLLISION_RADIUS &&
				Math.abs(localZ) <= collider.halfDepth + COLLISION_RADIUS
			) {
				return true;
			}
		}

		for (const collider of this.performerColliders) {
			const dx = worldX - collider.x;
			const dz = worldZ - collider.z;
			const radius = collider.radius + COLLISION_RADIUS;
			if (dx * dx + dz * dz <= radius * radius) return true;
		}

		return false;
	}

	/**
	 * Check if a world-space position is walkable (not a solid object, not void).
	 * Tests a small collision disc around the position to prevent corner clipping.
	 */
	private isWalkableAt(worldX: number, worldZ: number): boolean {
		if (this.collidesWithAuthoredObject(worldX, worldZ)) return false;
		if (this.terrain?.blockedAt(worldX, worldZ)) return false;

		const offsets = [
			{ x: COLLISION_RADIUS, z: 0 },
			{ x: -COLLISION_RADIUS, z: 0 },
			{ x: 0, z: COLLISION_RADIUS },
			{ x: 0, z: -COLLISION_RADIUS },
		];

		for (const offset of offsets) {
			const tileX = Math.round((worldX + offset.x) / this.tileSize);
			const tileY = Math.round((worldZ + offset.z) / this.tileSize);
			const key = `${tileX},${tileY}`;
			const tile = this.grid.tiles.get(key);

			if (!tile || SOLID_TYPES.has(tile.type)) {
				return false;
			}
		}

		return true;
	}

	movePlayer(desiredMovement: Vector3, deltaTime: number): void {
		const dt = deltaTime > 0 ? deltaTime : 1 / 60;

		if (this.rootMotionEnabled) {
			// Root motion mode: ignore XZ from code - animation drives XZ
			// via applyRootMotion(). Zero XZ velocity here; applyRootMotion
			// will set accurate XZ velocity when it runs.
			this.velocity = { x: 0, y: desiredMovement.y / dt, z: 0 };
		} else {
			// Code-driven mode: apply XZ from UCC/top-down input
			const newX = this.position.x + desiredMovement.x;
			const newZ = this.position.z + desiredMovement.z;

			// XZ collision: try full, then wall-slide per axis
			if (this.isWalkableAt(newX, newZ)) {
				this.position.x = newX;
				this.position.z = newZ;
				this.velocity = { x: desiredMovement.x / dt, y: desiredMovement.y / dt, z: desiredMovement.z / dt };
			} else if (this.isWalkableAt(newX, this.position.z)) {
				this.position.x = newX;
				this.velocity = { x: desiredMovement.x / dt, y: desiredMovement.y / dt, z: 0 };
			} else if (this.isWalkableAt(this.position.x, newZ)) {
				this.position.z = newZ;
				this.velocity = { x: 0, y: desiredMovement.y / dt, z: desiredMovement.z / dt };
			} else {
				this.velocity = { x: 0, y: desiredMovement.y / dt, z: 0 };
			}
		}

		// Y movement: accept UCC's jump/gravity calculations, clamp at local floor.
		// The surface is resolved from where the feet were BEFORE this frame's fall,
		// so descending past a ledge lands on the ledge rather than skipping to the
		// floor below it, and walking under one is not snapped up onto it.
		const feetBefore = this.feetY;
		this.position.y += desiredMovement.y;
		const minY = this.floorYAt(this.position.x, this.position.z, feetBefore) + STANDING_Y;
		if (this.position.y < minY) {
			this.position.y = minY;
		}
	}

	/**
	 * Apply animation-driven XZ movement (root motion). Same collision
	 * logic as movePlayer, but only handles XZ - Y stays physics-driven.
	 * The delta is already in world space (caller rotates by facing angle).
	 */
	applyRootMotion(worldDelta: { x: number; z: number }): void {
		const prevX = this.position.x;
		const prevZ = this.position.z;
		const newX = prevX + worldDelta.x;
		const newZ = prevZ + worldDelta.z;

		// Wall-slide collision (same as movePlayer)
		if (this.isWalkableAt(newX, newZ)) {
			this.position.x = newX;
			this.position.z = newZ;
		} else if (this.isWalkableAt(newX, this.position.z)) {
			this.position.x = newX;
		} else if (this.isWalkableAt(this.position.x, newZ)) {
			this.position.z = newZ;
		}

		// Compute velocity from actual displacement (for speed reporting)
		const dt = 1 / 60; // approximate frame time
		this.velocity.x = (this.position.x - prevX) / dt;
		this.velocity.z = (this.position.z - prevZ) / dt;
	}

	getPlayerPosition(): Vector3 {
		return { ...this.position };
	}

	/**
	 * Upward lift (m/s) the terrain applies at the player's current position, or
	 * 0 in still air. UCC's physics path consults this before gravity: inside a
	 * lift column the vertical velocity eases toward this speed instead of
	 * falling. Rooms with no terrain program, and terrain programs written
	 * before the Air chimney, report still air.
	 */
	updraftSpeedAtPlayer(): number {
		return (
			this.terrain?.updraftAt?.(this.position.x, this.position.z, this.position.y) ?? 0
		);
	}

	isGrounded(): boolean {
		// A lift is ground that is moving. The Sundial's eye is literally a
		// rising plinth under the visitor's feet, and Air's column is carrying
		// them just as deliberately — in neither case are they falling. Without
		// this the height test fails every frame of the ride and the avatar
		// plays its falling animation the whole way up, which is what it did.
		if (this.updraftSpeedAtPlayer() > 0) return true;
		// Otherwise: grounded when at (or very near) standing height above the
		// local floor.
		const minY = this.floorYAt(this.position.x, this.position.z, this.feetY) + STANDING_Y;
		return this.position.y <= minY + 0.01;
	}

	getVelocity(): Vector3 {
		return { ...this.velocity };
	}

	teleport(position: Vector3): void {
		const floor = this.floorYAt(position.x, position.z);
		this.position = { x: position.x, y: floor + STANDING_Y, z: position.z };
	}
}

export function createMuseumPhysicsProvider(
	grid: MuseumGrid,
	tileSize: number,
	spawnPosition: Vector3
): PhysicsProvider {
	return new MuseumPhysicsProvider(grid, tileSize, spawnPosition);
}
