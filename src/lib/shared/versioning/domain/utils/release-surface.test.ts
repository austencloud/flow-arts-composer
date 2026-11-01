import { describe, it, expect } from "vitest";
import { resolveShowMeTarget, type ShowMeRegistry } from "./release-surface";
import type { ModuleId } from "#lib/shared/navigation/domain/types.js";

// A stand-in registry: two live modules, one link-out, one dark; Create mixes
// guest and account tabs the way the real one does.
const registry: ShowMeRegistry = {
  isModuleOpen(moduleId): moduleId is ModuleId {
    return moduleId === "create" || moduleId === "settings";
  },
  isTabRegistered(moduleId, tabId) {
    const tabs: Record<string, string[]> = {
      create: ["construct", "generate", "fuse"],
      settings: ["preferences", "release-notes"],
    };
    return tabs[moduleId]?.includes(tabId) ?? false;
  },
  canReach(moduleId, tabId, tier) {
    if (tier !== "guest") return true;
    const guestTabs: Record<string, string[]> = {
      create: ["construct", "generate"],
      settings: ["preferences", "release-notes"],
    };
    const allowed = guestTabs[moduleId];
    if (!allowed) return false;
    return tabId === undefined || allowed.includes(tabId);
  },
};

describe("resolveShowMeTarget", () => {
  it("navigates to a live, registered, reachable tab", () => {
    expect(
      resolveShowMeTarget(
        { module: "create", tab: "construct" },
        "guest",
        registry
      )
    ).toEqual({ moduleId: "create", tabId: "construct" });
  });

  it("renders nothing for global, absent or malformed surfaces", () => {
    expect(resolveShowMeTarget("global", "user", registry)).toBeNull();
    expect(resolveShowMeTarget(undefined, "user", registry)).toBeNull();
    expect(
      resolveShowMeTarget({ tab: "construct" } as never, "user", registry)
    ).toBeNull();
  });

  it("rots silently when the module or tab is gone", () => {
    expect(
      resolveShowMeTarget({ module: "mandala", tab: "draw" }, "user", registry)
    ).toBeNull();
    expect(
      resolveShowMeTarget(
        { module: "create", tab: "assemble" },
        "user",
        registry
      )
    ).toBeNull();
  });

  it("hides an account-only destination from a guest, shows it to a user", () => {
    const fuse = { module: "create", tab: "fuse" };
    expect(resolveShowMeTarget(fuse, "guest", registry)).toBeNull();
    expect(resolveShowMeTarget(fuse, "user", registry)).toEqual({
      moduleId: "create",
      tabId: "fuse",
    });
    expect(resolveShowMeTarget(fuse, "premium", registry)).toEqual({
      moduleId: "create",
      tabId: "fuse",
    });
  });

  it("accepts a tab-less surface and drops an empty tab string", () => {
    expect(
      resolveShowMeTarget({ module: "settings" }, "guest", registry)
    ).toEqual({
      moduleId: "settings",
    });
    expect(
      resolveShowMeTarget({ module: "settings", tab: "" }, "guest", registry)
    ).toEqual({ moduleId: "settings" });
  });
});
