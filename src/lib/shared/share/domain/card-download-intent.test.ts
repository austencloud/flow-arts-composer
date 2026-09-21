import { describe, expect, it } from "vitest";
import { pendingCardDownloadOutcome } from "./card-download-intent";

describe("pendingCardDownloadOutcome", () => {
  const current = {
    pendingRevision: "card-a",
    sheetOpen: true,
    artifact: "card" as const,
    currentRevision: "card-a",
    hasBlob: false,
    hasError: false,
  };

  it("delivers exactly the requested card when its PNG arrives", () => {
    expect(pendingCardDownloadOutcome(current)).toBe("waiting");
    expect(pendingCardDownloadOutcome({ ...current, hasBlob: true })).toBe(
      "deliver"
    );
  });

  it("cancels when the sheet, artifact, or snapshot changes", () => {
    expect(pendingCardDownloadOutcome({ ...current, sheetOpen: false })).toBe(
      "cancel"
    );
    expect(pendingCardDownloadOutcome({ ...current, artifact: "video" })).toBe(
      "cancel"
    );
    expect(
      pendingCardDownloadOutcome({ ...current, currentRevision: "card-b" })
    ).toBe("cancel");
  });

  it("stops a failed request so a retry can establish a new intent", () => {
    expect(pendingCardDownloadOutcome({ ...current, hasError: true })).toBe(
      "failed"
    );
  });
});
