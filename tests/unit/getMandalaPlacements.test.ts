import { describe, it, expect } from "vitest";
import {
	getMandalaPlacements,
	type GetMandalaPlacementsArgs,
} from "$lib/shared/sequence-viewer/services/get-mandala-placements";

function args(overrides: Partial<GetMandalaPlacementsArgs> = {}): GetMandalaPlacementsArgs {
	return {
		stepCount: 8,
		cols: 3,
		rows: 4,
		includeStartPlacement: true,
		showQRCode: true,
		leftVisible: true,
		rightVisible: true,
		mandalaEnabled: true,
		startPlacementLayout: "column",
		...overrides,
	};
}

describe("getMandalaPlacements — toggle/off cases", () => {
	it("returns empty when mandalaEnabled=false", () => {
		const res = getMandalaPlacements(args({ mandalaEnabled: false }));
		expect(res.placements).toEqual([]);
		expect(res.layoutOverride).toBeNull();
	});

	it("returns empty when includeStartPlacement=false", () => {
		const res = getMandalaPlacements(args({ includeStartPlacement: false }));
		expect(res.placements).toEqual([]);
	});

	it("returns empty when both hands hidden", () => {
		const res = getMandalaPlacements(args({ leftVisible: false, rightVisible: false }));
		expect(res.placements).toEqual([]);
	});

	it("returns empty for rows < 2", () => {
		const res = getMandalaPlacements(args({ stepCount: 2, cols: 3, rows: 1 }));
		expect(res.placements).toEqual([]);
	});
});

describe("getMandalaPlacements — 4-count", () => {
	// stepCount 4 uses the generic branches (no special horizontal override).
	// Column layout defaults to the [3,2] table (2 step columns + start col), which
	// with QR on leaves no empty col-1 cell → no mandala. Mandalas appear only where
	// the chosen grid actually leaves an empty cell.
	it("stepCount 4 (column + QR, 2-col grid) → no empties → no mandala, no override", () => {
		const res = getMandalaPlacements(args({ stepCount: 4, cols: 3, rows: 2 }));
		expect(res.placements).toEqual([]);
		expect(res.layoutOverride).toBeNull();
	});

	it("stepCount 4 (column) with QR off → one col-1 empty → full mandala", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 4, cols: 3, rows: 2, showQRCode: false }),
		);
		expect(res.layoutOverride).toBeNull();
		expect(res.placements).toEqual([{ row: 2, col: 1, variant: "full" }]);
	});

	it("stepCount 4 (row layout + QR) → blue col 2, red col 3 in top row, no override", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 4, cols: 4, rows: 2, startPlacementLayout: "row" }),
		);
		expect(res.placements).toEqual([
			{ row: 1, col: 2, variant: "left" },
			{ row: 1, col: 3, variant: "right" },
		]);
		expect(res.layoutOverride).toBeNull();
	});

	it("never emits a layoutOverride (horizontal 4-count override removed)", () => {
		const res = getMandalaPlacements(args({ stepCount: 4, cols: 3, rows: 2 }));
		expect(res.layoutOverride).toBeNull();
	});

	it("stepCount 3 stays below threshold → empty", () => {
		const res = getMandalaPlacements(args({ stepCount: 3, cols: 3, rows: 2 }));
		expect(res.placements).toEqual([]);
		expect(res.layoutOverride).toBeNull();
	});
});

describe("getMandalaPlacements — col-0 empties (both hands visible)", () => {
	it("puts the workspace mandala below the start tile instead of in a trailing step cell", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 7, cols: 5, rows: 2, showQRCode: false }),
		);
		expect(res.placements).toEqual([{ row: 2, col: 1, variant: "full" }]);
	});

	it("1 empty → full mandala centered", () => {
		const res = getMandalaPlacements(args({ stepCount: 9, cols: 4, rows: 3 }));
		expect(res.layoutOverride).toBeNull();
		expect(res.placements).toEqual([{ row: 2, col: 1, variant: "full" }]);
	});

	it("2 empties → blue on top, red on bottom", () => {
		const res = getMandalaPlacements(args({ stepCount: 8, cols: 3, rows: 4 }));
		expect(res.placements).toEqual([
			{ row: 2, col: 1, variant: "left" },
			{ row: 3, col: 1, variant: "right" },
		]);
	});

	it("3 empties → sandwich", () => {
		const res = getMandalaPlacements(args({ stepCount: 10, cols: 3, rows: 5 }));
		expect(res.placements).toEqual([
			{ row: 2, col: 1, variant: "left" },
			{ row: 3, col: 1, variant: "full" },
			{ row: 4, col: 1, variant: "right" },
		]);
	});

	it("4+ empties → still fills first 3 slots (blue, full, red)", () => {
		const res = getMandalaPlacements(args({ stepCount: 20, cols: 6, rows: 6 }));
		expect(res.placements).toEqual([
			{ row: 2, col: 1, variant: "left" },
			{ row: 3, col: 1, variant: "full" },
			{ row: 4, col: 1, variant: "right" },
		]);
	});

	it("caps a six-row workspace column at one combined mandala", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 22, cols: 5, rows: 6, showQRCode: false }),
		);
		expect(res.placements).toEqual([
			{ row: 2, col: 1, variant: "left" },
			{ row: 3, col: 1, variant: "full" },
			{ row: 4, col: 1, variant: "right" },
		]);
	});
});

describe("getMandalaPlacements — single-hand visibility", () => {
	it("2 empties + red hidden → only blue slot, centered", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 8, cols: 3, rows: 4, rightVisible: false }),
		);
		// 2 empties (rows 2,3), 1 variant → startRow = 2+floor((2-1)/2) = 2.
		expect(res.placements).toEqual([{ row: 2, col: 1, variant: "left" }]);
	});

	it("3 empties + blue hidden → only red slot, anchored to top", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 10, cols: 3, rows: 5, leftVisible: false }),
		);
		expect(res.placements).toEqual([{ row: 2, col: 1, variant: "right" }]);
	});
});

describe("getMandalaPlacements — QR off joins bottom cell to empty span", () => {
	it("8-count, QR off → 3 empties → sandwich", () => {
		const res = getMandalaPlacements(
			args({ stepCount: 8, cols: 3, rows: 4, showQRCode: false }),
		);
		expect(res.placements).toEqual([
			{ row: 2, col: 1, variant: "left" },
			{ row: 3, col: 1, variant: "full" },
			{ row: 4, col: 1, variant: "right" },
		]);
	});
});
