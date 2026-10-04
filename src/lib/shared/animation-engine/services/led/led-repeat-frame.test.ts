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

/** An LED at (u, v) in the engine's square, drawn in a width x height frame. */
function ledInFrame(width: number, height: number, u: number, v: number): LedSample {
	const side = Math.min(width, height);
	return led({ x: (width - side) / 2 + u * side, y: (height - side) / 2 + v * side });
}

function tallFrame(timeMs: number, height: number, u: number): LedFrameInput {
	return {
		leds: [ledInFrame(396, height, u, 0.4)],
		currentTime: timeMs,
		canvasWidth: 396,
		canvasHeight: height,
	};
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
		expect(guard.classify(frame(1000 / 30), KEY, 800, 800)).toBe("repeat");
	});

	it("draws the next export frame", () => {
		const guard = guardAfter(frame(1000 / 30));
		expect(guard.classify(frame(2000 / 30, [led({ x: 140 })]), KEY, 800, 800)).toBe("new");
	});

	it("keeps re-rendering after a jump so a stale trail can fade", () => {
		const guard = guardAfter(frame(5000), false);
		expect(guard.classify(frame(5000), KEY, 800, 800)).toBe("new");
		expect(guard.classify(tallFrame(5000, 690, 0.5), KEY, 800, 790)).toBe("new");
	});

	it("draws an edit made while the clock stands still", () => {
		const guard = guardAfter(frame(1000));
		expect(guard.classify(frame(1000, [led({ x: 121 })]), KEY, 800, 800)).toBe("new");
		expect(guard.classify(frame(1000, [led({ r: 0.9 })]), KEY, 800, 800)).toBe("new");
		expect(guard.classify(frame(1000, [led({ brightness: 0.5 })]), KEY, 800, 800)).toBe("new");
		expect(guard.classify(frame(1000, [led(), led({ ledIndex: 1 })]), KEY, 800, 800)).toBe("new");
		const brighter = LedRepeatFrameGuard.lookKey({ ...LOOK, brightness: 5 }, false);
		expect(guard.classify(frame(1000), brighter, 800, 800)).toBe("new");
		expect(guard.classify(frame(1000), LedRepeatFrameGuard.lookKey(LOOK, true), 800, 800)).toBe(
			"new",
		);
	});

	it("reframes the same moment when the box resizes after it was drawn", () => {
		// The opening tunnel: each new time is drawn, then its box shrinks.
		const guard = new LedRepeatFrameGuard(8);
		guard.record(tallFrame(1000, 700, 0.5), KEY, 396, 700, true);
		expect(guard.classify(tallFrame(1000, 690, 0.5), KEY, 396, 690)).toBe("reframe");
		// Only the visible canvas resized.
		expect(guard.classify(tallFrame(1000, 700, 0.5), KEY, 396, 690)).toBe("reframe");
	});

	it("draws a resized frame whose LEDs moved within the square", () => {
		const guard = new LedRepeatFrameGuard(8);
		guard.record(tallFrame(1000, 700, 0.5), KEY, 396, 700, true);
		expect(guard.classify(tallFrame(1000, 690, 0.52), KEY, 396, 690)).toBe("new");
		// Kept at the same pixel, the LED is somewhere else in the new square.
		expect(guard.classify(frame(1000, [ledInFrame(396, 700, 0.5, 0.4)], 900), KEY, 396, 690)).toBe(
			"new",
		);
		expect(guard.classify(tallFrame(1033, 690, 0.5), KEY, 396, 690)).toBe("new");
	});

	it("forgets the frame after a reset", () => {
		const guard = guardAfter(frame(1000));
		guard.reset();
		expect(guard.classify(frame(1000), KEY, 800, 800)).toBe("new");
	});
});
