import { describe, it, expect } from "vitest";
import {
	deriveFrameMath,
	type MandalaFrameSpec,
} from "#lib/shared/mandala/services/mandala-frame-renderer.js";

function spec(overrides: Partial<MandalaFrameSpec> = {}): MandalaFrameSpec {
	return {
		steps: [],
		leftPropType: "staff",
		rightPropType: "staff",
		pathShape: "arc",
		lineWeight: 2.5,
		bgColor: "#000000",
		resolution: 1080,
		period: 5,
		reps: 1,
		fps: 30,
		rangeMax: 250,
		rotation: 90,
		morphColors: null,
		solidPair: ["#00e5ff", "#76ff03"],
		...overrides,
	};
}

describe("deriveFrameMath", () => {
	it("computes framesPerCycle and totalFrames from period/fps/reps", () => {
		const m = deriveFrameMath(spec({ period: 5, fps: 60, reps: 3 }));
		expect(m.framesPerCycle).toBe(300); // ceil(5 * 60)
		expect(m.totalFrames).toBe(900); // 300 * 3
	});

	it("rounds framesPerCycle up for fractional periods", () => {
		const m = deriveFrameMath(spec({ period: 1.67, fps: 30, reps: 1 }));
		expect(m.framesPerCycle).toBe(Math.ceil(1.67 * 30)); // 51
	});

	// Regression: Loops=1 + Spin=90 previously rounded total rotation to 0 turns,
	// producing an export with NO spin. A spinning mandala must complete >= 1 turn.
	it("guarantees at least one whole rotation turn when spin is enabled", () => {
		const m = deriveFrameMath(spec({ reps: 1, period: 5, fps: 30, rotation: 90 }));
		expect(m.turns).toBe(1);
	});

	it("uses zero turns when rotation is disabled", () => {
		const m = deriveFrameMath(spec({ rotation: 0 }));
		expect(m.turns).toBe(0);
	});

	it("rounds total rotation to a whole number of turns (seamless loop)", () => {
		// turnsRaw = (period*reps / 5) * rotation / 360
		// period 5, reps 8, rotation 90 -> (40/5)*90/360 = 2.0 -> 2 turns
		const m = deriveFrameMath(spec({ period: 5, reps: 8, rotation: 90 }));
		expect(m.turns).toBe(2);
	});

	it("derives whole flow-color cycles in flow mode, zero in solid mode", () => {
		const flow = deriveFrameMath(spec({ morphColors: ["#fff", "#000"], reps: 3 }));
		expect(flow.colorCycles).toBe(1); // round(3/3)

		const flow6 = deriveFrameMath(spec({ morphColors: ["#fff", "#000"], reps: 6 }));
		expect(flow6.colorCycles).toBe(2); // round(6/3)

		const flow1 = deriveFrameMath(spec({ morphColors: ["#fff", "#000"], reps: 1 }));
		expect(flow1.colorCycles).toBe(1); // max(1, round(1/3))

		const solid = deriveFrameMath(spec({ morphColors: null, reps: 4 }));
		expect(solid.colorCycles).toBe(0);
	});
});
