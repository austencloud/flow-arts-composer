import { describe, expect, it } from "vitest";
import {
  PRODUCTION_MODULES,
  resolveProductionEnvironment,
} from "#lib/shared/environment/environment-features.js";
import { MODULE_DEFINITIONS } from "#lib/shared/navigation/config/module-definitions.js";

describe("production environment detection", () => {
  it("recognizes a production build without an optional deployment label", () => {
    expect(resolveProductionEnvironment(true, true, undefined)).toBe(true);
  });

  it("keeps server rendering and development browsers out of production mode", () => {
    expect(resolveProductionEnvironment(false, true, "production")).toBe(false);
    expect(resolveProductionEnvironment(true, false, "development")).toBe(
      false
    );
  });

  it("still accepts the explicit deployment label", () => {
    expect(resolveProductionEnvironment(true, false, "production")).toBe(true);
  });

  it("ships role-gated operator tools in production", () => {
    expect(PRODUCTION_MODULES.admin).toBe(true);
    expect(PRODUCTION_MODULES.choreo_card).toBe(true);
    expect(
      MODULE_DEFINITIONS.find((module) => module.id === "admin")?.adminOnly
    ).toBe(true);
    expect(
      MODULE_DEFINITIONS.find((module) => module.id === "choreo_card")
        ?.adminOnly
    ).toBe(true);
  });
});
