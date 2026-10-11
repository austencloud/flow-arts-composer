/**
 * Tests for network-conditions.
 *
 * These catch silent bugs: a wrong threshold or a broken capability check would
 * never throw — it would just quietly speculate on a slow link (the regression
 * we're guarding against) or needlessly degrade a fast one. Neither is visible at
 * a glance, so they're worth pinning down here.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// The util reads navigator.connection, which only happens in the browser, so the
// module's `browser` guard must be true for these tests to exercise the logic.
vi.mock("$app/env", () => ({ browser: true }));

import {
	getNetworkConditions,
	isConstrainedConnection,
	shouldReduceBackgroundResolution,
} from "#lib/shared/platform/network-conditions.js";

type Conn = {
	saveData?: boolean;
	effectiveType?: string;
	downlink?: number;
	rtt?: number;
};

function setConnection(conn: Conn | undefined): void {
	Object.defineProperty(navigator, "connection", {
		value: conn,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	setConnection(undefined);
});

describe("getNetworkConditions", () => {
	it("reports unknown when the Network Information API is absent (Safari/Firefox)", () => {
		setConnection(undefined);
		const c = getNetworkConditions();
		expect(c.known).toBe(false);
		expect(c.effectiveType).toBeNull();
		expect(c.downlinkMbps).toBeNull();
		expect(c.rttMs).toBeNull();
		expect(c.saveData).toBe(false);
	});

	it("maps the API fields through when present", () => {
		setConnection({ saveData: true, effectiveType: "3g", downlink: 1.4, rtt: 350 });
		const c = getNetworkConditions();
		expect(c.known).toBe(true);
		expect(c.saveData).toBe(true);
		expect(c.effectiveType).toBe("3g");
		expect(c.downlinkMbps).toBe(1.4);
		expect(c.rttMs).toBe(350);
	});

	it("treats an unrecognized effectiveType bucket as null", () => {
		setConnection({ effectiveType: "5g" });
		expect(getNetworkConditions().effectiveType).toBeNull();
	});
});

describe("isConstrainedConnection", () => {
	it("is false when the API is unavailable — we don't degrade on a guess", () => {
		setConnection(undefined);
		expect(isConstrainedConnection()).toBe(false);
	});

	it("is false on a healthy 4g connection", () => {
		setConnection({ effectiveType: "4g", downlink: 10, rtt: 50, saveData: false });
		expect(isConstrainedConnection()).toBe(false);
	});

	it("is true when the user enabled data-saver, even on a fast link", () => {
		setConnection({ effectiveType: "4g", downlink: 10, rtt: 50, saveData: true });
		expect(isConstrainedConnection()).toBe(true);
	});

	it.each(["slow-2g", "2g", "3g"])(
		"is true on a measured %s bucket",
		(effectiveType) => {
			setConnection({ effectiveType, downlink: 10, rtt: 50 });
			expect(isConstrainedConnection()).toBe(true);
		}
	);

	it("is true on a 4g bucket with low measured bandwidth (congested LTE)", () => {
		setConnection({ effectiveType: "4g", downlink: 1.5, rtt: 60 });
		expect(isConstrainedConnection()).toBe(true);
	});

	it("is true on a 4g bucket with high measured latency", () => {
		setConnection({ effectiveType: "4g", downlink: 10, rtt: 350 });
		expect(isConstrainedConnection()).toBe(true);
	});

	it("ignores a downlink of 0 (unknown) rather than treating it as slow", () => {
		setConnection({ effectiveType: "4g", downlink: 0, rtt: 50 });
		expect(isConstrainedConnection()).toBe(false);
	});
});

describe("shouldReduceBackgroundResolution", () => {
	it("is false when the API is unavailable", () => {
		setConnection(undefined);
		expect(shouldReduceBackgroundResolution()).toBe(false);
	});

	it("keeps full resolution on a healthy 4g connection", () => {
		setConnection({ effectiveType: "4g", downlink: 10, rtt: 50, saveData: false });
		expect(shouldReduceBackgroundResolution()).toBe(false);
	});

	// The bug this guards against: Chrome under-reports downlink to 1–2 Mbps on
	// capable links (and on localhost). A bandwidth-keyed cap stretches the
	// background canvas ~2x and renders it zoomed/blurry. Render resolution must
	// ignore the downlink number on a 4g bucket.
	it("keeps full resolution on a 4g bucket with a low downlink estimate", () => {
		setConnection({ effectiveType: "4g", downlink: 1.35, rtt: 100 });
		expect(shouldReduceBackgroundResolution()).toBe(false);
	});

	it("keeps full resolution on a 4g bucket with high measured latency", () => {
		setConnection({ effectiveType: "4g", downlink: 10, rtt: 350 });
		expect(shouldReduceBackgroundResolution()).toBe(false);
	});

	it("reduces resolution when the user enabled data-saver", () => {
		setConnection({ effectiveType: "4g", downlink: 10, rtt: 50, saveData: true });
		expect(shouldReduceBackgroundResolution()).toBe(true);
	});

	it.each(["slow-2g", "2g", "3g"])(
		"reduces resolution on a genuinely slow %s radio bucket",
		(effectiveType) => {
			setConnection({ effectiveType, downlink: 10, rtt: 50 });
			expect(shouldReduceBackgroundResolution()).toBe(true);
		}
	);
});
