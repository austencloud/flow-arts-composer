import { describe, it, expect } from "vitest";
import { validateRoom } from "#lib/shared/3d/indoor/services/room-validator.js";
import { buildRoom } from "#lib/shared/3d/indoor/services/room-geometry-builder.js";
import type { RoomDefinition, SolvedRoom } from "#lib/shared/3d/indoor/domain/room-types.js";
import { snapToGrid } from "#lib/shared/3d/indoor/domain/room-types.js";

function makeStandardRoom(overrides: Partial<RoomDefinition> = {}): RoomDefinition {
	return {
		id: "test-room",
		name: "Test Room",
		shape: "rectangular",
		width: 10,
		depth: 12,
		height: 4,
		walls: { thickness: 0.5, material: "stone" },
		entrance: { wall: "south", width: 3, height: 3, offset: "center" },
		objects: [],
		lighting: [],
		spawn: { wall: "south", distance: 2, facing: "north" },
		...overrides,
	};
}

// Both classes collapsed into standalone functions. Bind them to objects so
// the existing `builder.build(...)` / `validator.validate(...)` call sites are
// unchanged. `validateRoom(def, solved)` matches the old `validate(def, solved)`.
const builder = { build: buildRoom };
const validator = { validate: validateRoom };

describe("RoomValidator", () => {
	describe("valid room passes", () => {
		it("returns passed: true with no issues for a standard room", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);
			const result = validator.validate(def, solved);

			expect(result.passed).toBe(true);
			expect(result.issues).toHaveLength(0);
		});

		it("returns passed: true for a room with wall-anchored objects", () => {
			const def = makeStandardRoom({
				objects: [
					{
						id: "pedestal-1",
						type: "pedestal",
						placement: { anchor: "wall", wall: "north", position: "center", distance: 1 },
					},
					{
						id: "bench-1",
						type: "bench",
						placement: { anchor: "center" },
					},
				],
			});
			const solved = builder.build(def);
			const result = validator.validate(def, solved);

			expect(result.passed).toBe(true);
		});

		it("returns passed: true for a room with a corridor", () => {
			const def = makeStandardRoom({
				entrance: {
					wall: "south",
					width: 3,
					height: 3,
					offset: "center",
					corridor: { depth: 4, height: 3 },
				},
			});
			const solved = builder.build(def);
			const result = validator.validate(def, solved);

			expect(result.passed).toBe(true);
		});

		it("returns passed: true for different entrance walls", () => {
			for (const wall of ["north", "east", "west"] as const) {
				const def = makeStandardRoom({
					entrance: { wall, width: 2, height: 2.5, offset: "center" },
					spawn: { wall: "south", distance: 2, facing: "north" },
				});
				const solved = builder.build(def);
				const result = validator.validate(def, solved);

				expect(result.passed).toBe(true);
			}
		});
	});

	describe("floor coverage", () => {
		it("reports error when floor width does not match room width", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			// Manually break the floor width
			const brokenSolved: SolvedRoom = {
				...solved,
				floor: {
					...solved.floor,
					size: [solved.floor.size[0] + 5, solved.floor.size[1], solved.floor.size[2]],
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			const floorIssue = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Floor width"),
			);
			expect(floorIssue).toBeDefined();
		});

		it("reports error when floor depth does not match room depth", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const brokenSolved: SolvedRoom = {
				...solved,
				floor: {
					...solved.floor,
					size: [solved.floor.size[0], solved.floor.size[1], solved.floor.size[2] + 5],
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			const floorIssue = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Floor depth"),
			);
			expect(floorIssue).toBeDefined();
		});

		it("accepts floor within 1m tolerance", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			// 0.9m off is within 1m tolerance — should still pass
			const nearMissSolved: SolvedRoom = {
				...solved,
				floor: {
					...solved.floor,
					size: [solved.floor.size[0] + 0.9, solved.floor.size[1], solved.floor.size[2]],
				},
			};

			const result = validator.validate(def, nearMissSolved);
			const floorWidthError = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Floor width"),
			);
			expect(floorWidthError).toBeUndefined();
		});
	});

	describe("ceiling coverage", () => {
		it("reports error when ceiling Y does not match room height", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const brokenSolved: SolvedRoom = {
				...solved,
				ceiling: {
					...solved.ceiling,
					position: [
						solved.ceiling.position[0],
						solved.ceiling.position[1] + 3,
						solved.ceiling.position[2],
					],
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			const ceilingIssue = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Ceiling"),
			);
			expect(ceilingIssue).toBeDefined();
		});

		it("accepts ceiling within 0.5m tolerance", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const nearMissSolved: SolvedRoom = {
				...solved,
				ceiling: {
					...solved.ceiling,
					position: [
						solved.ceiling.position[0],
						solved.ceiling.position[1] + 0.4,
						solved.ceiling.position[2],
					],
				},
			};

			const result = validator.validate(def, nearMissSolved);
			const ceilingError = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Ceiling"),
			);
			expect(ceilingError).toBeUndefined();
		});
	});

	describe("spawn placement", () => {
		it("reports error when spawn is outside room bounds", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			// Move spawn outside room entirely
			const brokenSolved: SolvedRoom = {
				...solved,
				spawnPoint: {
					x: solved.bounds.maxX + 10,
					y: 0,
					z: solved.spawnPoint.z,
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			const spawnIssue = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Spawn point"),
			);
			expect(spawnIssue).toBeDefined();
		});

		it("reports error when spawn Z is beyond south bound", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const brokenSolved: SolvedRoom = {
				...solved,
				spawnPoint: {
					x: solved.spawnPoint.x,
					y: 0,
					z: solved.bounds.maxZ + 5,
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			expect(result.issues.some((i) => i.message.includes("Spawn point"))).toBe(true);
		});

		it("passes when spawn is at room center", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const centeredSolved: SolvedRoom = {
				...solved,
				spawnPoint: {
					x: (solved.bounds.minX + solved.bounds.maxX) / 2,
					y: 0,
					z: (solved.bounds.minZ + solved.bounds.maxZ) / 2,
				},
			};

			const result = validator.validate(def, centeredSolved);
			const spawnError = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Spawn point"),
			);
			expect(spawnError).toBeUndefined();
		});
	});

	describe("entrance walkability", () => {
		it("reports error when entrance opening has zero width", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const brokenSolved: SolvedRoom = {
				...solved,
				entrance: {
					...solved.entrance,
					opening: {
						...solved.entrance.opening,
						size: [0, solved.entrance.opening.size[1]],
					},
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			const entranceIssue = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Entrance opening"),
			);
			expect(entranceIssue).toBeDefined();
		});

		it("reports error when entrance opening has zero height", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const brokenSolved: SolvedRoom = {
				...solved,
				entrance: {
					...solved.entrance,
					opening: {
						...solved.entrance.opening,
						size: [solved.entrance.opening.size[0], 0],
					},
				},
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			expect(result.issues.some((i) => i.message.includes("Entrance opening"))).toBe(true);
		});

		it("passes when entrance opening has non-zero size", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);
			const result = validator.validate(def, solved);

			const entranceError = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("Entrance opening"),
			);
			expect(entranceError).toBeUndefined();
		});
	});

	describe("objects inside room", () => {
		it("issues a warning when an object is outside room bounds", () => {
			const def = makeStandardRoom({
				objects: [
					{
						id: "pedestal-1",
						type: "pedestal",
						placement: { anchor: "center" },
					},
				],
			});
			const solved = builder.build(def);

			// Manually move the object outside bounds
			const outsideObj = {
				...solved.objects[0],
				position: [solved.bounds.maxX + 5, 0, solved.bounds.maxZ / 2] as [number, number, number],
			};

			const brokenSolved: SolvedRoom = {
				...solved,
				objects: [outsideObj],
				objectsById: new Map([["pedestal-1", outsideObj]]),
			};

			const result = validator.validate(def, brokenSolved);

			// An out-of-bounds object is a warning, not a hard error
			const objectWarning = result.issues.find(
				(i) => i.severity === "warning" && i.message.includes("pedestal-1"),
			);
			expect(objectWarning).toBeDefined();
		});

		it("outside-bounds object does not cause failure (warning severity)", () => {
			const def = makeStandardRoom({
				objects: [
					{
						id: "bench-1",
						type: "bench",
						placement: { anchor: "center" },
					},
				],
			});
			const solved = builder.build(def);

			const outsideObj = {
				...solved.objects[0],
				position: [solved.bounds.minX - 3, 0, solved.bounds.minZ - 3] as [number, number, number],
			};

			const brokenSolved: SolvedRoom = {
				...solved,
				objects: [outsideObj],
				objectsById: new Map([["bench-1", outsideObj]]),
			};

			const result = validator.validate(def, brokenSolved);

			// Should still pass — only errors block
			expect(result.passed).toBe(true);
			expect(result.issues.some((i) => i.severity === "warning")).toBe(true);
		});

		it("passes with no issues when all objects are inside room", () => {
			const def = makeStandardRoom({
				objects: [
					{
						id: "pedestal-1",
						type: "pedestal",
						placement: { anchor: "wall", wall: "north", position: "center", distance: 1 },
					},
				],
			});
			const solved = builder.build(def);
			const result = validator.validate(def, solved);

			expect(result.passed).toBe(true);
			expect(result.issues.filter((i) => i.message.includes("pedestal-1"))).toHaveLength(0);
		});
	});

	describe("collider-visual match", () => {
		it("reports error when a wall segment has no matching collider", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			// Remove one collider that matches a wall
			const wallToOrphan = solved.walls[0];
			const collidersWithoutFirst = solved.colliders.filter(
				(c) =>
					!(
						Math.abs(c.position[0] - wallToOrphan.position[0]) < 0.1 &&
						Math.abs(c.position[1] - wallToOrphan.position[1]) < 0.1 &&
						Math.abs(c.position[2] - wallToOrphan.position[2]) < 0.1
					),
			);

			const brokenSolved: SolvedRoom = {
				...solved,
				colliders: collidersWithoutFirst,
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
			const colliderIssue = result.issues.find(
				(i) => i.severity === "error" && i.message.includes("no matching collider"),
			);
			expect(colliderIssue).toBeDefined();
		});

		it("includes collider location in the error message", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const wallToOrphan = solved.walls[0];
			const collidersWithoutFirst = solved.colliders.filter(
				(c) =>
					!(
						Math.abs(c.position[0] - wallToOrphan.position[0]) < 0.1 &&
						Math.abs(c.position[1] - wallToOrphan.position[1]) < 0.1 &&
						Math.abs(c.position[2] - wallToOrphan.position[2]) < 0.1
					),
			);

			const brokenSolved: SolvedRoom = {
				...solved,
				colliders: collidersWithoutFirst,
			};

			const result = validator.validate(def, brokenSolved);
			const colliderIssue = result.issues.find((i) => i.message.includes("no matching collider"));

			expect(colliderIssue?.location).toBeDefined();
			expect(colliderIssue?.location).toEqual(wallToOrphan.position);
		});

		it("passes when every wall segment has a collider", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);
			const result = validator.validate(def, solved);

			const colliderErrors = result.issues.filter(
				(i) => i.severity === "error" && i.message.includes("no matching collider"),
			);
			expect(colliderErrors).toHaveLength(0);
		});
	});

	describe("issue structure", () => {
		it("every issue has a severity and a message", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			// Inject multiple problems to verify issue structure
			const brokenSolved: SolvedRoom = {
				...solved,
				spawnPoint: { x: solved.bounds.maxX + 10, y: 0, z: solved.bounds.maxZ + 10 },
				floor: {
					...solved.floor,
					size: [solved.floor.size[0] + 5, solved.floor.size[1], solved.floor.size[2] + 5],
				},
			};

			const result = validator.validate(def, brokenSolved);

			for (const issue of result.issues) {
				expect(issue.severity).toMatch(/^(error|warning)$/);
				expect(typeof issue.message).toBe("string");
				expect(issue.message.length).toBeGreaterThan(0);
			}
		});

		it("passed is false when any error exists", () => {
			const def = makeStandardRoom();
			const solved = builder.build(def);

			const brokenSolved: SolvedRoom = {
				...solved,
				spawnPoint: { x: solved.bounds.maxX + 10, y: 0, z: solved.spawnPoint.z },
			};

			const result = validator.validate(def, brokenSolved);

			expect(result.passed).toBe(false);
		});

		it("passed is true when only warnings exist", () => {
			const def = makeStandardRoom({
				objects: [
					{
						id: "bench-1",
						type: "bench",
						placement: { anchor: "center" },
					},
				],
			});
			const solved = builder.build(def);

			// Move object outside bounds (warning) while keeping everything else valid
			const outsideObj = {
				...solved.objects[0],
				position: [solved.bounds.maxX + 3, 0, solved.bounds.maxZ / 2] as [number, number, number],
			};

			const warnOnlySolved: SolvedRoom = {
				...solved,
				objects: [outsideObj],
				objectsById: new Map([["bench-1", outsideObj]]),
			};

			const result = validator.validate(def, warnOnlySolved);

			const hasErrors = result.issues.some((i) => i.severity === "error");
			expect(hasErrors).toBe(false);
			expect(result.passed).toBe(true);
			expect(result.issues.some((i) => i.severity === "warning")).toBe(true);
		});
	});
});
