// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  motionDuration,
  reducedMotion,
} from "#lib/shared/transitions/motion.js";

describe("explicit reduced-motion preference", () => {
  afterEach(() => {
    delete document.documentElement.dataset.motionPreference;
  });

  it("collapses canonical motion when the root requests reduction", () => {
    document.documentElement.dataset.motionPreference = "reduce";

    expect(reducedMotion()).toBe(true);
    expect(motionDuration(280)).toBe(0);
  });
});
