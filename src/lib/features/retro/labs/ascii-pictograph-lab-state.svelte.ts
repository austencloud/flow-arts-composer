/**
 * Reactive state for the ASCII Pictograph Lab.
 *
 * Two modes:
 * - Single: prev/next through all pictograph variations from CSV
 * - Sequence: type a word, generate via existing spell services, render side by side
 *
 * Domain: Retro DOS Terminal Lab
 */

import {
	GridLocation,
	GridMode,
	MotionType,
	Orientation,
	HandSide,
	RotationDirection,
} from "#lib/features/retro/shared/domain/pictograph-types.js";
import type {
	RetroPictographData,
	RetroHandData,
} from "#lib/features/retro/shared/domain/pictograph-types.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

import { getRandomSequenceGenerator } from "#lib/features/create/spell/get-random-sequence-generator.js";
import { getVariationExplorationOrchestrator } from "#lib/features/create/spell/get-variation-exploration-orchestrator.js";

/** Which rendering layers are active */
export interface RenderLayers {
	grid: boolean;
	hands: boolean;
	staves: boolean;
	arrows: boolean;
}

export type LabMode = "single" | "sequence" | "arrows" | "compare";
export type ViewMode = "raw" | "crt";

// CSV LOADING (Single mode)

interface PictographEntry {
	letter: string;
	gridMode: GridMode;
	leftStartLocation: GridLocation;
	leftEndLocation: GridLocation;
	leftMotionType: MotionType;
	rightStartLocation: GridLocation;
	rightEndLocation: GridLocation;
	rightMotionType: MotionType;
}

function entryToPictograph(entry: PictographEntry): RetroPictographData {
	const leftHand: RetroHandData = {
		color: HandSide.LEFT,
		location: entry.leftStartLocation,
		endLocation: entry.leftEndLocation,
		motionType: entry.leftMotionType,
		orientation: Orientation.IN,
		turns: 0,
		rotationDirection: RotationDirection.NO_ROTATION,
	};
	const rightHand: RetroHandData = {
		color: HandSide.RIGHT,
		location: entry.rightStartLocation,
		endLocation: entry.rightEndLocation,
		motionType: entry.rightMotionType,
		orientation: Orientation.IN,
		turns: 0,
		rotationDirection: RotationDirection.NO_ROTATION,
	};
	return { letter: entry.letter, leftHand, rightHand, gridMode: entry.gridMode };
}

function parseCsv(text: string, gridMode: GridMode): PictographEntry[] {
	const lines = text.trim().split("\n");
	if (lines.length < 2) return [];

	const headers = lines[0]!.split(",").map((h) => h.trim());
	const col = (name: string) => headers.indexOf(name);
	const entries: PictographEntry[] = [];

	for (let i = 1; i < lines.length; i++) {
		const v = lines[i]!.split(",").map((s) => s.trim());
		entries.push({
			letter: v[col("letter")] ?? "",
			gridMode,
			leftStartLocation: (v[col("blueStartLocation")] as GridLocation) || GridLocation.NORTH,
			leftEndLocation: (v[col("blueEndLocation")] as GridLocation) || GridLocation.NORTH,
			leftMotionType: (v[col("blueMotionType")] as MotionType) || MotionType.STATIC,
			rightStartLocation: (v[col("redStartLocation")] as GridLocation) || GridLocation.SOUTH,
			rightEndLocation: (v[col("redEndLocation")] as GridLocation) || GridLocation.SOUTH,
			rightMotionType: (v[col("redMotionType")] as MotionType) || MotionType.STATIC,
		});
	}
	return entries;
}

// STEP CONVERSION (Sequence mode)

