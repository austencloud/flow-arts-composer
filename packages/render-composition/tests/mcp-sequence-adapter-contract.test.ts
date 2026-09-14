import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("MCP sequence renderer adapters", () => {
  it("both delegate composition to the shared pipeline", () => {
    for (const path of [
      "mcp-server/src/core/sequence-renderer.ts",
      "mcp-server-pkg/src/core/sequence-renderer.ts",
    ]) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source).toContain("composeSequenceCard");
      expect(source).toContain("COMPOSER_CARD_EXPORT_PROFILE_V1");
      expect(source).not.toContain("function calculateStepPosition");
      expect(source).not.toContain("function calculateLayout");
    }
  });
});
