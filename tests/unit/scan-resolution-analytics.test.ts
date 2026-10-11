import { describe, expect, it } from "vitest";
import { scanResolutionFailureCategory } from "#lib/shared/analytics/scan-resolution-analytics.js";

describe("scan resolution failure categories", () => {
  it("keeps failure telemetry compact and actionable", () => {
    expect(
      scanResolutionFailureCategory({ hasShortCode: false, online: true })
    ).toBe("missing_code");
    expect(
      scanResolutionFailureCategory({ hasShortCode: true, online: false })
    ).toBe("offline");
    expect(
      scanResolutionFailureCategory({
        hasShortCode: true,
        online: true,
        sequenceMissing: true,
      })
    ).toBe("not_found");
    expect(
      scanResolutionFailureCategory({ hasShortCode: true, online: true })
    ).toBe("load_error");
  });
});
