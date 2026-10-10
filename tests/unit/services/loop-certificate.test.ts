import { describe, expect, it } from "vitest";
import { withLoopCertificateCleared } from "#lib/shared/create/services/loop-certificate.js";

describe("withLoopCertificateCleared", () => {
  it("strips loopSpec on a mutated sequence", () => {
    const seq: any = { id: "x", steps: [], loopSpec: { blue: { rotated: { period: 2 } } }, loopType: "rotated" };
    const out = withLoopCertificateCleared(seq);
    expect(out.loopSpec).toBeUndefined();
    expect(out.loopType).toBe("rotated"); // legacy display string survives; only the certificate dies
    expect(out).not.toBe(seq);
  });

  it("is a no-op passthrough when no certificate present", () => {
    const seq: any = { id: "x", steps: [] };
    expect(withLoopCertificateCleared(seq)).toBe(seq);
  });
});
