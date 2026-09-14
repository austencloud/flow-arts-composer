import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const consumers = [
  "src/lib/features/choreo-card/components/ChoreoCardExport.svelte",
  "mcp-server/src/tools/sequence-tools.ts",
  "mcp-server/src/tools/loop-tools.ts",
  "mcp-server/src/tools/preset-tools.ts",
  "mcp-server-pkg/src/tools/sequence-tools.ts",
  "mcp-server-pkg/src/tools/loop-tools.ts",
  "mcp-server-pkg/src/tools/preset-tools.ts",
];

describe("Composer card export profile consumers", () => {
  it.each(consumers)("keeps %s on the canonical profile", (path) => {
    const source = readFileSync(resolve(root, path), "utf8");

    expect(source).toContain("COMPOSER_CARD_EXPORT_PROFILE_V1");
    expect(source).not.toMatch(/\.default\(900\)/);
    expect(source).not.toMatch(/cellSize\s*=\s*900/);
    expect(source).not.toMatch(/darkMode\s*=\s*true/);
    expect(source).not.toMatch(/showDifficulty:\s*true/);
  });

  it("keeps the app layout calculator on the shared tables", () => {
    const source = readFileSync(
      resolve(root, "src/lib/shared/render/services/layout-calculator.ts"),
      "utf8"
    );

    expect(source).toContain("getLayout");
    expect(source).not.toContain("LAYOUT_WITH_START_POSITION");
    expect(source).not.toContain("LAYOUT_WITHOUT_START_POSITION");
  });

  it("keeps the app step labels on the shared renderer", () => {
    const source = readFileSync(
      resolve(root, "src/lib/shared/render/services/step-number-renderer.ts"),
      "utf8"
    );

    expect(source).toContain("renderStepNumber as drawStepNumber");
    expect(source).not.toContain("fillText");
  });

  it("forces Composer bulk exports onto the profile's mandala setting", () => {
    const source = readFileSync(
      resolve(
        root,
        "src/lib/features/choreo-card/components/ChoreoCardExport.svelte"
      ),
      "utf8"
    );

    expect(source).toContain(
      "showMandala: COMPOSER_CARD_EXPORT_PROFILE_V1.showMandala"
    );
  });
});
