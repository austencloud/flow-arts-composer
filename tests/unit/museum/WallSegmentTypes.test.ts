import { describe, it, expect } from "vitest";
import {
	computeSegmentWidth,
	computeWallLength,
	computeRoomDimensions,
} from "#lib/features/museum/domain/wall-segment-types.js";
import type {
	WallSegment,
	WallDefinition,
} from "#lib/features/museum/domain/wall-segment-types.js";

describe("computeSegmentWidth", () => {
	it("returns door width from segment", () => {
		const seg: WallSegment = { type: "door", edgeId: "e1", width: 4 };
		expect(computeSegmentWidth(seg)).toBe(4);
	});

	it("returns 2 for standard exhibit", () => {
		const seg: WallSegment = {
			type: "exhibit",
			refId: "ex1",
			size: "standard",
			facing: "north",
		};
		expect(computeSegmentWidth(seg)).toBe(2);
	});

	it("returns 4 for large exhibit", () => {
		const seg: WallSegment = {
			type: "exhibit",
			refId: "ex2",
			size: "large",
			facing: "south",
		};
		expect(computeSegmentWidth(seg)).toBe(4);
	});

	it("returns 6 for dev-whiteboard exhibit", () => {
		const seg: WallSegment = {
			type: "exhibit",
			refId: "ex3",
			size: "dev-whiteboard",
			facing: "east",
		};
		expect(computeSegmentWidth(seg)).toBe(6);
	});

	it("returns 1 for torch", () => {
		const seg: WallSegment = { type: "torch" };
		expect(computeSegmentWidth(seg)).toBe(1);
	});

	it("returns 3 for screen", () => {
		const seg: WallSegment = {
			type: "screen",
			refId: "scr1",
			facing: "west",
		};
		expect(computeSegmentWidth(seg)).toBe(3);
	});

	it("returns rope width from segment", () => {
		const seg: WallSegment = { type: "rope", edgeId: "e2", width: 5 };
		expect(computeSegmentWidth(seg)).toBe(5);
	});

	it("returns 2 for sign", () => {
		const seg: WallSegment = { type: "sign", refId: "s1" };
		expect(computeSegmentWidth(seg)).toBe(2);
	});

	it("returns minTiles for gap", () => {
		const seg: WallSegment = { type: "gap", minTiles: 3 };
		expect(computeSegmentWidth(seg)).toBe(3);
	});
});

describe("computeWallLength", () => {
	it("sums segment widths plus margins", () => {
		// gap(3) + exhibit-standard(2) + gap(3) + door(4) + gap(3) = 15
		// margins: 2 * 2 = 4
		// total = 4 + 15 = 19
		const wall: WallDefinition = {
			minMargin: 2,
			segments: [
				{ type: "gap", minTiles: 3 },
				{ type: "exhibit", refId: "ex1", size: "standard", facing: "north" },
				{ type: "gap", minTiles: 3 },
				{ type: "door", edgeId: "e1", width: 4 },
				{ type: "gap", minTiles: 3 },
			],
		};
		expect(computeWallLength(wall)).toBe(19);
	});

	it("returns just margins for empty wall", () => {
		const wall: WallDefinition = { minMargin: 3, segments: [] };
		expect(computeWallLength(wall)).toBe(6);
	});
});

describe("computeRoomDimensions", () => {
	it("uses max of north/south for width, east/west for height", () => {
		// north: margin 2 + segments summing to 10 = 14 interior
		// south: margin 1 + segments summing to 8 = 10 interior
		// east: margin 2 + segments summing to 8 = 12 interior
		// west: margin 1 + segments summing to 6 = 8 interior
		const north: WallDefinition = {
			minMargin: 2,
			segments: [
				{ type: "gap", minTiles: 3 },
				{ type: "door", edgeId: "e1", width: 4 },
				{ type: "gap", minTiles: 3 },
			],
		};
		const south: WallDefinition = {
			minMargin: 1,
			segments: [
				{ type: "exhibit", refId: "ex1", size: "large", facing: "south" },
				{ type: "gap", minTiles: 4 },
			],
		};
		const east: WallDefinition = {
			minMargin: 2,
			segments: [
				{ type: "exhibit", refId: "ex2", size: "standard", facing: "east" },
				{ type: "torch" },
				{ type: "gap", minTiles: 5 },
			],
		};
		const west: WallDefinition = {
			minMargin: 1,
			segments: [
				{ type: "screen", refId: "scr1", facing: "west" },
				{ type: "gap", minTiles: 3 },
			],
		};

		// north: 2*2 + 3+4+3 = 14
		// south: 1*2 + 4+4 = 10
		// east: 2*2 + 2+1+5 = 12
		// west: 1*2 + 3+3 = 8
		// ROOM_SCALE=1.5: w = ceil(14*1.5)+2 = 23, h = ceil(12*1.5)+2 = 20
		const dims = computeRoomDimensions({
			walls: { north, south, east, west },
		});
		expect(dims.w).toBe(23);
		expect(dims.h).toBe(20);
	});

	it("respects minInteriorWidth/minInteriorHeight overrides", () => {
		const emptyWall: WallDefinition = { minMargin: 0, segments: [] };
		const dims = computeRoomDimensions({
			walls: {
				north: emptyWall,
				south: emptyWall,
				east: emptyWall,
				west: emptyWall,
			},
			minInteriorWidth: 20,
			minInteriorHeight: 16,
		});
		// ROOM_SCALE=1.5: w = ceil(20*1.5)+2 = 32, h = ceil(16*1.5)+2 = 26
		expect(dims.w).toBe(32);
		expect(dims.h).toBe(26);
	});

	it("uses wall length when it exceeds minInterior overrides", () => {
		const emptyWall: WallDefinition = { minMargin: 0, segments: [] };
		const bigWall: WallDefinition = {
			minMargin: 5,
			segments: [{ type: "door", edgeId: "e1", width: 20 }],
		};
		// bigWall length = 5*2 + 20 = 30
		const dims = computeRoomDimensions({
			walls: {
				north: bigWall,
				south: emptyWall,
				east: emptyWall,
				west: emptyWall,
			},
			minInteriorWidth: 10,
			minInteriorHeight: 10,
		});
		// ROOM_SCALE=1.5: w = ceil(30*1.5)+2 = 47, h = ceil(10*1.5)+2 = 17
		expect(dims.w).toBe(47);
		expect(dims.h).toBe(17);
	});
});
