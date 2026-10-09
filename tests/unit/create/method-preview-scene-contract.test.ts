/**
 * Every registered Create method preview scene is decorative and names the
 * method flow it mirrors (spec: Scenes). The card around it stays one native
 * button, so a scene holds no buttons, links, form fields, or tab stops.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

const DIR = "src/lib/features/create/shared/components/method-previews";

const SCENE_FILES: Record<string, string> = {
  construct: "ConstructScene.svelte",
  generate: "GenerateScene.svelte",
  "shape-engine": "ShapeScene.svelte",
  fuse: "FuseScene.svelte",
  tunnel: "TunnelScene.svelte",
  assemble: "AssembleScene.svelte",
};

const INTERACTIVE = [
  /<button\b/,
  /<a\s/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
  /tabindex/,
];

describe("method preview scenes", () => {
  it("are decorative and name the flow they mirror", () => {
    for (const id of Object.keys(METHOD_PREVIEW_SCENES)) {
      const file = SCENE_FILES[id];
      expect(file, `scene file for ${id}`).toBeDefined();
      const path = resolve(process.cwd(), DIR, file!);
      expect(existsSync(path), path).toBe(true);
      const source = readFileSync(path, "utf8");
      for (const pattern of INTERACTIVE) {
        expect(source, `${file} ${pattern}`).not.toMatch(pattern);
      }
      expect(source, `${file} names its flow`).toMatch(/Mirrors:/);
    }
  });
});
