import { describe, expect, it } from "vitest";
import {
	padQrBox,
	frameBoxToScreenRect,
} from "#lib/shared/qr/services/scan-capture-geometry.js";

describe("padQrBox", () => {
	it("adds the quiet-zone pad on every side", () => {
		// 100px QR in the middle of a 1280x720 frame; 14% pad = 14px.
		const padded = padQrBox({ x: 500, y: 300, width: 100, height: 100 }, 1280, 720);
		expect(padded).toEqual({ x: 486, y: 286, width: 128, height: 128 });
	});

	it("clamps at the frame edges instead of going negative", () => {
		const padded = padQrBox({ x: 4, y: 2, width: 100, height: 100 }, 1280, 720);
		expect(padded).not.toBeNull();
		expect(padded!.x).toBe(0);
		expect(padded!.y).toBe(0);
		// Width still covers the QR plus whatever pad fits.
		expect(padded!.width).toBeGreaterThanOrEqual(104);
	});

	it("clamps the far edge to the frame", () => {
		const padded = padQrBox({ x: 1200, y: 650, width: 100, height: 100 }, 1280, 720);
		expect(padded).not.toBeNull();
		expect(padded!.x + padded!.width).toBeLessThanOrEqual(1280);
		expect(padded!.y + padded!.height).toBeLessThanOrEqual(720);
	});

	it("rejects slivers too small to read as a chip", () => {
		expect(padQrBox({ x: 0, y: 0, width: 3, height: 3 }, 1280, 720)).toBeNull();
		expect(padQrBox({ x: 0, y: 0, width: 100, height: 100 }, 0, 0)).toBeNull();
	});
});

describe("frameBoxToScreenRect (object-fit: cover)", () => {
	it("maps 1:1 when frame and host match", () => {
		const rect = frameBoxToScreenRect(
			{ x: 10, y: 20, width: 50, height: 50 },
			400,
			300,
			{ left: 0, top: 0, width: 400, height: 300 },
		);
		expect(rect).toEqual({ left: 10, top: 20, width: 50, height: 50 });
	});

	it("scales by the FILLING dimension and crops the other symmetrically", () => {
		// 1280x720 frame in a 360x720 host (portrait phone): cover scale is
		// 720/720 = 1 vertically vs 360/1280 horizontally — the larger (1) wins,
		// so 1280*1 = 1280px of frame width is centered in 360px of host:
		// (360 - 1280) / 2 = -460 origin.
		const rect = frameBoxToScreenRect(
			{ x: 640, y: 360, width: 100, height: 100 },
			1280,
			720,
			{ left: 0, top: 0, width: 360, height: 720 },
		);
		expect(rect).toEqual({ left: 180, top: 360, width: 100, height: 100 });
	});

	it("offsets by the host's own viewport position", () => {
		const rect = frameBoxToScreenRect(
			{ x: 0, y: 0, width: 100, height: 100 },
			400,
			300,
			{ left: 50, top: 80, width: 400, height: 300 },
		);
		expect(rect).toEqual({ left: 50, top: 80, width: 100, height: 100 });
	});

	it("returns null for degenerate sizes", () => {
		expect(
			frameBoxToScreenRect(
				{ x: 0, y: 0, width: 10, height: 10 },
				0,
				0,
				{ left: 0, top: 0, width: 100, height: 100 },
			),
		).toBeNull();
		expect(
			frameBoxToScreenRect(
				{ x: 0, y: 0, width: 10, height: 10 },
				100,
				100,
				{ left: 0, top: 0, width: 0, height: 0 },
			),
		).toBeNull();
	});
});