function stepToRetro(step: StepData, isBridge = false): RetroPictographData {
	const left = step.motions[HandSide.LEFT];
	const right = step.motions[HandSide.RIGHT];

	const leftHand: RetroHandData = {
		color: HandSide.LEFT,
		location: left?.startLocation ?? GridLocation.NORTH,
		endLocation: left?.endLocation ?? GridLocation.NORTH,
		motionType: left?.motionType ?? MotionType.STATIC,
		orientation: left?.endOrientation ?? Orientation.IN,
		turns: typeof left?.turns === "number" ? left.turns : 0,
		rotationDirection: left?.rotationDirection ?? RotationDirection.NO_ROTATION,
	};
	const rightHand: RetroHandData = {
		color: HandSide.RIGHT,
		location: right?.startLocation ?? GridLocation.SOUTH,
		endLocation: right?.endLocation ?? GridLocation.SOUTH,
		motionType: right?.motionType ?? MotionType.STATIC,
		orientation: right?.endOrientation ?? Orientation.IN,
		turns: typeof right?.turns === "number" ? right.turns : 0,
		rotationDirection: right?.rotationDirection ?? RotationDirection.NO_ROTATION,
	};

	return {
		letter: step.letter ?? "",
		leftHand,
		rightHand,
		gridMode: step.gridMode ?? GridMode.DIAMOND,
		isBridge,
	};
}


const STORAGE_KEY = "ascii-lab-state";

interface PersistedState {
	mode: LabMode;
	viewMode: ViewMode;
	gridModeFilter: GridMode;
	currentIndex: number;
	layers: RenderLayers;
	wordInput: string;
}

const DEFAULTS: PersistedState = {
	mode: "single",
	viewMode: "raw",
	gridModeFilter: GridMode.DIAMOND,
	currentIndex: 0,
	layers: { grid: true, hands: true, staves: false, arrows: false },
	wordInput: "",
};

function loadPersistedState(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw) as Partial<PersistedState>;
		return {
			mode: parsed.mode === "sequence" ? "sequence" : parsed.mode === "arrows" ? "arrows" : parsed.mode === "compare" ? "compare" : "single",
			viewMode: parsed.viewMode === "crt" ? "crt" : "raw",
			gridModeFilter: parsed.gridModeFilter === GridMode.BOX ? GridMode.BOX : GridMode.DIAMOND,
			currentIndex: typeof parsed.currentIndex === "number" ? parsed.currentIndex : 0,
			layers: {
				grid: parsed.layers?.grid ?? DEFAULTS.layers.grid,
				hands: parsed.layers?.hands ?? DEFAULTS.layers.hands,
				staves: parsed.layers?.staves ?? DEFAULTS.layers.staves,
				arrows: parsed.layers?.arrows ?? DEFAULTS.layers.arrows,
			},
			wordInput: typeof parsed.wordInput === "string" ? parsed.wordInput : "",
		};
	} catch {
		return { ...DEFAULTS };
	}
}

function savePersistedState(state: PersistedState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// localStorage full or unavailable - silently ignore
	}
}

// ARROW TEST CASES (Arrows mode)
//
// Hard-coded pictographs for iterating on PRO/ANTI/DASH arrow rendering.
// Uses the same positions as letters A (PRO CW) and B (ANTI CCW).

const ARROW_TEST_CASES: RetroPictographData[] = [
	{
		letter: "PRO CW",
		gridMode: GridMode.DIAMOND,
		leftHand: {
			color: HandSide.LEFT, location: GridLocation.WEST, endLocation: GridLocation.NORTH,
			motionType: MotionType.PRO, orientation: Orientation.IN, turns: 1,
			rotationDirection: RotationDirection.CLOCKWISE,
		},
		rightHand: {
			color: HandSide.RIGHT, location: GridLocation.EAST, endLocation: GridLocation.SOUTH,
			motionType: MotionType.PRO, orientation: Orientation.IN, turns: 1,
			rotationDirection: RotationDirection.CLOCKWISE,
		},
	},
	{
		letter: "ANTI CCW",
		gridMode: GridMode.DIAMOND,
		leftHand: {
			color: HandSide.LEFT, location: GridLocation.WEST, endLocation: GridLocation.NORTH,
			motionType: MotionType.ANTI, orientation: Orientation.IN, turns: 1,
			rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
		},
		rightHand: {
			color: HandSide.RIGHT, location: GridLocation.EAST, endLocation: GridLocation.SOUTH,
			motionType: MotionType.ANTI, orientation: Orientation.IN, turns: 1,
			rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
		},
	},
	{
		letter: "DASH",
		gridMode: GridMode.DIAMOND,
		leftHand: {
			color: HandSide.LEFT, location: GridLocation.WEST, endLocation: GridLocation.NORTH,
			motionType: MotionType.DASH, orientation: Orientation.IN, turns: 0,
			rotationDirection: RotationDirection.NO_ROTATION,
		},
		rightHand: {
			color: HandSide.RIGHT, location: GridLocation.EAST, endLocation: GridLocation.SOUTH,
			motionType: MotionType.DASH, orientation: Orientation.IN, turns: 0,
			rotationDirection: RotationDirection.NO_ROTATION,
		},
	},
	{
		letter: "PRO CCW",
		gridMode: GridMode.DIAMOND,
		leftHand: {
			color: HandSide.LEFT, location: GridLocation.NORTH, endLocation: GridLocation.EAST,
			motionType: MotionType.PRO, orientation: Orientation.IN, turns: 1,
			rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
		},
		rightHand: {
			color: HandSide.RIGHT, location: GridLocation.SOUTH, endLocation: GridLocation.WEST,
			motionType: MotionType.PRO, orientation: Orientation.IN, turns: 1,
			rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
		},
	},
];


