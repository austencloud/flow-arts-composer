/**
 * Converts semantic RoomDefinitions into grid-snapped geometry with colliders.
 *
 * Coordinate system:
 *   X = east-west (0 = west edge, width = east edge)
 *   Y = up (0 = floor, height = ceiling)
 *   Z = north-south (0 = north edge, depth = south edge)
 */

import type {
	RoomDefinition,
	SolvedRoom,
	SolvedWallSegment,
	SolvedSurface,
	SolvedEntrance,
	SolvedObject,
	ColliderDefinition,
	WallId,
	ObjectPlacement,
	EntranceDefinition,
	WallMaterialId,
} from "../domain/room-types";
import { GRID_CELL, snapToGrid } from "../domain/room-types";
import { DEFAULT_PLAYER_CONFIG } from "#lib/shared/3d/physics/types.js";

type Vec3 = [number, number, number];

function snap3(v: Vec3): Vec3 {
	return [snapToGrid(v[0]), snapToGrid(v[1]), snapToGrid(v[2])];
}

function makeWall(position: Vec3, size: Vec3, materialId: WallMaterialId): SolvedWallSegment {
	return { position, size, rotationY: 0, materialId };
}

function makeSurface(position: Vec3, size: Vec3, materialId: WallMaterialId): SolvedSurface {
	return { position, size, materialId };
}

function wallToCollider(wall: SolvedWallSegment): ColliderDefinition {
	return { shape: "box", position: [...wall.position], size: [...wall.size] };
}

function surfaceToCollider(surface: SolvedSurface): ColliderDefinition {
	return { shape: "box", position: [...surface.position], size: [...surface.size] };
}

function buildSolidWalls(
	W: number,
	D: number,
	H: number,
	T: number,
	mat: WallMaterialId,
	entranceWall: WallId,
): SolvedWallSegment[] {
	const walls: SolvedWallSegment[] = [];

	if (entranceWall !== "north") {
		walls.push(makeWall(snap3([W / 2, H / 2, T / 2]), snap3([W, H, T]), mat));
	}
	if (entranceWall !== "south") {
		walls.push(makeWall(snap3([W / 2, H / 2, D - T / 2]), snap3([W, H, T]), mat));
	}
	if (entranceWall !== "east") {
		walls.push(makeWall(snap3([W - T / 2, H / 2, D / 2]), snap3([T, H, D - 2 * T]), mat));
	}
	if (entranceWall !== "west") {
		walls.push(makeWall(snap3([T / 2, H / 2, D / 2]), snap3([T, H, D - 2 * T]), mat));
	}

	return walls;
}

function computeOpeningPosition(
	ent: EntranceDefinition,
	entranceStart: number,
	eW: number,
	eH: number,
	W: number,
	D: number,
	H: number,
	T: number,
): SolvedEntrance["opening"] {
	let position: Vec3;
	let facing: number;

	switch (ent.wall) {
		case "south":
			position = snap3([entranceStart + eW / 2, eH / 2, D - T / 2]);
			facing = 0;
			break;
		case "north":
			position = snap3([entranceStart + eW / 2, eH / 2, T / 2]);
			facing = Math.PI;
			break;
		case "east":
			position = snap3([W - T / 2, eH / 2, T + entranceStart + eW / 2]);
			facing = -Math.PI / 2;
			break;
		case "west":
			position = snap3([T / 2, eH / 2, T + entranceStart + eW / 2]);
			facing = Math.PI / 2;
			break;
	}

	return {
		position,
		size: [snapToGrid(eW), snapToGrid(eH)],
		facing,
	};
}

