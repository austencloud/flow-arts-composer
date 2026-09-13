import { describe, it, expect } from "vitest";
import { extractScanCode } from "../extract-scan-code";

describe("extractScanCode", () => {
	it("extracts the code from the canonical card URL", () => {
		expect(extractScanCode("HTTPS://TKA.RUN/AB3D")).toBe("AB3D");
	});

	it("tolerates lowercase and prop/view params", () => {
		expect(extractScanCode("https://tka.run/ab3d?bp=S&rp=F&vm=hsb")).toBe("AB3D");
	});

	it("tolerates the /q/ spotlight route form", () => {
		expect(extractScanCode("https://tka.run/q/AB3D")).toBe("AB3D");
	});

	it("accepts 5- and 6-char bumped codes", () => {
		expect(extractScanCode("https://tka.run/AB3DE")).toBe("AB3DE");
		expect(extractScanCode("https://tka.run/AB3DEF")).toBe("AB3DEF");
	});

	it("passes inline s~ payloads through unchanged (no uppercasing)", () => {
		expect(extractScanCode("s~r1:abcXYZ")).toBe("s~r1:abcXYZ");
		expect(extractScanCode("https://tka.run/s~r1:abcXYZ")).toBe("s~r1:abcXYZ");
	});

	it("unescapes a percent-encoded inline payload from a normalized link", () => {
		// base45 (RFC 9285) emits space, `%`, `+` and `/`. Any link that has been
		// through a URL normalizer arrives escaped, and the escapes are not part
		// of the payload the QR decoder has to read.
		const payload = "s~q1:A 9396V$GYO1%4AOAOC/B8.T70";
		const link = `https://tka.run/${encodeURIComponent(payload)}`;

		expect(new URL(link).pathname).toContain("%20");
		expect(extractScanCode(link)).toBe(payload);
	});

	it("keeps a malformed escape rather than throwing", () => {
		expect(extractScanCode("https://tka.run/s~q1:A%*J")).toBe("s~q1:A%*J");
	});

	it("accepts a bare code", () => {
		expect(extractScanCode("ab3d")).toBe("AB3D");
	});

	it("rejects foreign hosts", () => {
		expect(extractScanCode("https://evil.com/AB3D")).toBeNull();
	});

	it("rejects non-code content", () => {
		expect(extractScanCode("hello world")).toBeNull();
		expect(extractScanCode("")).toBeNull();
		expect(extractScanCode("https://tka.run/")).toBeNull();
		expect(extractScanCode("ABC")).toBeNull(); // 3 chars — below minimum
		expect(extractScanCode("ABCDEFG")).toBeNull(); // 7 chars — above maximum
	});
});
