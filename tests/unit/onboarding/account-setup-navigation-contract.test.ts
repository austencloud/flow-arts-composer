import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "#lib/shared/navigation/config/tab-definitions.js";
import {
  ACCOUNT_SETUP_SETTINGS_DESTINATIONS,
  type AccountSetupTaskId,
} from "#lib/shared/onboarding/state/account-setup-state.svelte.js";

describe("account setup navigation contract", () => {
  it("routes every setup task to a registered Settings tab", () => {
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
        registeredTabs.has(ACCOUNT_SETUP_SETTINGS_DESTINATIONS[taskId])
      )
    ).toBe(true);
    expect(ACCOUNT_SETUP_SETTINGS_DESTINATIONS.theme).toBe("theme");
  });
});
