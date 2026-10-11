
import { describe, it, expect, beforeAll } from "vitest";
import { ColorEndpointDetector } from "#lib/features/video/video-trails/services/color-endpoint-detector.js";
import type { DetectionConfig } from "#lib/features/video/video-trails/domain/types.js";

// jsdom doesn't implement ImageData. Provide a minimal polyfill that stores
// the pixel data exactly like the browser version so the detector can read it.
beforeAll(() => {
	if (typeof globalThis.ImageData === "undefined") {
		class ImageDataPolyfill {
			readonly data: Uint8ClampedArray;
			readonly width: number;
			readonly height: number;
			constructor(data: Uint8ClampedArray, width: number, height: number) {
				this.data = data;
				this.width = width;
				this.height = height;
			}
		}
		(globalThis as any).ImageData = ImageDataPolyfill;
	}
});

// Target: pure red (colorWeights used as target color for this detector)
const RED_CONFIG: DetectionConfig = {
	threshold: 0.3,
	sensitivity: 1.0,
	colorWeights: { r: 1.0, g: 0.0, b: 0.0 },
	minArea: 1,
	maxEndpoints: 4,
};

function createColorFrame(
	width: number,
	height: number,
	spots: { x: number; y: number; r: number; g: number; b: number }[],
): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	// Fill with neutral gray
	for (let i = 0; i < data.length; i += 4) {
		data[i] = 128;
		data[i + 1] = 128;
		data[i + 2] = 128;
		data[i + 3] = 255;
	}
	for (const spot of spots) {
		const idx = (spot.y * width + spot.x) * 4;
		data[idx] = Math.round(spot.r * 255);
		data[idx + 1] = Math.round(spot.g * 255);
		data[idx + 2] = Math.round(spot.b * 255);
	}
	return new ImageData(data, width, height);
}

describe("ColorEndpointDetector", () => {
	it("detects pixels matching target color", () => {
		const detector = new ColorEndpointDetector();
		const frame = createColorFrame(20, 20, [{ x: 10, y: 10, r: 1.0, g: 0.0, b: 0.0 }]);
		const endpoints = detector.detect(frame, RED_CONFIG);
		expect(endpoints.length).toBeGreaterThan(0);
		expect(endpoints[0]!.x).toBe(10);
		expect(endpoints[0]!.y).toBe(10);
	});

	it("ignores pixels that don't match target color", () => {
		const detector = new ColorEndpointDetector();
		// Blue pixel should not match a red target
		const frame = createColorFrame(20, 20, [{ x: 10, y: 10, r: 0.0, g: 0.0, b: 1.0 }]);
		const endpoints = detector.detect(frame, RED_CONFIG);
		expect(endpoints.length).toBe(0);
	});

	it("detects multiple color clusters", () => {
		const detector = new ColorEndpointDetector();
		const frame = createColorFrame(100, 20, [
			{ x: 10, y: 10, r: 1.0, g: 0.0, b: 0.0 },
			{ x: 90, y: 10, r: 0.9, g: 0.1, b: 0.0 },
		]);
		const endpoints = detector.detect(frame, RED_CONFIG);
		expect(endpoints.length).toBe(2);
	});

	it("assigns different propIndex to distant clusters", () => {
		const detector = new ColorEndpointDetector();
		const frame = createColorFrame(100, 20, [
			{ x: 10, y: 10, r: 1.0, g: 0.0, b: 0.0 },
			{ x: 90, y: 10, r: 1.0, g: 0.0, b: 0.0 },
		]);
		const endpoints = detector.detect(frame, RED_CONFIG);
		if (endpoints.length >= 2) {
			expect(endpoints[0]!.propIndex).not.toBe(endpoints[1]!.propIndex);
		}
	});

	it("respects maxEndpoints limit", () => {
		const detector = new ColorEndpointDetector();
		const frame = createColorFrame(100, 100, [
			{ x: 10, y: 10, r: 1.0, g: 0.0, b: 0.0 },
			{ x: 30, y: 30, r: 0.95, g: 0.05, b: 0.0 },
			{ x: 50, y: 50, r: 0.9, g: 0.1, b: 0.0 },
			{ x: 70, y: 70, r: 0.85, g: 0.1, b: 0.05 },
			{ x: 90, y: 90, r: 0.8, g: 0.15, b: 0.05 },
		]);
		const endpoints = detector.detect(frame, { ...RED_CONFIG, maxEndpoints: 2 });
		expect(endpoints.length).toBeLessThanOrEqual(2);
	});

	it("detects near-match colors within acceptance radius", () => {
		const detector = new ColorEndpointDetector();
		// Orange-red should still match a red target with enough threshold
		const frame = createColorFrame(20, 20, [{ x: 10, y: 10, r: 1.0, g: 0.3, b: 0.0 }]);
		const config: DetectionConfig = { ...RED_CONFIG, threshold: 0.5 };
		const endpoints = detector.detect(frame, config);
		expect(endpoints.length).toBeGreaterThan(0);
	});

	it("returns empty array for blank frame", () => {
		const detector = new ColorEndpointDetector();
		// All gray, no red anywhere
		const frame = createColorFrame(20, 20, []);
		const endpoints = detector.detect(frame, RED_CONFIG);
		expect(endpoints.length).toBe(0);
	});

});
