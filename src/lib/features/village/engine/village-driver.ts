/**
 * Paces a village in real time. The sim itself only knows "one more tick";
 * this driver turns elapsed seconds into a whole number of ticks at the rules'
 * tick rate times the chosen speed, and carries the leftover fraction to the
 * next frame. It is fed by the render loop, so it needs no timer of its own
 * and a 50x speed really runs 50x (several ticks per frame) instead of being
 * capped by how often the browser lets a timer fire.
 */

export interface VillageDriverOptions {
	ticksPerSecond: number;
	step: () => void;
	// A frame never runs more ticks than this. Protects the page when a tab
	// wakes from the background or the sim falls behind at high speed: the
	// village skips ahead less, instead of freezing to catch up.
	maxTicksPerAdvance?: number;
	// Longest frame gap honoured, in seconds, for the same reason.
	maxFrameSeconds?: number;
}

export interface VillageDriver {
	readonly isRunning: boolean;
	readonly speed: number;
	/** Feed elapsed real seconds; returns how many ticks ran. */
	advance(elapsedSeconds: number): number;
	play(): void;
	pause(): void;
	setSpeed(speed: number): void;
}

export function createVillageDriver(options: VillageDriverOptions): VillageDriver {
	const maxTicks = options.maxTicksPerAdvance ?? 64;
	const maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
	let accumulator = 0;
	let isRunning = false;
	let speed = 1;

	return {
		get isRunning() {
			return isRunning;
		},
		get speed() {
			return speed;
		},
		advance(elapsedSeconds) {
			if (!isRunning || !(elapsedSeconds > 0)) return 0;
			accumulator +=
				Math.min(elapsedSeconds, maxFrameSeconds) * options.ticksPerSecond * speed;
			let ran = 0;
			while (accumulator >= 1 && ran < maxTicks) {
				options.step();
				accumulator -= 1;
				ran++;
			}
			// Whatever the cap left over is dropped, not banked for later.
			if (accumulator >= 1) accumulator = 0;
			return ran;
		},
		play() {
			isRunning = true;
		},
		pause() {
			isRunning = false;
			accumulator = 0;
		},
		setSpeed(next) {
			speed = Math.max(0, next);
		},
	};
}
