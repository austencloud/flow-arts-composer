import { afterEach, describe, expect, it } from "vitest";
import {
  noticeShownInDualWheel,
  noticeWallRefused,
  wallPlaneBlockedHint,
} from "#lib/shared/3d/state/wall-plane-notice.js";
import { clearToasts, toastQueue } from "#lib/shared/toast/state/toast-state.svelte.js";

// The viewer names the word the way its card does: AAAA is "A" everywhere else
// in the app, so a notice that says "AAAA" reads like a different sequence.
describe("wall plane notices", () => {
  afterEach(() => clearToasts());

  it("names the word as the app shows it", () => {
    expect(wallPlaneBlockedHint("AAAA")).toBe(
      "A can't use wall on both hands. The arms would pass through each other."
    );
    noticeShownInDualWheel("AAAA");
    noticeWallRefused("AAAA");
    expect(toastQueue.map((toast) => [toast.message, toast.detail])).toEqual([
      ["Shown in dual wheel", "A can't be done in wall plane. The arms would pass through each other."],
      ["Can't do A in wall plane", "The arms would pass through each other."],
    ]);
  });

  it("shows one notice when several performers hit the same block", () => {
    noticeShownInDualWheel("AAAA");
    noticeShownInDualWheel("AAAA");
    expect(toastQueue).toHaveLength(1);
  });
});