/**
 * Public surface of the ASCII Pictograph Lab state object. Annotating the
 * factory return with this catches accidental shape drift when callers
 * destructure (a renamed/removed getter becomes a compile error, not a
 * silent `undefined`).
 */
export interface AsciiLabState {
	readonly mode: LabMode;
	readonly viewMode: ViewMode;
	readonly loading: boolean;
	readonly error: string | null;
	readonly label: string;
	readonly layers: RenderLayers;
	readonly gridModeFilter: GridMode;
	readonly pictographData: RetroPictographData | null;
	readonly sequenceSteps: RetroPictographData[];
	readonly sequenceWord: string;
	readonly sequenceExpanded: string;
	readonly generating: boolean;
	wordInput: string;
	readonly arrowTestCases: RetroPictographData[];
	loadData(): Promise<void>;
	next(): void;
	prev(): void;
	toggleLayer(layer: keyof RenderLayers): void;
	setMode(m: LabMode): void;
	setViewMode(m: ViewMode): void;
	setGridModeFilter(mode: GridMode): void;
	generateSequence(word: string): Promise<void>;
}

export function createAsciiLabState(): AsciiLabState {
	const restored = loadPersistedState();

	// Shared
	let mode = $state<LabMode>(restored.mode);
	let viewMode = $state<ViewMode>(restored.viewMode);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let layers = $state<RenderLayers>({ ...restored.layers });

	// Single mode
	let entries = $state<PictographEntry[]>([]);
	let gridModeFilter = $state<GridMode>(restored.gridModeFilter);
	let currentIndex = $state(restored.currentIndex);

	// Sequence mode
	let sequenceSteps = $state<RetroPictographData[]>([]);
	let sequenceWord = $state("");
	let sequenceExpanded = $state("");
	let generating = $state(false);

	// Word input (persisted so the text field survives navigation)
	let wordInput = $state(restored.wordInput);

	$effect(() => {
		savePersistedState({
			mode,
			viewMode,
			gridModeFilter,
			currentIndex,
			layers,
			wordInput,
		});
	});


	const filteredEntries = $derived(
		entries.filter((e) => e.gridMode === gridModeFilter),
	);

	const currentEntry = $derived(filteredEntries[currentIndex] ?? null);

	const pictographData = $derived<RetroPictographData | null>(
		currentEntry ? entryToPictograph(currentEntry) : null,
	);

	const label = $derived(
		currentEntry
			? `${currentEntry.letter}  ${currentIndex + 1} / ${filteredEntries.length}`
			: "No data loaded",
	);

	// ── Actions ──

	async function loadData(): Promise<void> {
		loading = true;
		error = null;
		try {
			const [diamondResp, boxResp] = await Promise.all([
				fetch("/data/pictographs/DiamondPictographDataframe.csv"),
				fetch("/data/pictographs/BoxPictographDataframe.csv"),
			]);
			if (!diamondResp.ok || !boxResp.ok) throw new Error("Failed to fetch CSV files");

			const [diamondText, boxText] = await Promise.all([
				diamondResp.text(),
				boxResp.text(),
			]);

			entries = [
				...parseCsv(diamondText, GridMode.DIAMOND),
				...parseCsv(boxText, GridMode.BOX),
			];

			// Clamp persisted index to valid range after data loads
			const filtered = entries.filter((e) => e.gridMode === gridModeFilter);
			currentIndex = filtered.length > 0
				? Math.min(restored.currentIndex, filtered.length - 1)
				: 0;
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to load pictograph data";
		} finally {
			loading = false;
		}
	}

	function next(): void {
		if (filteredEntries.length === 0) return;
		currentIndex = (currentIndex + 1) % filteredEntries.length;
	}

	function prev(): void {
		if (filteredEntries.length === 0) return;
		currentIndex = (currentIndex - 1 + filteredEntries.length) % filteredEntries.length;
	}

	function setGridModeFilter(mode: GridMode): void {
		gridModeFilter = mode;
		currentIndex = 0;
	}

	function toggleLayer(layer: keyof RenderLayers): void {
		layers = { ...layers, [layer]: !layers[layer] };
	}

	function setMode(m: LabMode): void {
		mode = m;
		error = null;
	}

	function setViewMode(m: ViewMode): void {
		viewMode = m;
	}

	async function generateSequence(word: string): Promise<void> {
		if (!word.trim()) return;

		generating = true;
		error = null;
		sequenceSteps = [];
		sequenceWord = word.trim().toUpperCase();

		try {
			const spellOrch = getVariationExplorationOrchestrator();
			const generator = getRandomSequenceGenerator();

			// Parse word with bridge letters
			const parseResult = await spellOrch.parseWord(sequenceWord, {
				preferences: {
					constraintPreset: "smooth",
					handPathMode: "mixed",
					motionTypeFilter: null,
					highContinuity: true,
					makeCircular: false,
					selectedLOOPType: null,
					targetStepCount: null,
					maxReversals: null,
				},
			});

			if (!parseResult.success || !parseResult.expandedLetters) {
				throw new Error(parseResult.error ?? "Failed to parse word");
			}

			sequenceExpanded = parseResult.expandedWord ?? sequenceWord;

			// Generate sequence
			const sequence = await generator.generateRandomSequence(
				parseResult.expandedLetters,
				{
					gridMode: GridMode.DIAMOND,
					letterSources: parseResult.letterSources,
					level: DifficultyLevel.INTERMEDIATE,
					turnIntensity: 1.0,
				},
			);

			if (!sequence) {
				throw new Error("No valid sequence found");
			}

			// Build bridge index from letterSources (stepIndex is 1-based)
			const bridgeSteps = new Set<number>();
			if (parseResult.letterSources) {
				for (const src of parseResult.letterSources) {
					if (!src.isOriginal) bridgeSteps.add(src.stepIndex);
				}
			}

			// Convert steps to retro format (skip step 0 which is the start position)
			sequenceSteps = sequence.steps
				.filter((step) => step.stepNumber > 0)
				.map((step) => stepToRetro(step, bridgeSteps.has(step.stepNumber)));
		} catch (e) {
			error = e instanceof Error ? e.message : "Sequence generation failed";
		} finally {
			generating = false;
		}
	}

	return {
		get mode() { return mode; },
		get viewMode() { return viewMode; },
		get loading() { return loading; },
		get error() { return error; },
		get label() { return label; },
		get layers() { return layers; },
		get gridModeFilter() { return gridModeFilter; },
		get pictographData() { return pictographData; },
		get sequenceSteps() { return sequenceSteps; },
		get sequenceWord() { return sequenceWord; },
		get sequenceExpanded() { return sequenceExpanded; },
		get generating() { return generating; },
		get wordInput() { return wordInput; },
		set wordInput(v: string) { wordInput = v; },
		get arrowTestCases() { return ARROW_TEST_CASES; },
		loadData,
		next,
		prev,
		toggleLayer,
		setMode,
		setViewMode,
		setGridModeFilter,
		generateSequence,
	};
}
