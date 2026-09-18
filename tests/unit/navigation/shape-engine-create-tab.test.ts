// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_TABS,
  TOYS_TABS,
} from "$lib/shared/navigation/config/tab-definitions";
import { normalizeNavigationTarget } from "$lib/shared/navigation/config/module-definitions";

function readMessages(locale: string): Record<string, string> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `messages/${locale}.json`), "utf8")
  ) as Record<string, string>;
}

/** The locales that carry the Fuse tab strings define where Shape ships. */
const LOCALES_WITH_FUSE = readdirSync(resolve(process.cwd(), "messages"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .filter((locale) => Boolean(readMessages(locale).tab_create_fuse));

vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logModuleView: vi.fn(async () => {}),
}));
vi.mock("$lib/shared/hmr-helper", () => ({
  hasMimeErrorOccurred: () => false,
  verifyTabSwitch: vi.fn(),
}));
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));
vi.mock("$app/navigation", () => ({
  pushState: (destination: string | URL, state: App.PageState) => {
    history.pushState(state, "", destination);
  },
  replaceState: (destination: string | URL, state: App.PageState) => {
    history.replaceState(state, "", destination);
  },
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
    expect(LOCALES_WITH_FUSE.length).toBeGreaterThanOrEqual(8);
    for (const locale of LOCALES_WITH_FUSE) {
      const messages = readMessages(locale);
      expect(messages.tab_create_shape_engine, locale).toBeTruthy();
      expect(messages.tab_desc_create_shape_engine, locale).toBeTruthy();
    }
  });

  it("no longer lists Shape Matrix under Toys", () => {
    expect(TOYS_TABS.map((tab) => tab.id)).not.toContain("shape-matrix");
    const en = readMessages("en");
    expect(en.tab_toys_shape_matrix).toBeUndefined();
    expect(en.tab_desc_toys_shape_matrix).toBeUndefined();
  });

  it("sends the old /toys/shape-matrix link to the Shape tab", async () => {
    const state = await createStateAt("/toys/shape-matrix");

    expect(state.currentModule).toBe("create");
    expect(state.activeTab).toBe("shape-engine");
    expect(state.isCreateFrontDoorOpen).toBe(false);
  });

  it("leaves other Toys links alone", async () => {
    const state = await createStateAt("/toys/hand-tunnel");

    expect(state.currentModule).toBe("toys");
    expect(state.activeTab).toBe("hand-tunnel");
  });

  it("resolves the moved section for every URL parser", () => {
    expect(normalizeNavigationTarget("toys", "shape-matrix")).toEqual({
      moduleId: "create",
      sectionId: "shape-engine",
    });
    expect(normalizeNavigationTarget("toys", "hand-tunnel")).toEqual({
      moduleId: "toys",
      sectionId: "hand-tunnel",
    });
    expect(normalizeNavigationTarget("toys", undefined)).toEqual({
      moduleId: "toys",
      sectionId: undefined,
    });
  });

  it("rewrites the legacy browser URL at boot without dropping its query", async () => {
    history.replaceState({}, "", "/toys/shape-matrix?source=bookmark");
    vi.resetModules();

    const { initializeNavigationHistory } =
      await import("$lib/shared/navigation-coordinator/navigation-coordinator.svelte");
    initializeNavigationHistory();

    expect(location.pathname).toBe("/create/shape-engine");
    expect(location.search).toBe("?source=bookmark");
    expect(history.state).toMatchObject({
      moduleId: "create",
      sectionId: "shape-engine",
    });
  }, 30_000);
});
