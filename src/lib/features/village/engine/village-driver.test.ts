import { describe, expect, it } from "vitest";
import { createVillageDriver } from "./village-driver";

function counting(options: { ticksPerSecond: number; maxTicksPerAdvance?: number }) {
	let ticks = 0;
	const driver = createVillageDriver({ ...options, step: () => ticks++ });
	return { driver, ticks: () => ticks };
}

describe("village driver", () => {
	it("runs nothing until played, and nothing while paused", () => {
		const { driver, ticks } = counting({ ticksPerSecond: 10 });
		expect(driver.advance(1 / 60)).toBe(0);
		driver.play();
		driver.pause();
		expect(driver.advance(0.2)).toBe(0);
		expect(ticks()).toBe(0);
	});

	it("carries the leftover fraction across frames at 1x", () => {
		const { driver, ticks } = counting({ ticksPerSecond: 10 });
		driver.play();
		// Each 60 fps frame is a sixth of a tick; none would ever run without
		// the carry. Seven frames is 1.17 ticks.
		for (let i = 0; i < 7; i++) driver.advance(1 / 60);
		expect(ticks()).toBe(1);
		// A second of frames is ten ticks, give or take float rounding.
		for (let i = 0; i < 60; i++) driver.advance(1 / 60);
		expect(ticks()).toBeGreaterThanOrEqual(10);
		expect(ticks()).toBeLessThanOrEqual(11);
	});

	it("runs several ticks per frame at high speed instead of capping", () => {
		const { driver, ticks } = counting({ ticksPerSecond: 10 });
		driver.play();
		driver.setSpeed(50);
		for (let i = 0; i < 60; i++) driver.advance(1 / 60);
		// 500 ticks per second of frames, give or take float rounding on the last one.
		expect(ticks()).toBeGreaterThanOrEqual(499);
		expect(ticks()).toBeLessThanOrEqual(500);
	});

	it("caps one long frame instead of freezing to catch up", () => {
		const { driver } = counting({ ticksPerSecond: 10, maxTicksPerAdvance: 64 });
		driver.play();
		driver.setSpeed(50);
		// A tab waking after 30 s honours only 0.25 s, and the cap drops the rest.
		expect(driver.advance(30)).toBe(64);
		expect(driver.advance(1 / 60)).toBeLessThan(64);
	});
});
