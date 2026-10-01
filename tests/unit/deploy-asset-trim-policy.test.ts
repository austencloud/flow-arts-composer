import { describe, expect, it } from "vitest";

import {
  DEPLOY_DIRECTORY_FILE_ALLOWLISTS,
  DEPLOY_MAX_FILE_BYTES,
  DEPLOY_RESTRICTED_FILES,
  getDisallowedDeployEntries,
  isExcludedFromDeploy,
} from "../../scripts/deploy-asset-trim-policy.js";

describe("deploy asset trimming policy", () => {
  it("ships only the Autumn floor texture fetched by the browser", () => {
    expect(DEPLOY_DIRECTORY_FILE_ALLOWLISTS["textures/autumn-floor"]).toEqual([
      "ground-detail-modulation.ktx2",
    ]);

    expect(
      getDisallowedDeployEntries(
        [
          "autumn-ground-zoned.jpg",
          "ground-detail-modulation.ktx2",
          "ground-detail-modulation.png",
          "soil-albedo.jpg",
        ],
        DEPLOY_DIRECTORY_FILE_ALLOWLISTS["textures/autumn-floor"]
      )
    ).toEqual([
      "autumn-ground-zoned.jpg",
      "ground-detail-modulation.png",
      "soil-albedo.jpg",
    ]);
  });

  it("keeps evaluation-only avatars out of deploy artifacts", () => {
    expect(DEPLOY_RESTRICTED_FILES).toContain(
      "models/avatars/bakeoff/personal-metaperson.glb"
    );
  });

  // The client build skips copying whatever this matches. Matching a runtime
  // asset would drop it from the site with no build error.
  it("skips only static entries the final trim deletes", () => {
    const directory = { isDirectory: true, size: 0 };
    const file = (size = 1) => ({ isDirectory: false, size });

    const kept = [
      ["textures/autumn-floor", directory],
      ["textures/autumn-floor/ground-detail-modulation.ktx2", file()],
      ["models/autumn", directory],
      ["images/thumbnails", directory],
      ["images/thumbnails/letter-a.svg", file()],
      ["guides/level-1.pdf", file(DEPLOY_MAX_FILE_BYTES)],
    ] as const;
    const skipped = [
      ["sketches", directory],
      ["vad/ort-wasm-simd-threaded.wasm", file()],
      ["element-icons-preview.html", file()],
      ["models/avatars/bakeoff/personal-metaperson.glb", file()],
      ["models/autumn/hero-tree-a.glb", file()],
      ["textures/autumn-floor/soil-albedo.jpg", file()],
      ["textures/autumn-floor/bake-cache", directory],
      ["models/forest/oak_raw.glb", file()],
      ["models/ember/escarpment.glb", file(DEPLOY_MAX_FILE_BYTES + 1)],
    ] as const;

    for (const [relativePath, entry] of kept) {
      expect(isExcludedFromDeploy(relativePath, entry), relativePath).toBe(false);
    }
    for (const [relativePath, entry] of skipped) {
      expect(isExcludedFromDeploy(relativePath, entry), relativePath).toBe(true);
    }
  });
});
