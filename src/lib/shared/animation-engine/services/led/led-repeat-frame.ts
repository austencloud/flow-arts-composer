import type { LedFrameInput, LedLook } from "../../domain/types/led-types";

/** Values remembered per LED: propIndex, ledIndex, x, y, r, g, b, brightness. */
const STRIDE = 8;

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
 * Only a repeat of a continuous frame is skipped. After a jump (a scrub or a
 * loop wrap) the repeats keep running, as before, so a trail left over from the
 * other moment fades out instead of freezing on screen. Any change in what
 * would be drawn — an LED's place, colour or brightness, the look, either
 * canvas size — makes the frame new again.
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

	isRepeat(
		input: LedFrameInput,
		lookKey: string,
		displayWidth: number,
		displayHeight: number,
	): boolean {
		if (!this.recorded || !this.continuous) return false;
		if (
			input.currentTime !== this.timeMs ||
			lookKey !== this.lookKey ||
			input.canvasWidth !== this.frameWidth ||
			input.canvasHeight !== this.frameHeight ||
			displayWidth !== this.displayWidth ||
			displayHeight !== this.displayHeight
		) {
			return false;
		}
		const count = Math.min(input.leds.length, this.values.length / STRIDE);
		if (count !== this.count) return false;
		const v = this.values;
		for (let i = 0; i < count; i++) {
			const led = input.leds[i]!;
			const o = i * STRIDE;
			if (
				v[o] !== led.propIndex ||
				v[o + 1] !== led.ledIndex ||
				v[o + 2] !== led.x ||
				v[o + 3] !== led.y ||
				v[o + 4] !== led.r ||
				v[o + 5] !== led.g ||
				v[o + 6] !== led.b ||
				v[o + 7] !== led.brightness
			) {
				return false;
			}
		}
		return true;
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
}
