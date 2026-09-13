import type { HandPathData } from "$lib/shared/foundation/domain/models/hand-path-data";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { SoloPropStepData } from "$lib/shared/foundation/domain/models/solo-prop-step-data";
import type { StepPairingData } from "$lib/shared/foundation/domain/models/step-pairing-data";
import { createSequenceData, type SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { MotionType, RotationDirection, Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { rehydrateMotion } from "$lib/shared/foundation/services/step-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { FuseOptions } from "./types";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";

const DEFAULT_MAX_STEPS = 64;

/**
 * Human-facing name for a fused sequence once its word has been derived.
 * "IIECCKIIECCK" reads as two words glued together; the simplified repeat
 * ("IIECCK") is the name used across the app (export filenames, gallery word
 * population — see word-simplifier). Empty/underivable words fall back to an
 * honest label instead of the "__fused__" sentinel or "blue + red".
 */
export function fusedDisplayName(word: string): string {
	const simplified = simplifyRepeatedWord(word ?? "");
	return simplified && simplified !== "__fused__" ? simplified : "Fused sequence";
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
	return (a * b) / gcd(a, b);
}

function isHandPathData(input: HandPathData | SoloPropData): input is HandPathData {
	return "locations" in input && !("handPath" in input);
}

function extractHandPath(input: HandPathData | SoloPropData): HandPathData {
	if (isHandPathData(input)) {
		return input;
	}
	return input.handPath;
}

function extractSoloPropSteps(input: HandPathData | SoloPropData): readonly SoloPropStepData[] | null {
	if (isHandPathData(input)) {
		return null;
	}
	return input.steps;
}

/**
 * Tiles an array to fill exactly `targetLength` entries by repeating cyclically.
 */
function tile<T>(items: readonly T[], targetLength: number): T[] {
	const result: T[] = [];
	for (let i = 0; i < targetLength; i++) {
		result.push(items[i % items.length]!);
	}
	return result;
}

/**
 * Describe the combined sequence's frame from the two sources' native frames.
 *
 * Must stay symmetric: which source the caller happens to pass as `left` says
 * nothing about the frame the pair lives in. The classification follows the
 * canonical derivers (grid-mode-deriver for motions, hand-path-factory for
 * paths): a CENTER-touching frame wins, otherwise any disagreement — including
 * a skewed source paired with a square one — is skewed.
 */
function resolveFusedGridMode(
	leftGridMode: GridMode,
	rightGridMode: GridMode
): GridMode {
	if (leftGridMode === rightGridMode) return leftGridMode;
	if (leftGridMode === GridMode.CENTRIC || rightGridMode === GridMode.CENTRIC) {
		return GridMode.CENTRIC;
	}
	return GridMode.SKEWED;
}

/**
 * Builds minimal SoloPropStepData entries from a location sequence.
 * Used when the input was a bare HandPathData without full step info.
 */
function buildMinimalSteps(
	locations: readonly GridLocation[],
	count: number
): SoloPropStepData[] {
	const steps: SoloPropStepData[] = [];
	for (let i = 0; i < count; i++) {
		steps.push({
			startLocation: locations[i]!,
			endLocation: locations[i + 1]!,
			startOrientation: Orientation.IN,
			endOrientation: Orientation.IN,
			motionType: MotionType.STATIC,
			rotationDirection: RotationDirection.NO_ROTATION,
			turns: 0,
			duration: 1,
		});
	}
	return steps;
}

function buildSoloPropFromHandPath(
	handPath: HandPathData,
	steps: SoloPropStepData[],
	length: number
): SoloPropData {
	return {
		id: crypto.randomUUID(),
		steps,
		startLocation: handPath.startLocation,
		startOrientation: Orientation.IN,
		contentHash: "",
		handPath,
		length,
		bigrams: handPath.bigrams,
		impliedGridMode: handPath.impliedGridMode,
	};
}

export function fuseSequences(
	left: HandPathData | SoloPropData,
	right: HandPathData | SoloPropData,
	options?: FuseOptions
): SequenceData {
	const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
	const alignmentOffset = options?.alignmentOffset ?? 0;

	const leftHandPath = extractHandPath(left);
	const rightHandPath = extractHandPath(right);

	// Derive step count from locations (N+1 locations = N steps), not from
	// the `length` property which may be stale or incorrect in existing data.
	const leftLength = leftHandPath.locations.length - 1;
	const rightLength = rightHandPath.locations.length - 1;

	// Compute target length: LCM of both, truncated if it exceeds maxSteps
	const naturalLength = lcm(leftLength, rightLength);
	const targetLength = naturalLength > maxSteps
		? Math.min(leftLength, rightLength)
		: naturalLength;

	// Tile hand path locations to fill the target length.
	// Each location pair (i, i+1) defines one step's start and end.
	const leftLocations = tile(leftHandPath.locations, targetLength + 1);
	const rightLocations = tile(
		rightHandPath.locations,
		targetLength + 1 + alignmentOffset
	).slice(alignmentOffset);

	// Build solo prop steps by tiling the source steps if available,
	// otherwise synthesize minimal steps from hand path locations.
	const leftSoloSteps = extractSoloPropSteps(left);
	const rightSoloSteps = extractSoloPropSteps(right);

	const tiledLeftSteps = leftSoloSteps
		? tile(leftSoloSteps, targetLength)
		: buildMinimalSteps(leftLocations, targetLength);

	const tiledRightSteps = rightSoloSteps
		? tile(rightSoloSteps, targetLength)
		: buildMinimalSteps(rightLocations, targetLength);

	// Build per-step step pairings. Without full motion analysis we mark
	// letter and positions as null/false - downstream hydration fills them.
	const stepPairings: StepPairingData[] = [];
	for (let i = 0; i < targetLength; i++) {
		stepPairings.push({
			letter: null,
			leftReversal: false,
			rightReversal: false,
			startPosition: null,
			endPosition: null,
		});
	}

	// Build SoloPropData wrappers. For inputs that were already SoloPropData,
	// preserve the metadata and override just the steps and length.
	const leftSoloProp: SoloPropData = isHandPathData(left)
		? buildSoloPropFromHandPath(leftHandPath, tiledLeftSteps, targetLength)
		: {
			...left,
			steps: tiledLeftSteps,
			length: targetLength,
			handPath: leftHandPath,
		};

	const rightSoloProp: SoloPropData = isHandPathData(right)
		? buildSoloPropFromHandPath(rightHandPath, tiledRightSteps, targetLength)
		: {
			...right,
			steps: tiledRightSteps,
			length: targetLength,
			handPath: rightHandPath,
		};

	// A 45-degree adjustment can place one source on Box while its partner stays
	// on Diamond. Preserve each motion's native frame and describe the combined
	// sequence as skewed when those frames differ.
	const leftGridMode =
		leftSoloProp.impliedGridMode ?? rightSoloProp.impliedGridMode ?? GridMode.DIAMOND;
	const rightGridMode =
		rightSoloProp.impliedGridMode ?? leftSoloProp.impliedGridMode ?? GridMode.DIAMOND;
	const gridMode = resolveFusedGridMode(leftGridMode, rightGridMode);

	// Build proper steps with motion data so ensureMotionData short-circuits
	const steps: StepData[] = [];
	for (let i = 0; i < targetLength; i++) {
		const leftStep = tiledLeftSteps[i]!;
		const rightStep = tiledRightSteps[i]!;
		steps.push({
			id: crypto.randomUUID(),
			stepNumber: i + 1,
			duration: leftStep.duration ?? 1,
			leftReversal: stepPairings[i]!.leftReversal,
			rightReversal: stepPairings[i]!.rightReversal,
			isBlank: false,
			letter: stepPairings[i]!.letter ?? null,
			startPosition: null,
			endPosition: null,
			// Rehydrate through the canonical owner so the fused motions carry the
			// same authored fields the two-hand path carries: prefloat provenance
			// (a float's rotationDirection is noRotation, so dropping it silently
			// flips pro↔anti in the letter lookup), handPath, skew, and plane.
			motions: {
				left: rehydrateMotion(leftStep, HandSide.LEFT, leftGridMode, PropType.STAFF),
				right: rehydrateMotion(rightStep, HandSide.RIGHT, rightGridMode, PropType.STAFF),
			},
		});
	}

	// Placeholder name until letters are derived (see fusedDisplayName). HandPath
	// data carries no `name` in practice, so the old `"blue + red"` label leaked
	// into saved docs — fall back to an honest human label instead.
	const placeholderName =
		leftHandPath.name && rightHandPath.name
			? `${leftHandPath.name} + ${rightHandPath.name}`
			: "Fused sequence";

	const sequence = createSequenceData({
		name: placeholderName,
		displayName: placeholderName,
		word: "__fused__",
		steps,
		leftSoloProp,
		rightSoloProp,
		stepPairings,
		sequenceLength: targetLength,
		isCircular: false,
		isFavorite: false,
		tags: [],
		gridMode,
		metadata: { fusedFrom: [leftHandPath.id, rightHandPath.id] },
	});

	// Fuse normally receives two already-verified one-hand LOOPs, but this service
	// also accepts bare hand paths. Measure the combined seam instead of asserting
	// it, then let the canonical detector compare step 1 with the tail only when
	// the resulting motion really closes in both position and orientation.
	const withCircularity = {
		...sequence,
		isCircular: isSeamlesslyLoopable(sequence),
	};
	const withReversals = reversalDetector.processReversals(withCircularity);
	const synchronizedPairings = withReversals.stepPairings?.map(
		(pairing, index) => ({
			...pairing,
			leftReversal: withReversals.steps[index]?.leftReversal ?? false,
			rightReversal: withReversals.steps[index]?.rightReversal ?? false,
		})
	);

	return {
		...withReversals,
		...(synchronizedPairings && { stepPairings: synchronizedPairings }),
	};
}
