import { describe, it, expect } from "vitest";
import { PRODUCTION_MODULES } from "../environment-features";

describe("PRODUCTION_MODULES", () => {
  it("keeps the Choreo (acts) module visible on production", () => {
    // isModuleEnabledInEnvironment() runs before every role, PostHog, and
    // admin-UI override, so a `false` here hides the module from every
    // account on tkaflowarts.com, admins included, with no runtime way back.
    // It sat at `write: false` from Jan 2026 until Sep 2026 unnoticed.
    expect(PRODUCTION_MODULES.choreo).toBe(true);
  });
});
