import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPROVED_FAN_BUILDS } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import { APPROVED_FAN_BUILDS as PACKAGE_APPROVED } from "../../../packages/tka-pictograph/src/fan-builds";
import { APPROVED_FAN_BUILDS as SERVER_APPROVED } from "../../../mcp-server/src/core/fan-builds";

// Approving a maker's look is a one-line edit in each of the three lists. This
// keeps the app and both MCP renderers from drawing different looks.
describe("approved fan looks", () => {
  it("are the same in the app and both MCP renderers", () => {
    expect([...PACKAGE_APPROVED].sort()).toEqual([...APPROVED_FAN_BUILDS].sort());
    expect([...SERVER_APPROVED].sort()).toEqual([...APPROVED_FAN_BUILDS].sort());
  });

  it("keep the MCP server's copy of the helpers in step with the package's", () => {
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), "utf-8").replace(/\r\n/g, "\n");
    expect(read("../../../mcp-server/src/core/fan-builds.ts")).toBe(
      read("../../../packages/tka-pictograph/src/fan-builds.ts")
    );
  });
});
