import { describe, it, expect, vi, beforeEach } from "vitest";
import { isInAppWebview } from "#lib/shared/sequence-viewer/services/webview-detector.js";

function setUa(ua: string | undefined) {
	Object.defineProperty(globalThis, "navigator", {
		value: ua === undefined ? undefined : { userAgent: ua },
		writable: true,
		configurable: true,
	});
}

describe("WebviewDetector", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it.each([
		[
			"Instagram iOS",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0.0 (iPhone14,3; iOS 17_0)",
		],
		[
			"Instagram Android",
			"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Instagram 300.0.0.0.0 Android",
		],
		[
			"Facebook (FBAN)",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0]",
		],
		[
			"Facebook (FB_IAB)",
			"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/450.0]",
		],
		[
			"TikTok",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 musical_ly_30.0.0",
		],
		[
			"Twitter",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Twitter for iPhone",
		],
		["LinkedIn", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 LinkedInApp"],
		[
			"Pinterest",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Pinterest/iOS",
		],
		["Snapchat", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Snapchat/12.0.0"],
	])("detects %s as in-app webview", (_label, ua) => {
		setUa(ua);
		expect(isInAppWebview()).toBe(true);
	});

	it.each([
		[
			"Desktop Chrome",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
		],
		[
			"Mobile Safari",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
		],
		[
			"Firefox",
			"Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
		],
		[
			"Edge",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Edg/120.0",
		],
		[
			"Android Chrome",
			"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0",
		],
	])("does NOT flag %s as in-app webview", (_label, ua) => {
		setUa(ua);
		expect(isInAppWebview()).toBe(false);
	});

	it("returns false when navigator is undefined (SSR)", () => {
		setUa(undefined);
		expect(isInAppWebview()).toBe(false);
	});
});
