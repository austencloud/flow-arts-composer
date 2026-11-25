import { describe, expect, it } from "vitest";

import {
  OTA_BUNDLE_BUDGET_BYTES,
  OTA_EMPTY_FILE_PLACEHOLDER,
  findMissingNamedCodeFiles,
  planEmptyFileHandling,
  selectOtaBundleFiles,
} from "../../scripts/lib/capgo-ota-bundle-policy.mjs";

// The phone bundle silently loses any model this drops, so each case pins a
// way the built app can name a file.
function select(files: Record<string, string>) {
  return selectOtaBundleFiles(
    Object.keys(files),
    (path: string) => files[path]
  );
}

describe("Capgo over-the-air bundle policy", () => {
  it("keeps models the built app names and drops the rest", () => {
    const result = select({
      "index.html": "<script src=/_app/start.js></script>",
      "_app/start.js": 'useGltf("/models/forest/forest-stage.glb?v=r2")',
      "models/forest/forest-stage.glb": "",
      "models/forest/review/forest-stage-r1-proof.glb": "",
      "images/hero.webp": "",
    });

    expect(result.keep).toEqual([
      "index.html",
      "_app/start.js",
      "models/forest/forest-stage.glb",
      "images/hero.webp",
    ]);
    expect(result.unreferenced).toEqual([
      "models/forest/review/forest-stage-r1-proof.glb",
    ]);
  });

  it("keeps everything under the fixed start of a built path", () => {
    const result = select({
      "_app/kit.js":
        'const t="/models/museum/kit";const u=`${t}/${e}/wall-section.glb`;' +
        "const s=`/models/ecology/species/${id}.glb`",
      "models/museum/kit/marble/wall-section.glb": "",
      "models/ecology/species/beech.glb": "",
    });

    expect(result.unreferenced).toEqual([]);
  });

  // From 2026-11-11 this one message kept all 1.5 GB of models and every
  // upload was refused for size.
  it("does not count a bare /models/ in a message as naming every model", () => {
    const result = select({
      "_app/catalog.js":
        'n(`"glbUrl" must be a /models/…/*.glb path served from static/`)',
      "models/forest/candidates/oak-r1-proof.glb": "",
    });

    expect(result.unreferenced).toEqual([
      "models/forest/candidates/oak-r1-proof.glb",
    ]);
  });

  it("stages under a budget whose zip always fits Capgo's 1 GiB cap", () => {
    expect(OTA_BUNDLE_BUDGET_BYTES).toBeLessThan(1024 * 1024 * 1024);
  });

  it("matches a bare file name from shipped data", () => {
    const result = select({
      "data/scene.json": '{"tree":"oak%20tall.glb","rock":"granite.glb"}',
      "models/props/granite.glb": "",
    });

    expect(result.keep).toContain("models/props/granite.glb");
  });

  it("ignores Cloudflare routing files that list every model folder", () => {
    const result = select({
      "_routes.json": '{"exclude":["/models/*"]}',
      "_worker.js": 'import "/models/forest/old.glb"',
      "models/forest/old.glb": "",
    });

    expect(result.unreferenced).toEqual(["models/forest/old.glb"]);
  });

  it("follows a reached glTF to its buffers but not an unreached manifest", () => {
    const result = select({
      "_app/app.js": 'load("/models/forest/tree.gltf")',
      "models/forest/tree.gltf": '{"buffers":[{"uri":"tree.bin"}]}',
      "models/forest/tree.bin": "",
      "models/forest/candidates/manifest.json": '["candidate-s19.glb"]',
      "models/forest/candidates/candidate-s19.glb": "",
    });

    expect(result.keep).toEqual([
      "_app/app.js",
      "models/forest/tree.gltf",
      "models/forest/tree.bin",
      "models/forest/candidates/manifest.json",
    ]);
    expect(result.unreferenced).toEqual([
      "models/forest/candidates/candidate-s19.glb",
    ]);
  });

  it("leaves out paths with spaces, which Capgo delta uploads reject", () => {
    const result = select({
      "_app/lab.js": 'load("/animations/pack/X%20Bot.glb")',
      "animations/pack/X Bot.glb": "",
      "sounds/Fantasy Library/chime.mp3": "",
    });

    expect(result.whitespace).toEqual([
      "animations/pack/X Bot.glb",
      "sounds/Fantasy Library/chime.mp3",
    ]);
    expect(result.keep).toEqual(["_app/lab.js"]);
  });

  // Capgo drops 0-byte files; the phone then 404s on a chunk it imports.
  describe("empty files", () => {
    it("fills empty code files, reports other empty files, leaves the rest", () => {
      const plan = planEmptyFileHandling(
        new Map([
          ["_app/immutable/chunks/Empty1.js", 0],
          ["_app/immutable/entry/start.mjs", 0],
          ["_app/immutable/assets/empty.css", 0],
          ["sounds/click.mp3", 0],
          ["_app/immutable/chunks/Real.js", 120],
          ["images/hero.webp", 9],
        ])
      );

      expect(plan.fill).toEqual([
        "_app/immutable/chunks/Empty1.js",
        "_app/immutable/entry/start.mjs",
        "_app/immutable/assets/empty.css",
      ]);
      expect(plan.dropped).toEqual(["sounds/click.mp3"]);
    });

    it("uses a placeholder that is not empty and is a comment", () => {
      expect(OTA_EMPTY_FILE_PLACEHOLDER.length).toBeGreaterThan(0);
      expect(OTA_EMPTY_FILE_PLACEHOLDER.startsWith("/*")).toBe(true);
      expect(OTA_EMPTY_FILE_PLACEHOLDER.trimEnd().endsWith("*/")).toBe(true);
    });

    it("flags a named _app code file that is not staged or still empty", () => {
      const files = {
        "_app/immutable/entry/app.js":
          'import"../chunks/Named.js";import"../chunks/Gone.js"',
        "_app/immutable/chunks/Named.js": "",
        "_app/immutable/chunks/Gone.js": "x",
        "_app/immutable/chunks/with space/Hidden.js": "x",
        "_app/immutable/chunks/Unnamed.js": "",
      };
      const { references } = select(files);
      // Hidden.js is named by other built code, but its path has a space, so
      // it never reaches the staged folder.
      references.fileNames.add("Hidden.js");
      const staged = new Map([
        ["_app/immutable/entry/app.js", 60],
        ["_app/immutable/chunks/Named.js", 0],
        ["_app/immutable/chunks/Gone.js", 1],
        ["_app/immutable/chunks/Unnamed.js", 0],
      ]);

      expect(
        findMissingNamedCodeFiles(Object.keys(files), staged, references)
      ).toEqual([
        "_app/immutable/chunks/Named.js",
        "_app/immutable/chunks/with space/Hidden.js",
      ]);
    });

    it("passes once the named empty file has been filled", () => {
      const files = {
        "_app/immutable/entry/app.js": 'import"../chunks/Named.js"',
        "_app/immutable/chunks/Named.js": "",
      };
      const { references } = select(files);
      const staged = new Map([
        ["_app/immutable/entry/app.js", 30],
        ["_app/immutable/chunks/Named.js", OTA_EMPTY_FILE_PLACEHOLDER.length],
      ]);

      expect(
        findMissingNamedCodeFiles(Object.keys(files), staged, references)
      ).toEqual([]);
    });
  });
});
