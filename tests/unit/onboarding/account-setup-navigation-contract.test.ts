import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "#lib/shared/navigation/config/tab-definitions.js";
import {
  normalizeSectionId,
  sectionScreenAlias,
} from "#lib/shared/navigation/config/module-definitions.js";
import {
  ACCOUNT_SETUP_SETTINGS_DESTINATIONS,
  type AccountSetupTaskId,
} from "#lib/shared/onboarding/state/account-setup-state.svelte.js";

describe("account setup navigation contract", () => {
  it("routes every setup task to a registered Settings tab or its alias", () => {
    const registeredTabs = new Set(SETTINGS_TABS.map((tab) => tab.id));
    const taskIds = Object.keys(
      ACCOUNT_SETUP_SETTINGS_DESTINATIONS
    ) as AccountSetupTaskId[];

    expect(taskIds).toEqual([
      "display-name",
      "profile-photo",
      "props",
      "theme",
    ]);
    expect(
      taskIds.every((taskId) =>
        registeredTabs.has(
          normalizeSectionId(
            "settings",
            ACCOUNT_SETUP_SETTINGS_DESTINATIONS[taskId]
          ) ?? ""
        )
      )
    ).toBe(true);
    // Theme lives in Display now; its old address opens the Theme screen.
    expect(ACCOUNT_SETUP_SETTINGS_DESTINATIONS.theme).toBe("theme");
    expect(normalizeSectionId("settings", "theme")).toBe("display");
    expect(sectionScreenAlias("settings", "theme")).toBe("theme");
  });
});
