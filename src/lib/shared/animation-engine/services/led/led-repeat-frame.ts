import { frameOffset, measureFrame } from "../../domain/types/canvas-frame";
import type { LedFrameInput, LedLook, LedSample } from "../../domain/types/led-types";

/** Values remembered per LED: propIndex, ledIndex, x, y, r, g, b, brightness. */
const STRIDE = 8;

/**
 * How far an LED may sit from its recorded place, as a fraction of the engine
 * square, and still be the same moment laid onto a resized frame. The sampler
 * scales one square onto the other exactly; this only absorbs rounding.
 */
const REFRAME_TOLERANCE = 1e-3;

/** What a render would add to the moment already on the canvas. */
export type LedFrameVerdict =
	/** The moment already drawn, at the same size: nothing to draw. */
	| "repeat"
	/** The moment already drawn, on a resized frame: show the carried light again. */
	| "reframe"
	/** A new exposure. */
	| "new";

/**
 * Recognises a render of the moment the LED renderer has already drawn.
 *
 * The render loop keeps ticking while the clock stands still: a paused preview
 * and, above all, an export, which holds each frame's virtual time while the
 * frame is composited and encoded (about a dozen ticks per frame at 4 fps).
 * Those repeats are not new exposures. Run through the renderer, a zero time
 * step counts as a discontinuity, so every repeat deposited a stationary dot at
 * the LED and decayed the trail once more — exported streaks came out as
 * strings of beads. With `preserveDrawingBuffer` the canvas still holds the
 * first render, so the renderer can skip an exact repeat outright.
 *
 * The same moment can also come back on a resized frame. The opening tunnel's
 * box changes size every frame, and the resize lands one tick after the new
 * time is drawn, so each frame is drawn once at the old size and again at the
 * new one. That second render is a "reframe": the LEDs sit where they were in
 * the engine's square, and only the frame around it changed.
 *
 * Only a repeat of a continuous frame is recognised. After a jump (a scrub or
 * a loop wrap) the repeats keep running, as before, so a trail left over from
 * the other moment fades out instead of freezing on screen. Any change in what
 * would be drawn — an LED's place in the square, colour or brightness, or the
 * look — makes the frame new again.
 */
export class LedRepeatFrameGuard {
	private recorded = false;
	private timeMs = 0;
	private continuous = false;
	private lookKey = "";
	private frameWidth = 0;
	private frameHeight = 0;
	private displayWidth = 0;
	private displayHeight = 0;
	private count = 0;
	private values: Float64Array;

	constructor(maxLeds: number) {
		this.values = new Float64Array(maxLeds * STRIDE);
	}

	static lookKey(look: LedLook, reducedMotion: boolean): string {
		return `${reducedMotion ? 1 : 0}|${JSON.stringify(look)}`;
	}

	classify(
		input: LedFrameInput,
		lookKey: string,
		displayWidth: number,
		displayHeight: number,
	): LedFrameVerdict {
		if (!this.recorded || !this.continuous) return "new";
		if (input.currentTime !== this.timeMs || lookKey !== this.lookKey) return "new";
		const count = Math.min(input.leds.length, this.values.length / STRIDE);
		if (count !== this.count) return "new";
		const resized =
			input.canvasWidth !== this.frameWidth ||
			input.canvasHeight !== this.frameHeight ||
			displayWidth !== this.displayWidth ||
			displayHeight !== this.displayHeight;
		if (!resized) return this.sameLeds(input, count) ? "repeat" : "new";
		return this.sameLedsInSquare(input, count) ? "reframe" : "new";
	}

	record(
		input: LedFrameInput,
		lookKey: string,
		displayWidth: number,
		displayHeight: number,
		continuous: boolean,
	): void {
		this.recorded = true;
		this.timeMs = input.currentTime;
		this.continuous = continuous;
		this.lookKey = lookKey;
		this.frameWidth = input.canvasWidth;
		this.frameHeight = input.canvasHeight;
		this.displayWidth = displayWidth;
		this.displayHeight = displayHeight;
		const count = Math.min(input.leds.length, this.values.length / STRIDE);
		this.count = count;
		const v = this.values;
		for (let i = 0; i < count; i++) {
			const led = input.leds[i]!;
			const o = i * STRIDE;
			v[o] = led.propIndex;
			v[o + 1] = led.ledIndex;
			v[o + 2] = led.x;
			v[o + 3] = led.y;
			v[o + 4] = led.r;
			v[o + 5] = led.g;
			v[o + 6] = led.b;
			v[o + 7] = led.brightness;
		}
	}

	reset(): void {
		this.recorded = false;
	}

	private sameLeds(input: LedFrameInput, count: number): boolean {
		const v = this.values;
		for (let i = 0; i < count; i++) {
			const led = input.leds[i]!;
			const o = i * STRIDE;
			if (!this.sameEmitter(o, led) || v[o + 2] !== led.x || v[o + 3] !== led.y) {
				return false;
			}
		}
		return true;
	}

	/** Every LED in the same place relative to its frame's square. */
	private sameLedsInSquare(input: LedFrameInput, count: number): boolean {
		const before = measureFrame(this.frameWidth, this.frameHeight);
		const after = measureFrame(input.canvasWidth, input.canvasHeight);
		if (before.size <= 0 || after.size <= 0) return false;
		const beforeOffset = frameOffset(before);
		const afterOffset = frameOffset(after);
		const v = this.values;
		for (let i = 0; i < count; i++) {
			const led = input.leds[i]!;
			const o = i * STRIDE;
			if (!this.sameEmitter(o, led)) return false;
			const du =
				(led.x - afterOffset.x) / after.size - (v[o + 2]! - beforeOffset.x) / before.size;
			const dv =
				(led.y - afterOffset.y) / after.size - (v[o + 3]! - beforeOffset.y) / before.size;
			if (Math.abs(du) > REFRAME_TOLERANCE || Math.abs(dv) > REFRAME_TOLERANCE) return false;
		}
		return true;
	}

	private sameEmitter(o: number, led: LedSample): boolean {
		const v = this.values;
		return (
			v[o] === led.propIndex &&
			v[o + 1] === led.ledIndex &&
			v[o + 4] === led.r &&
			v[o + 5] === led.g &&
			v[o + 6] === led.b &&
			v[o + 7] === led.brightness
		);
	}
}