function buildCorridor(
	ent: EntranceDefinition,
	entranceStart: number,
	eW: number,
	W: number,
	D: number,
	H: number,
	T: number,
	mat: WallMaterialId,
): NonNullable<SolvedEntrance["corridor"]> {
	const cor = ent.corridor!;
	const cDepth = snapToGrid(cor.depth);
	const cHeight = snapToGrid(cor.height);
	const cWidth = cor.width ? snapToGrid(cor.width) : eW;
	const walls: SolvedWallSegment[] = [];
	let floor: SolvedSurface;
	let ceiling: SolvedSurface;

	if (ent.wall === "south") {
		const zStart = snapToGrid(D);
		const leftX = snapToGrid(entranceStart);
		const rightX = snapToGrid(entranceStart + cWidth);

		walls.push(makeWall(snap3([leftX, cHeight / 2, zStart + cDepth / 2]), snap3([T, cHeight, cDepth]), mat));
		walls.push(makeWall(snap3([rightX, cHeight / 2, zStart + cDepth / 2]), snap3([T, cHeight, cDepth]), mat));

		floor = makeSurface(snap3([(leftX + rightX) / 2, 0, zStart + cDepth / 2]), snap3([cWidth, T, cDepth]), mat);
		ceiling = makeSurface(snap3([(leftX + rightX) / 2, cHeight, zStart + cDepth / 2]), snap3([cWidth, T, cDepth]), mat);
	} else if (ent.wall === "north") {
		const zStart = 0;
		const leftX = snapToGrid(entranceStart);
		const rightX = snapToGrid(entranceStart + cWidth);

		walls.push(makeWall(snap3([leftX, cHeight / 2, zStart - cDepth / 2]), snap3([T, cHeight, cDepth]), mat));
		walls.push(makeWall(snap3([rightX, cHeight / 2, zStart - cDepth / 2]), snap3([T, cHeight, cDepth]), mat));

		floor = makeSurface(snap3([(leftX + rightX) / 2, 0, zStart - cDepth / 2]), snap3([cWidth, T, cDepth]), mat);
		ceiling = makeSurface(snap3([(leftX + rightX) / 2, cHeight, zStart - cDepth / 2]), snap3([cWidth, T, cDepth]), mat);
	} else if (ent.wall === "east") {
		const xStart = snapToGrid(W);
		const topZ = snapToGrid(T + entranceStart);
		const botZ = snapToGrid(T + entranceStart + cWidth);

		walls.push(makeWall(snap3([xStart + cDepth / 2, cHeight / 2, topZ]), snap3([cDepth, cHeight, T]), mat));
		walls.push(makeWall(snap3([xStart + cDepth / 2, cHeight / 2, botZ]), snap3([cDepth, cHeight, T]), mat));

		floor = makeSurface(snap3([xStart + cDepth / 2, 0, (topZ + botZ) / 2]), snap3([cDepth, T, cWidth]), mat);
		ceiling = makeSurface(snap3([xStart + cDepth / 2, cHeight, (topZ + botZ) / 2]), snap3([cDepth, T, cWidth]), mat);
	} else {
		// west
		const xStart = 0;
		const topZ = snapToGrid(T + entranceStart);
		const botZ = snapToGrid(T + entranceStart + cWidth);

		walls.push(makeWall(snap3([xStart - cDepth / 2, cHeight / 2, topZ]), snap3([cDepth, cHeight, T]), mat));
		walls.push(makeWall(snap3([xStart - cDepth / 2, cHeight / 2, botZ]), snap3([cDepth, cHeight, T]), mat));

		floor = makeSurface(snap3([xStart - cDepth / 2, 0, (topZ + botZ) / 2]), snap3([cDepth, T, cWidth]), mat);
		ceiling = makeSurface(snap3([xStart - cDepth / 2, cHeight, (topZ + botZ) / 2]), snap3([cDepth, T, cWidth]), mat);
	}

	return { walls, floor, ceiling };
}

