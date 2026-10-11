import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURES } from "../../src/config/feature-flags";
import {
  MODULE_DEFINITIONS,
  normalizeModuleId,
} from "#lib/shared/navigation/config/module-definitions.js";
import { load as redirectWatch } from "../../src/routes/watch/[...path]/+page";

describe("Watch retirement", () => {
  it("removes Watch from the module and compile-time feature registries", () => {
    expect(MODULE_DEFINITIONS.some((module) => module.id === "watch")).toBe(
      false
    );
    expect(FEATURES.some((feature) => feature.id === "watch")).toBe(false);

    const voicePrompt = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/shared/voice-control/ai/voice-command-prompt.ts"
      ),
      "utf8"
    );
    expect(voicePrompt).not.toMatch(/Modules:.*\bwatch\b/i);
  });

  it("migrates persisted Watch destinations to Browse", () => {
    expect(normalizeModuleId("watch")).toBe("browse");
  });

  it("permanently redirects former Watch routes to Browse Gallery", () => {
    expect(() => redirectWatch()).toThrowError(
      expect.objectContaining({
        status: 308,
        location: "/browse/explore/sequences",
      })
    );
  });

  it("keeps personal performances reachable from Browse Library", () => {
    const libraryPanel = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/features/browse/collections/components/MyCollectionsPanel.svelte"
      ),
      "utf8"
    );

    expect(libraryPanel).toContain("UserVideoLibraryView");
    expect(libraryPanel).toContain(
      'PERFORMANCES_SHELF_ID = "video_performances"'
    );
  });
});
