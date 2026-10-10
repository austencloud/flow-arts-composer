import { describe, expect, it } from "vitest";
import { FEATURES } from "../../src/config/feature-flags";
import { PRODUCTION_MODULES } from "#lib/shared/environment/environment-features.js";
import { MODULE_DEFINITIONS } from "#lib/shared/navigation/config/module-definitions.js";
import {
  BROWSE_TABS,
  SOCIAL_TABS,
} from "#lib/shared/navigation/config/tab-definitions.js";

describe("Creators module registration", () => {
  it("keeps Creators as a top-level tabless destination", () => {
    const creators = MODULE_DEFINITIONS.find((module) => module.id === "creators");

    expect(creators).toMatchObject({
      label: "Creators",
      isMain: true,
      sections: [],
    });
    expect(BROWSE_TABS.some((tab) => tab.id === "creators")).toBe(false);
    expect(SOCIAL_TABS.some((tab) => tab.id === "creators")).toBe(false);
  });

  it("keeps the Creators component tree in production builds", () => {
    expect(PRODUCTION_MODULES.creators).toBe(true);
    expect(FEATURES.find((feature) => feature.id === "creators")).toMatchObject({
      tier: "core",
      modulePaths: ["features/creators/"],
    });
  });
});
