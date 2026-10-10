import { describe, it, expect } from "vitest";
import {
  resolveSkeleton,
  SHARED_SHELL,
} from "#lib/shared/modules/skeletons/index.js";
import SharedShellSkeleton from "#lib/shared/modules/skeletons/SharedShellSkeleton.svelte";

describe("resolveSkeleton", () => {
  it("uses the neutral loader for create (no verified bespoke skeleton)", () => {
    expect(resolveSkeleton("create")).toBe(SharedShellSkeleton);
  });
  it("uses the neutral loader for browse (no verified bespoke skeleton)", () => {
    expect(resolveSkeleton("browse")).toBe(SharedShellSkeleton);
  });
  it("falls back to the shared shell for an unknown module", () => {
    expect(resolveSkeleton("settings")).toBe(SharedShellSkeleton);
  });
  it("falls back to the shared shell for null", () => {
    expect(resolveSkeleton(null)).toBe(SharedShellSkeleton);
  });
  it("SHARED_SHELL is the shared shell component", () => {
    expect(SHARED_SHELL).toBe(SharedShellSkeleton);
  });
});
