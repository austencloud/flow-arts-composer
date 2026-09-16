/**
 * Module singleton getters for all 15 LOOP executor variations + the selector.
 */
import { browser } from '$app/environment';
import { getLOOPParameterProvider } from '$lib/features/create/generate/shared/get-loop-parameter-provider';

import { StrictRotatedLOOPExecutor } from './services/strict-rotated-loop-executor';
import { StrictMirroredLOOPExecutor } from './services/strict-mirrored-loop-executor';
import { StrictFlippedLOOPExecutor } from './services/strict-flipped-loop-executor';
import { StrictSwappedLOOPExecutor } from './services/strict-swapped-loop-executor';
import { StrictInvertedLOOPExecutor } from './services/strict-inverted-loop-executor';
import { MirroredSwappedLOOPExecutor } from './services/mirrored-swapped-loop-executor';
import { SwappedInvertedLOOPExecutor } from './services/swapped-inverted-loop-executor';
import { MirroredInvertedLOOPExecutor } from './services/mirrored-inverted-loop-executor';
import { RotatedSwappedLOOPExecutor } from './services/rotated-swapped-loop-executor';
import { RotatedInvertedLOOPExecutor } from './services/rotated-inverted-loop-executor';
import { MirroredRotatedLOOPExecutor } from './services/mirrored-rotated-loop-executor';
import { MirroredRotatedInvertedLOOPExecutor } from './services/mirrored-rotated-inverted-loop-executor';
import { MirroredSwappedInvertedLOOPExecutor } from './services/mirrored-swapped-inverted-loop-executor';
import { MirroredRotatedInvertedSwappedLOOPExecutor } from './services/mirrored-rotated-inverted-swapped-loop-executor';
import { RewoundLOOPExecutor } from './services/rewound-loop-executor';
import { RotatedSwappedInvertedLOOPExecutor } from './services/rotated-swapped-inverted-loop-executor';
import { LOOPExecutorSelector } from './services/loop-executor-selector';

// Basic executors (orientationCalculator only)
let _strictMirrored: StrictMirroredLOOPExecutor | null = null;
let _strictFlipped: StrictFlippedLOOPExecutor | null = null;
let _strictInverted: StrictInvertedLOOPExecutor | null = null;
let _mirroredSwapped: MirroredSwappedLOOPExecutor | null = null;
let _swappedInverted: SwappedInvertedLOOPExecutor | null = null;

// Executors needing gridPlacementDeriver too
let _strictRotated: StrictRotatedLOOPExecutor | null = null;
let _strictSwapped: StrictSwappedLOOPExecutor | null = null;
let _rotatedSwapped: RotatedSwappedLOOPExecutor | null = null;

// Executors needing LOOPParameterProvider
let _mirroredInverted: MirroredInvertedLOOPExecutor | null = null;
let _rotatedInverted: RotatedInvertedLOOPExecutor | null = null;
let _mirroredSwappedInverted: MirroredSwappedInvertedLOOPExecutor | null = null;
let _rotatedSwappedInverted: RotatedSwappedInvertedLOOPExecutor | null = null;

// Composite executors
let _mirroredRotated: MirroredRotatedLOOPExecutor | null = null;
let _mirroredRotatedInverted: MirroredRotatedInvertedLOOPExecutor | null = null;
let _mirroredRotatedInvertedSwapped: MirroredRotatedInvertedSwappedLOOPExecutor | null = null;

// Other
let _rewound: RewoundLOOPExecutor | null = null;

// Selector
let _selector: LOOPExecutorSelector | null = null;

function _check() {
	if (!browser) throw new Error('LOOP executors are browser-only');
}

export function getStrictRotatedLOOPExecutor() {
	_check();
	return _strictRotated ??= new StrictRotatedLOOPExecutor();
}
export function getStrictMirroredLOOPExecutor() {
	_check();
	return _strictMirrored ??= new StrictMirroredLOOPExecutor();
}
export function getStrictFlippedLOOPExecutor() {
	_check();
	return _strictFlipped ??= new StrictFlippedLOOPExecutor();
}
export function getStrictSwappedLOOPExecutor() {
	_check();
	return _strictSwapped ??= new StrictSwappedLOOPExecutor();
}
export function getStrictInvertedLOOPExecutor() {
	_check();
	return _strictInverted ??= new StrictInvertedLOOPExecutor();
}
export function getMirroredSwappedLOOPExecutor() {
	_check();
	return _mirroredSwapped ??= new MirroredSwappedLOOPExecutor();
}
export function getSwappedInvertedLOOPExecutor() {
	_check();
	return _swappedInverted ??= new SwappedInvertedLOOPExecutor();
}
export function getRotatedSwappedLOOPExecutor() {
	_check();
	return _rotatedSwapped ??= new RotatedSwappedLOOPExecutor();
}
export function getRewoundLOOPExecutor() {
	_check();
	return _rewound ??= new RewoundLOOPExecutor();
}

// Executors that need LOOPParameterProvider
export function getMirroredInvertedLOOPExecutor() {
	_check();
	return _mirroredInverted ??= new MirroredInvertedLOOPExecutor(getLOOPParameterProvider());
}
export function getRotatedInvertedLOOPExecutor() {
	_check();
	return _rotatedInverted ??= new RotatedInvertedLOOPExecutor(getLOOPParameterProvider());
}
export function getMirroredSwappedInvertedLOOPExecutor() {
	_check();
	return _mirroredSwappedInverted ??= new MirroredSwappedInvertedLOOPExecutor(getLOOPParameterProvider());
}
export function getRotatedSwappedInvertedLOOPExecutor() {
	_check();
	return _rotatedSwappedInverted ??= new RotatedSwappedInvertedLOOPExecutor(getLOOPParameterProvider());
}

// Composite executors
export function getMirroredRotatedLOOPExecutor() {
	_check();
	return _mirroredRotated ??= new MirroredRotatedLOOPExecutor(getStrictRotatedLOOPExecutor(), getStrictMirroredLOOPExecutor());
}
export function getMirroredRotatedInvertedLOOPExecutor() {
	_check();
	return _mirroredRotatedInverted ??= new MirroredRotatedInvertedLOOPExecutor(getStrictRotatedLOOPExecutor(), getMirroredInvertedLOOPExecutor());
}
export function getMirroredRotatedInvertedSwappedLOOPExecutor() {
	_check();
	return _mirroredRotatedInvertedSwapped ??= new MirroredRotatedInvertedSwappedLOOPExecutor(getStrictRotatedLOOPExecutor(), getMirroredSwappedInvertedLOOPExecutor());
}

// The selector - needs all 15 executors
export function getLOOPExecutorSelector(): LOOPExecutorSelector {
	_check();
	return _selector ??= new LOOPExecutorSelector(
		getStrictRotatedLOOPExecutor(),
		getStrictMirroredLOOPExecutor(),
		getStrictFlippedLOOPExecutor(),
		getStrictSwappedLOOPExecutor(),
		getStrictInvertedLOOPExecutor(),
		getMirroredSwappedLOOPExecutor(),
		getSwappedInvertedLOOPExecutor(),
		getMirroredInvertedLOOPExecutor(),
		getRotatedSwappedLOOPExecutor(),
		getRotatedInvertedLOOPExecutor(),
		getMirroredRotatedLOOPExecutor(),
		getMirroredRotatedInvertedLOOPExecutor(),
		getMirroredSwappedInvertedLOOPExecutor(),
		getMirroredRotatedInvertedSwappedLOOPExecutor(),
		getRewoundLOOPExecutor(),
		getRotatedSwappedInvertedLOOPExecutor()
	);
}
