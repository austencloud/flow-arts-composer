import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capacitor/core", () => ({
	Capacitor: {
		isNativePlatform: vi.fn(() => false),
		getPlatform: vi.fn(() => "web"),
	},
}));

vi.mock("$app/env", () => ({
	browser: false,
}));

import { isNative, isWeb, isIOS, isAndroid, getPlatform } from "#lib/shared/platform/services/platform-detector.js";
import { Capacitor } from "@capacitor/core";

describe("PlatformDetector", () => {
	beforeEach(() => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
		vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
	});

	it("reports web platform when not in native shell", () => {
		expect(isNative()).toBe(false);
		expect(isWeb()).toBe(true);
		expect(isIOS()).toBe(false);
		expect(isAndroid()).toBe(false);
		expect(getPlatform()).toBe("web");
	});

	it("reports iOS when running in iOS native shell", () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");

		expect(isNative()).toBe(true);
		expect(isIOS()).toBe(true);
		expect(isAndroid()).toBe(false);
		expect(isWeb()).toBe(false);
		expect(getPlatform()).toBe("ios");
	});

	it("reports Android when running in Android native shell", () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(Capacitor.getPlatform).mockReturnValue("android");

		expect(isNative()).toBe(true);
		expect(isAndroid()).toBe(true);
		expect(isIOS()).toBe(false);
		expect(getPlatform()).toBe("android");
	});
});
