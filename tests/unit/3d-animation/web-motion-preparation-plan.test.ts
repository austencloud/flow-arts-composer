import { describe, expect, it } from "vitest";
import {
  isCurrentMotionCaptureJob,
  planWebMotionPreparation,
} from "../../../src/lib/shared/3d/components/web-motion-preparation-plan";

const request = (signature: string) => ({ signature, sequence: {} });

describe("Web motion preparation", () => {
  it("captures duplicate performers once, then advances to the next missing motion", () => {
    const requests = [request("same"), request("same"), request("different")];
    expect(planWebMotionPreparation(requests, () => false)).toMatchObject({
      unique: [requests[0], requests[2]],
      completedCount: 0,
      next: requests[0],
      overflow: false,
    });
    expect(
      planWebMotionPreparation(requests, (signature) => signature === "same")
    ).toMatchObject({ completedCount: 1, next: requests[2] });
  });

  it("does not accept a completion from an invalidated capture or retry", () => {
    const old = { signature: "same", generation: 1, requestKeys: "same" };
    expect(isCurrentMotionCaptureJob(old, old)).toBe(true);
    expect(isCurrentMotionCaptureJob(old, { ...old, generation: 2 })).toBe(
      false
    );
    expect(
      isCurrentMotionCaptureJob(old, { ...old, requestKeys: "same\u0000other" })
    ).toBe(false);
    expect(isCurrentMotionCaptureJob(old, { ...old, signature: "other" })).toBe(
      false
    );
  });

  it("stops before evicting active clips when the cast exceeds the eight-clip cache", () => {
    const eight = Array.from({ length: 8 }, (_, index) =>
      request(String(index))
    );
    expect(planWebMotionPreparation(eight, () => false).overflow).toBe(false);
    expect(
      planWebMotionPreparation([...eight, request("8")], () => false)
    ).toMatchObject({ overflow: true, next: undefined });
  });
});
