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

	it("unescapes a double-encoded inline payload", () => {
		// base45 (RFC 9285) emits space, `%`, `+` and `/`, so a payload that was
		// encoded a second time upstream arrives with its `q1:` envelope escaped.
		// Restoring it is unambiguous: the delimiter the decoder needs is missing.
		const payload = "s~q1:A 9396V$GYO1%4AOAOC/B8.T70";
		const link = `https://tka.run/${encodeURIComponent(payload)}`;

		expect(new URL(link).pathname).toContain("q1%3A");
		expect(extractScanCode(link)).toBe(payload);
	});

	it("keeps genuine base45 percents behind an intact envelope", () => {
		// `%4A` here is the payload's own, not an escape for `J`. The readable
		// `q1:` envelope is the tell, and it is what stops the decode. (A literal
		// space cannot appear in this case: `new URL` would escape it, and that
		// spelling stays ambiguous by design — see extract-scan-code.ts.)
		const payload = "s~q1:AB%4ACD";

		expect(extractScanCode(`https://tka.run/${payload}`)).toBe(payload);
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
