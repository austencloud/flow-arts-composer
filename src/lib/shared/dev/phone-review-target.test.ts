import { describe, expect, it } from "vitest";
import {
  applyPhoneReviewTarget,
  followPhoneReviewTarget,
  parsePhoneReviewTarget,
  pausePhoneReview,
} from "./phone-review-target";

const target = {
  path: "/compose?tab=arrange",
  revision: 2,
  updatedAt: "2026-09-13T12:00:00.000Z",
};

describe("phone review target", () => {
  it("accepts same-origin application paths and rejects recursive or external targets", () => {
    expect(parsePhoneReviewTarget(target)).toEqual(target);
    expect(
      parsePhoneReviewTarget({ ...target, path: "https://example.com" })
    ).toBeNull();
    expect(
      parsePhoneReviewTarget({ ...target, path: "//example.com" })
    ).toBeNull();
    expect(parsePhoneReviewTarget({ ...target, path: "/review" })).toBeNull();
    expect(
      parsePhoneReviewTarget({ ...target, path: "/review/child" })
    ).toBeNull();
    expect(
      parsePhoneReviewTarget({ ...target, path: "/review%2Fchild" })
    ).toBeNull();
    expect(parsePhoneReviewTarget({ ...target, revision: -1 })).toBeNull();
  });

  it("holds the displayed preview while paused and catches up when following resumes", () => {
    const paused = pausePhoneReview(followPhoneReviewTarget(target));
    const latest = { ...target, path: "/browse", revision: 3 };

    expect(applyPhoneReviewTarget(paused, latest)).toEqual(paused);
    expect(followPhoneReviewTarget(latest)).toEqual({
      following: true,
      displayedPath: "/browse",
      displayedRevision: 3,
    });
  });
});
