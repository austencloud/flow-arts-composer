import { describe, it, expect } from "vitest";
import type { LedFrameInput, LedLook, LedSample } from "../../domain/types/led-types";
import { DEFAULT_LED_SHUTTER } from "../../domain/led-photometry";
import { LedRepeatFrameGuard } from "./led-repeat-frame";

const LOOK: LedLook = { shutter: DEFAULT_LED_SHUTTER, glare: 0.5, brightness: 4 };
const KEY = LedRepeatFrameGuard.lookKey(LOOK, false);

function led(overrides: Partial<LedSample> = {}): LedSample {
	return {
		x: 120.5,
		y: 300.25,
		propIndex: 1,
		ledIndex: 0,
		endpointIndex: 0,
		brightness: 1,
		r: 1,
		g: 0.2,
		b: 0.1,
		...overrides,
	};
}

function frame(timeMs: number, leds: LedSample[] = [led()], size = 950): LedFrameInput {
	return { leds, currentTime: timeMs, canvasWidth: size, canvasHeight: size };
}

function guardAfter(input: LedFrameInput, continuous = true): LedRepeatFrameGuard {
	const guard = new LedRepeatFrameGuard(8);
	guard.record(input, KEY, 800, 800, continuous);
	return guard;
}

describe("LedRepeatFrameGuard", () => {
	it("skips an export re-render of a frame it already drew", () => {
		const guard = guardAfter(frame(1000 / 30));
		// The render loop rebuilds the LED list each tick; equal values still match.
		expect(guard.isRepeat(frame(1000 / 30), KEY, 800, 800)).toBe(true);
	});

	it("draws the next export frame", () => {
		const guard = guardAfter(frame(1000 / 30));
		expect(guard.isRepeat(frame(2000 / 30, [led({ x: 140 })]), KEY, 800, 800)).toBe(false);
	});

	it("keeps re-rendering after a jump so a stale trail can fade", () => {
		const guard = guardAfter(frame(5000), false);
		expect(guard.isRepeat(frame(5000), KEY, 800, 800)).toBe(false);
	});

	it("draws an edit made while the clock stands still", () => {
		const guard = guardAfter(frame(1000));
		expect(guard.isRepeat(frame(1000, [led({ x: 121 })]), KEY, 800, 800)).toBe(false);
		expect(guard.isRepeat(frame(1000, [led({ r: 0.9 })]), KEY, 800, 800)).toBe(false);
		expect(guard.isRepeat(frame(1000, [led({ brightness: 0.5 })]), KEY, 800, 800)).toBe(false);
		expect(guard.isRepeat(frame(1000, [led(), led({ ledIndex: 1 })]), KEY, 800, 800)).toBe(false);
		const brighter = LedRepeatFrameGuard.lookKey({ ...LOOK, brightness: 5 }, false);
		expect(guard.isRepeat(frame(1000), brighter, 800, 800)).toBe(false);
		expect(guard.isRepeat(frame(1000), LedRepeatFrameGuard.lookKey(LOOK, true), 800, 800)).toBe(
			false,
		);
	});

	it("draws again when either canvas changes size", () => {
		const guard = guardAfter(frame(1000));
		expect(guard.isRepeat(frame(1000, [led()], 900), KEY, 800, 800)).toBe(false);
		expect(guard.isRepeat(frame(1000), KEY, 640, 800)).toBe(false);
	});

	it("forgets the frame after a reset", () => {
		const guard = guardAfter(frame(1000));
		guard.reset();
		expect(guard.isRepeat(frame(1000), KEY, 800, 800)).toBe(false);
	});
});
