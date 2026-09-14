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
      expect(source).toContain("calculateCardMandalaPaths");
      expect(source).toContain("renderCardMandala");
      expect(source).toContain("primaryPropColors");
      expect(source).not.toContain("function calculateStepPosition");
      expect(source).not.toContain("function calculateLayout");
    }
  });

  it("both generate_sequence tools expose the shared hand-color pair", () => {
    for (const path of [
      "mcp-server/src/tools/sequence-tools.ts",
      "mcp-server-pkg/src/tools/sequence-tools.ts",
    ]) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source).toContain("primaryPropColors: z");
      expect(source).toContain(
        "props, arrows, turn labels, reversal dots, and mandalas"
      );
    }
  });

  it("keeps specialized LOOP and preset image tools color-aware", () => {
    for (const path of [
      "mcp-server/src/tools/loop-tools.ts",
      "mcp-server-pkg/src/tools/loop-tools.ts",
      "mcp-server/src/tools/preset-tools.ts",
      "mcp-server-pkg/src/tools/preset-tools.ts",
    ]) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source).toContain("primaryPropColorsSchema");
      expect(source).toContain("primaryPropColors");
    }
  });
});
