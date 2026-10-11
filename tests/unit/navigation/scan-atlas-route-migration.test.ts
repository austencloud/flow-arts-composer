import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHOREO_CARD_SCAN_ATLAS_TAB_ID,
  CHOREO_CARD_TABS,
} from "#lib/shared/navigation/config/tab-definitions.js";
import { normalizeSectionId } from "#lib/shared/navigation/config/module-definitions.js";
import { MODULE_LAST_TABS_KEY } from "#lib/shared/navigation/config/storage-keys.js";
import { createNavigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

vi.mock("$app/navigation", () => ({
  goto: (
    destination: string | URL,
    options: { replace?: boolean; state?: App.PageState } = {}
  ) => {
    const write = options.replace ? history.replaceState : history.pushState;
    write.call(history, options.state ?? {}, "", destination);
  },
}));

const MESSAGE_LOCALES = ["de", "en", "es", "fr", "it", "ja", "pt", "ru"];

describe("Scan Atlas route migration", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState({}, "", "/create/construct");
  });

  it("makes Scan Atlas the canonical Choreo Card destination", () => {
    expect(CHOREO_CARD_TABS[0]).toMatchObject({
      id: CHOREO_CARD_SCAN_ATLAS_TAB_ID,
      label: "Scan Atlas",
    });
    expect(
      normalizeSectionId("choreo_card", CHOREO_CARD_SCAN_ATLAS_TAB_ID)
    ).toBe(CHOREO_CARD_SCAN_ATLAS_TAB_ID);
  });

  it("preserves legacy bookmarks without falling through to a remembered tab", () => {
    localStorage.setItem(
      MODULE_LAST_TABS_KEY,
      JSON.stringify({ choreo_card: "releaser" })
    );
    history.replaceState({}, "", "/choreo_card/scan-activity?source=bookmark");

    const state = createNavigationState();

    expect(state.currentModule).toBe("choreo_card");
    expect(state.activeTab).toBe(CHOREO_CARD_SCAN_ATLAS_TAB_ID);
  });

  it("upgrades the persisted legacy tab before restoring it", () => {
    localStorage.setItem(
      MODULE_LAST_TABS_KEY,
      JSON.stringify({ choreo_card: "scan-activity" })
    );
    history.replaceState({}, "", "/choreo_card");

    const state = createNavigationState();
    const persisted = JSON.parse(
      localStorage.getItem(MODULE_LAST_TABS_KEY) ?? "{}"
    ) as Record<string, string>;

    expect(state.activeTab).toBe(CHOREO_CARD_SCAN_ATLAS_TAB_ID);
    expect(persisted.choreo_card).toBe(CHOREO_CARD_SCAN_ATLAS_TAB_ID);
  });

  it("rewrites the legacy browser URL without dropping its query", async () => {
    history.replaceState({}, "", "/choreo_card/scan-activity?source=bookmark");

    const { initializeNavigationHistory } =
      await import("#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js");
    initializeNavigationHistory();

    expect(location.pathname).toBe("/choreo_card/scan-atlas");
    expect(location.search).toBe("?source=bookmark");
    expect(history.state).toMatchObject({
      moduleId: "choreo_card",
      sectionId: CHOREO_CARD_SCAN_ATLAS_TAB_ID,
    });

    history.pushState(
      { moduleId: "choreo_card", sectionId: "scan-activity" },
      "",
      "/choreo_card/scan-activity?source=history"
    );
    dispatchEvent(
      new PopStateEvent("popstate", {
        state: history.state,
      })
    );

    await vi.waitFor(() => {
      expect(location.pathname).toBe("/choreo_card/scan-atlas");
      expect(location.search).toBe("?source=history");
      expect(history.state).toMatchObject({
        moduleId: "choreo_card",
        sectionId: CHOREO_CARD_SCAN_ATLAS_TAB_ID,
      });
    });
  }, 30_000);

  it("sends QR-scan notifications through the canonical tab owner", () => {
    const notificationItem = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/shared/inbox/components/notifications/InboxNotificationItem.svelte"
      ),
      "utf8"
    );

    expect(notificationItem).toContain("CHOREO_CARD_SCAN_ATLAS_TAB_ID");
    expect(notificationItem).not.toContain(
      'handleModuleChange("choreo_card", "scan-activity")'
    );
  });

  it("uses the product name in every shipped locale", () => {
    for (const locale of MESSAGE_LOCALES) {
      const messages = JSON.parse(
        readFileSync(resolve(process.cwd(), `messages/${locale}.json`), "utf8")
      ) as Record<string, string>;
      expect(messages.tab_choreo_card_scan_activity, locale).toBe("Scan Atlas");
    }
  });
});