function buildEntrance(
	ent: EntranceDefinition,
	W: number,
	D: number,
	H: number,
	T: number,
	mat: WallMaterialId,
): SolvedEntrance {
	const eW = snapToGrid(ent.width);
	const eH = snapToGrid(ent.height);

	const wallLength = ent.wall === "north" || ent.wall === "south" ? W : D - 2 * T;
	const entranceStart =
		ent.offset === "center"
			? snapToGrid((wallLength - eW) / 2)
			: snapToGrid(ent.offset as number);

	const segments: SolvedWallSegment[] = [];
	const leftLen = snapToGrid(entranceStart);
	const rightLen = snapToGrid(wallLength - entranceStart - eW);

	if (ent.wall === "south") {
		const z = snapToGrid(D - T / 2);
		if (leftLen > 0) {
			segments.push(makeWall(snap3([leftLen / 2, H / 2, z]), snap3([leftLen, H, T]), mat));
		}
		if (rightLen > 0) {
			const rightX = snapToGrid(entranceStart + eW + rightLen / 2);
			segments.push(makeWall(snap3([rightX, H / 2, z]), snap3([rightLen, H, T]), mat));
		}
		if (eH < H) {
			const topH = snapToGrid(H - eH);
			segments.push(makeWall(snap3([entranceStart + eW / 2, eH + topH / 2, z]), snap3([eW, topH, T]), mat));
		}
	} else if (ent.wall === "north") {
		const z = snapToGrid(T / 2);
		if (leftLen > 0) {
			segments.push(makeWall(snap3([leftLen / 2, H / 2, z]), snap3([leftLen, H, T]), mat));
		}
		if (rightLen > 0) {
			const rightX = snapToGrid(entranceStart + eW + rightLen / 2);
			segments.push(makeWall(snap3([rightX, H / 2, z]), snap3([rightLen, H, T]), mat));
		}
		if (eH < H) {
			const topH = snapToGrid(H - eH);
			segments.push(makeWall(snap3([entranceStart + eW / 2, eH + topH / 2, z]), snap3([eW, topH, T]), mat));
		}
	} else if (ent.wall === "east") {
		const x = snapToGrid(W - T / 2);
		const zBase = T;
		if (leftLen > 0) {
			segments.push(makeWall(snap3([x, H / 2, zBase + leftLen / 2]), snap3([T, H, leftLen]), mat));
		}
		if (rightLen > 0) {
			const rightZ = snapToGrid(zBase + entranceStart + eW + rightLen / 2);
			segments.push(makeWall(snap3([x, H / 2, rightZ]), snap3([T, H, rightLen]), mat));
		}
		if (eH < H) {
			const topH = snapToGrid(H - eH);
			segments.push(makeWall(snap3([x, eH + topH / 2, zBase + entranceStart + eW / 2]), snap3([T, topH, eW]), mat));
		}
	} else {
		// west
		const x = snapToGrid(T / 2);
		const zBase = T;
		if (leftLen > 0) {
			segments.push(makeWall(snap3([x, H / 2, zBase + leftLen / 2]), snap3([T, H, leftLen]), mat));
		}
		if (rightLen > 0) {
			const rightZ = snapToGrid(zBase + entranceStart + eW + rightLen / 2);
			segments.push(makeWall(snap3([x, H / 2, rightZ]), snap3([T, H, rightLen]), mat));
		}
		if (eH < H) {
			const topH = snapToGrid(H - eH);
			segments.push(makeWall(snap3([x, eH + topH / 2, zBase + entranceStart + eW / 2]), snap3([T, topH, eW]), mat));
		}
	}

	const opening = computeOpeningPosition(ent, entranceStart, eW, eH, W, D, H, T);

	let corridor: SolvedEntrance["corridor"];
	if (ent.corridor) {
		corridor = buildCorridor(ent, entranceStart, eW, W, D, H, T, mat);
	}

	return { segments, opening, corridor };
}

function resolveObject(
	id: string,
	type: string,
	placement: ObjectPlacement,
	W: number,
	D: number,
	H: number,
	T: number,
): SolvedObject {
	let position: Vec3;
	let rotationY = 0;

	if (placement.anchor === "wall") {
		const dist = snapToGrid(placement.distance);
		const height = snapToGrid(placement.height ?? 0);

		const wallLen = placement.wall === "north" || placement.wall === "south" ? W : D - 2 * T;
		const along =
			placement.position === "center"
				? snapToGrid(wallLen / 2)
				: snapToGrid(placement.position * wallLen);

		switch (placement.wall) {
			case "north":
				position = snap3([along, height, T + dist]);
				rotationY = Math.PI;
				break;
			case "south":
				position = snap3([along, height, D - T - dist]);
				rotationY = 0;
				break;
			case "east":
				position = snap3([W - T - dist, height, T + along]);
				rotationY = -Math.PI / 2;
				break;
			case "west":
				position = snap3([T + dist, height, T + along]);
				rotationY = Math.PI / 2;
				break;
		}
	} else if (placement.anchor === "center") {
		const ox = snapToGrid(placement.offsetX ?? 0);
		const oz = snapToGrid(placement.offsetZ ?? 0);
		const height = snapToGrid(placement.height ?? 0);
		position = snap3([W / 2 + ox, height, D / 2 + oz]);
	} else {
		// corner
		const dist = snapToGrid(placement.distance);
		const height = snapToGrid(placement.height ?? 0);
		const [wall1, wall2] = placement.walls;

		const cx = wall2 === "east" || wall1 === "east" ? W - T : T;
		const cz = wall2 === "south" || wall1 === "south" ? D - T : T;

		const diagFactor = dist / Math.SQRT2;
		const dxSign = cx > W / 2 ? -1 : 1;
		const dzSign = cz > D / 2 ? -1 : 1;

		position = snap3([cx + dxSign * diagFactor, height, cz + dzSign * diagFactor]);
	}

	return { id, type: type as SolvedObject["type"], position, rotationY };
}

