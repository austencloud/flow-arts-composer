import { describe, expect, it } from "vitest";

import {
  diffDeployment,
  parseFunctionExportNames,
  readExportedFunctionNames,
} from "../../../scripts/diagnostics/functions-deploy-drift";

// A parser that silently drops an export reports "everything deployed" while
// a trigger sits in the repo. These pin it to the real entry point.
describe("functions deploy drift", () => {
  it("reads both export shapes from the real functions entry point", () => {
    const names = readExportedFunctionNames();

    expect(names).toEqual(
      expect.arrayContaining([
        "syncCollectionCountOnCreate",
        "syncLibraryCountsOnProfileCreate",
        "syncSubscriptionRole", // `export const` form
      ])
    );
    expect(names.length).toBeGreaterThan(60);
  });

  it("keeps aliases and skips type-only exports", () => {
    const names = parseFunctionExportNames(`
      export { a, b as renamed } from "./x";
      export type { OnlyAType } from "./y";
      export { type AlsoAType, c } from "./z";
      export const d = 1;
    `);

    expect(names).toEqual(["a", "c", "d", "renamed"]);
  });

  it("separates missing functions from deployed orphans and ignores extensions", () => {
    expect(
      diffDeployment(
        ["live", "missing"],
        ["live", "retired", "ext-firestore-send-email-processqueue"]
      )
    ).toEqual({ undeployed: ["missing"], orphaned: ["retired"] });
  });
});
