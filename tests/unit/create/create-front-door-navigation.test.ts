// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logModuleView: vi.fn(async () => {}),
}));
vi.mock("#lib/shared/hmr-helper.js", () => ({
  hasMimeErrorOccurred: () => false,
  verifyTabSwitch: vi.fn(),
}));

async function createStateAt(pathname: string) {
  history.replaceState({}, "", pathname);
  vi.resetModules();
  const { createNavigationState } =
    await import("#lib/shared/navigation/state/navigation-state.svelte.js");
  return createNavigationState();
}

describe("Create front-door navigation intent", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("treats bare Create as a chooser without inventing a tab", async () => {
    const state = await createStateAt("/create");

    expect(state.currentModule).toBe("create");
    expect(state.activeTab).toBe("construct");
    expect(state.isCreateFrontDoorOpen).toBe(true);
    expect(state.createFrontDoorSource).toBe("direct");
    expect(state.hasRememberedCreateMode).toBe(false);
  });

  it("lets an explicit method route bypass the chooser", async () => {
    const state = await createStateAt("/create/fuse");

    expect(state.activeTab).toBe("fuse");
    expect(state.isCreateFrontDoorOpen).toBe(false);
    expect(state.hasRememberedCreateMode).toBe(true);
  });

  it("keeps the backing method while returning to all methods", async () => {
    const state = await createStateAt("/create/generate");

    state.openCreateFrontDoor("workspace");

    expect(state.activeTab).toBe("generate");
    expect(state.currentCreateMode).toBe("generate");
    expect(state.isCreateFrontDoorOpen).toBe(true);
    expect(state.createFrontDoorSource).toBe("workspace");

    state.setActiveTab("generate");
    expect(state.isCreateFrontDoorOpen).toBe(false);
  });

  it("distinguishes generic module navigation from an explicit target", async () => {
    const state = await createStateAt("/browse/explore");

    state.setCurrentModule("create");
    expect(state.isCreateFrontDoorOpen).toBe(true);
    expect(state.createFrontDoorSource).toBe("navigation");

    state.setCurrentModule("create", "tunnel");
    expect(state.activeTab).toBe("tunnel");
    expect(state.isCreateFrontDoorOpen).toBe(false);
  });

  it("preserves a remembered backing method on bare Create", async () => {
    localStorage.setItem("tka-current-create-mode", "tunnel");
    const state = await createStateAt("/create");

    expect(state.activeTab).toBe("tunnel");
    expect(state.currentCreateMode).toBe("tunnel");
    expect(state.hasRememberedCreateMode).toBe(true);
    expect(state.isCreateFrontDoorOpen).toBe(true);
  });
});
