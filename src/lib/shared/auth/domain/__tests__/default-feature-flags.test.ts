import { describe, it, expect } from "vitest";
import {
  DEFAULT_FEATURE_FLAGS,
  getDefaultFeatureConfig,
} from "../default-feature-flags";

describe("onboarding first-session-activation flag", () => {
  it("is registered and defaulted off", () => {
    const config = getDefaultFeatureConfig(
      "capability:onboarding:first-session-activation"
    );
    expect(config).not.toBeNull();
    expect(config?.enabled).toBe(false);
    expect(config?.minimumRole).toBe("user");
  });

  it("appears exactly once in DEFAULT_FEATURE_FLAGS", () => {
    const matches = DEFAULT_FEATURE_FLAGS.filter(
      (f) => f.id === "capability:onboarding:first-session-activation"
    );
    expect(matches.length).toBe(1);
  });
});

describe("post-studio early-access flag", () => {
  it("is registered, defaulted off, with a user-level role so per-user grants work", () => {
    const config = getDefaultFeatureConfig("capability:viewer:post-studio");
    expect(config).not.toBeNull();
    expect(config?.enabled).toBe(false);
    // The per-user enabledFeatures override bypasses `enabled` but never the
    // role check — minimumRole "user" is what makes the grant reachable.
    expect(config?.minimumRole).toBe("user");
  });

  it("appears exactly once in DEFAULT_FEATURE_FLAGS", () => {
    const matches = DEFAULT_FEATURE_FLAGS.filter(
      (f) => f.id === "capability:viewer:post-studio"
    );
    expect(matches.length).toBe(1);
  });
});

describe("Create tab access", () => {
  it("releases Fuse to user accounts while Assemble stays admin-only", () => {
    const fuse = getDefaultFeatureConfig("tab:create:fuse");
    const assemble = getDefaultFeatureConfig("tab:create:assemble");

    expect(fuse?.enabled).toBe(true);
    expect(fuse?.minimumRole).toBe("user");
    expect(assemble?.minimumRole).toBe("admin");
  });
});

describe("Choreo (acts) module default role", () => {
  it("opens to testers without a runtime override", () => {
    // The Permission Matrix only renders role cells for tabs and
    // capabilities. Choreo has no tabs, so its module-level minimum role
    // can't be lowered from the admin UI, and checkFeatureAccess() runs the
    // role check on every path. A tester default in code is the only lever.
    const choreo = getDefaultFeatureConfig("module:choreo");

    expect(choreo).not.toBeNull();
    expect(choreo?.enabled).toBe(true);
    expect(choreo?.minimumRole).toBe("tester");
  });
});
