import { describe, expect, it } from "vitest";

import { selectOtaBundleFiles } from "../../scripts/lib/capgo-ota-bundle-policy.mjs";

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
});
