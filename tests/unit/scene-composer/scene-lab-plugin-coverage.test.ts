import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { SCENE_OPTIONS } from "#lib/features/lab/tabs/scene-lab/domain/scene-lab-types.js";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import "#lib/shared/3d/scene-composer/register-scene-lab-composer-plugins.js";

const trackedStaticPaths = new Set(
  execFileSync("git", ["ls-files", "static"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
);

describe("Scene Lab composer coverage", () => {
  it("registers every Scene Lab scene exactly once", () => {
    const expected = SCENE_OPTIONS.map((option) => option.id).sort();
    const actual = composerRegistry.composableSceneIds().sort();

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("uses deployable catalog paths or declared raw authoring inputs", () => {
    for (const plugin of composerRegistry.list()) {
      for (const item of plugin.catalog.allItems()) {
        if (!item.modelPath) continue;

        if (item.modelPath.endsWith("_raw.glb")) {
          expect(
            item.modelPath,
            `${plugin.sceneId}/${item.key}: ${item.modelPath}`
          ).toMatch(/^\/models\/(?:[a-z0-9-]+\/)*[a-z0-9-]+_raw\.glb$/);
          continue;
        }

        expect(
          trackedStaticPaths.has(`static${item.modelPath}`),
          `${plugin.sceneId}/${item.key}: ${item.modelPath}`
        ).toBe(true);
      }
    }
  });

  it("resolves every saved placement to a current catalog item", () => {
    for (const plugin of composerRegistry.list()) {
      for (const placement of plugin.getDefaults()) {
        if (placement.source === "native") continue;
        expect(
          plugin.catalog.getDefinition(placement.objectKey),
          `${plugin.sceneId}/${placement.id}: ${placement.objectKey}`
        ).toBeDefined();
      }
    }
  });
});
