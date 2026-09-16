export type MandalaVariant = "left" | "right" | "full";

export interface MandalaPlacement {
	row: number;
	col: number;
	variant: MandalaVariant;
}

export interface MandalaLayoutOverride {
	cols: number;
	rows: number;
	startPos: { col: number; row: number };
	qrPos: { col: number; row: number };
	stepPositions: { col: number; row: number }[];
}

export interface GetMandalaPlacementsArgs {
	stepCount: number;
	cols: number;
	rows: number;
	includeStartPlacement: boolean;
	showQRCode: boolean;
	leftVisible: boolean;
	rightVisible: boolean;
	mandalaEnabled: boolean;
	/** Where the info cells live. "column" → mandalas stack vertically in col 1.
	 *  "row" → mandalas lay out horizontally across the top row. */
	startPlacementLayout?: "row" | "column";
}

export interface GetMandalaPlacementsResult {
	placements: MandalaPlacement[];
	layoutOverride: MandalaLayoutOverride | null;
}

const EMPTY: GetMandalaPlacementsResult = { placements: [], layoutOverride: null };

export function getMandalaPlacements(args: GetMandalaPlacementsArgs): GetMandalaPlacementsResult {
	const {
		stepCount,
		cols,
		rows,
		includeStartPlacement,
		showQRCode,
		leftVisible,
		rightVisible,
		mandalaEnabled,
		startPlacementLayout = "row",
	} = args;

	if (!mandalaEnabled) return EMPTY;
	if (!includeStartPlacement) return EMPTY;
	if (!leftVisible && !rightVisible) return EMPTY;
	if (stepCount < 4) return EMPTY;

	if (startPlacementLayout === "row") {
		// Info cells live in row 1 between start (col 1) and QR (col `cols`).
		if (cols < 2) return EMPTY;
		const leftCol = 2;
		const rightCol = showQRCode ? cols - 1 : cols;
		const emptyCount = rightCol - leftCol + 1;
		if (emptyCount < 1) return EMPTY;

		// Anchored: left → leftmost slot, right → rightmost slot. Never migrate when one is toggled off.
		return { placements: buildRowPlacements(emptyCount, leftCol, rightCol, leftVisible, rightVisible), layoutOverride: null };
	}

	// Column layout: col 1 runs start (row 1) → empties → QR (row `rows`).
	if (rows < 2) return EMPTY;
	const topRow = 2;
	const bottomRow = showQRCode ? rows - 1 : rows;
	const emptyCount = bottomRow - topRow + 1;
	if (emptyCount < 1) return EMPTY;

	void cols;

	// Anchored: left → topmost slot, right → bottommost slot. Never migrate when one is toggled off.
	return { placements: buildColumnPlacements(emptyCount, topRow, bottomRow, leftVisible, rightVisible), layoutOverride: null };
}

function buildRowPlacements(
	emptyCount: number,
	leftCol: number,
	rightCol: number,
	leftVisible: boolean,
	rightVisible: boolean,
): MandalaPlacement[] {
	if (leftVisible && rightVisible) {
		if (emptyCount === 1) return [{ row: 1, col: leftCol, variant: "full" }];
		if (emptyCount === 2) return [
			{ row: 1, col: leftCol, variant: "left" },
			{ row: 1, col: rightCol, variant: "right" },
		];
		return [
			{ row: 1, col: leftCol, variant: "left" },
			{ row: 1, col: leftCol + 1, variant: "full" },
			{ row: 1, col: leftCol + 2, variant: "right" },
		];
	}
	if (leftVisible) return [{ row: 1, col: leftCol, variant: "left" }];
	return [{ row: 1, col: leftCol, variant: "right" }];
}

function buildColumnPlacements(
	emptyCount: number,
	topRow: number,
	bottomRow: number,
	leftVisible: boolean,
	rightVisible: boolean,
): MandalaPlacement[] {
	if (leftVisible && rightVisible) {
		if (emptyCount === 1) return [{ row: topRow, col: 1, variant: "full" }];
		if (emptyCount === 2) return [
			{ row: topRow, col: 1, variant: "left" },
			{ row: bottomRow, col: 1, variant: "right" },
		];
		return [
			{ row: topRow, col: 1, variant: "left" },
			{ row: topRow + 1, col: 1, variant: "full" },
			{ row: topRow + 2, col: 1, variant: "right" },
		];
	}
	if (leftVisible) return [{ row: topRow, col: 1, variant: "left" }];
	return [{ row: topRow, col: 1, variant: "right" }];
}
