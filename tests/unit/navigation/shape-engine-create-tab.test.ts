// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";

const MESSAGE_LOCALES = ["de", "en", "es", "fr", "it", "ja", "pt", "ru"];

vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logModuleView: vi.fn(async () => {}),
}));
vi.mock("$lib/shared/hmr-helper", () => ({
  hasMimeErrorOccurred: () => false,
  verifyTabSwitch: vi.fn(),
}));

async function createStateAt(pathname: string) {
  history.replaceState({}, "", pathname);
  vi.resetModules();
  const { createNavigationState } =
    await import("$lib/shared/navigation/state/navigation-state.svelte");
  return createNavigationState();
}

describe("Shape Engine as a Create tab", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("registers Shape as a creation method right after Generate", () => {
    const ids = CREATE_TABS.map((tab) => tab.id);
    expect(ids.indexOf("shape-engine")).toBe(ids.indexOf("generate") + 1);
    expect(CREATE_TABS.find((tab) => tab.id === "shape-engine")).toMatchObject({
      label: "Shape",
      labelKey: "tab_create_shape_engine",
      descKey: "tab_desc_create_shape_engine",
      metadata: { isCreationMethod: true },
    });
  });

  it("lets /create/shape-engine open the tab directly", async () => {
    const state = await createStateAt("/create/shape-engine");

    expect(state.currentModule).toBe("create");
    expect(state.activeTab).toBe("shape-engine");
    expect(state.isCreateFrontDoorOpen).toBe(false);
  });

  it("ships the tab strings in every locale that has the Fuse strings", () => {
    for (const locale of MESSAGE_LOCALES) {
      const messages = JSON.parse(
        readFileSync(resolve(process.cwd(), `messages/${locale}.json`), "utf8")
      ) as Record<string, string>;
      expect(messages.tab_create_shape_engine, locale).toBeTruthy();
      expect(messages.tab_desc_create_shape_engine, locale).toBeTruthy();
    }
  });
});