function resolveSpawn(
	spawn: RoomDefinition["spawn"],
	W: number,
	D: number,
	T: number,
): { x: number; y: number; z: number } {
	const dist = snapToGrid(spawn.distance);
	let x = snapToGrid(W / 2);
	let z: number;

	switch (spawn.wall) {
		case "south":
			z = snapToGrid(D - T - dist);
			break;
		case "north":
			z = snapToGrid(T + dist);
			break;
		case "east":
			x = snapToGrid(W - T - dist);
			z = snapToGrid(D / 2);
			break;
		case "west":
			x = snapToGrid(T + dist);
			z = snapToGrid(D / 2);
			break;
	}

	const floorTopY = 0.25;
	const spawnY = snapToGrid(
		floorTopY + DEFAULT_PLAYER_CONFIG.halfHeight + DEFAULT_PLAYER_CONFIG.radius,
	);
	return { x, y: spawnY, z: z! };
}

function resolveFacing(facing: WallId): number {
	switch (facing) {
		case "north":
			return Math.PI;
		case "south":
			return 0;
		case "east":
			return -Math.PI / 2;
		case "west":
			return Math.PI / 2;
	}
}

export function buildRoom(def: RoomDefinition): SolvedRoom {
	const W = snapToGrid(def.width);
	const D = snapToGrid(def.depth);
	const H = snapToGrid(def.height);
	const T = snapToGrid(def.walls.thickness);
	const mat = def.walls.material;

	const colliders: ColliderDefinition[] = [];

	const solidWalls = buildSolidWalls(W, D, H, T, mat, def.entrance.wall);
	for (const wall of solidWalls) {
		colliders.push(wallToCollider(wall));
	}

	const entrance = buildEntrance(def.entrance, W, D, H, T, mat);
	for (const seg of entrance.segments) {
		colliders.push(wallToCollider(seg));
	}

	if (entrance.corridor) {
		for (const cWall of entrance.corridor.walls) {
			colliders.push(wallToCollider(cWall));
		}
		colliders.push(surfaceToCollider(entrance.corridor.floor));
		colliders.push(surfaceToCollider(entrance.corridor.ceiling));
	}

	const floor = makeSurface(snap3([W / 2, 0, D / 2]), snap3([W, 0.5, D]), mat);
	const ceiling = makeSurface(snap3([W / 2, H, D / 2]), snap3([W, 0.5, D]), mat);
	colliders.push(surfaceToCollider(floor));
	colliders.push(surfaceToCollider(ceiling));

	const objects = def.objects.map((o) =>
		resolveObject(o.id, o.type, o.placement, W, D, H, T),
	);
	const objectsById = new Map<string, SolvedObject>();
	for (const obj of objects) {
		objectsById.set(obj.id, obj);
	}

	const spawnPoint = resolveSpawn(def.spawn, W, D, T);
	const spawnFacing = resolveFacing(def.spawn.facing);

	return {
		walls: solidWalls,
		floor,
		ceiling,
		entrance,
		objects,
		objectsById,
		colliders,
		spawnPoint,
		spawnFacing,
		worldOffset: { x: 0, y: 0, z: 0 },
		bounds: { minX: 0, maxX: W, minZ: 0, maxZ: D },
		gridCellSize: GRID_CELL,
	};
}
