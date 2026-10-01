import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readInShotRecoveryPackage } from "$lib/shared/media-composition/services/inshot-recovery-package";

// jsdom's File omits Blob.text() and arrayBuffer(), which real browser files provide.
const namedFile = (name: string, body = "x") =>
  new NodeFile([body], name, { lastModified: 10 }) as unknown as File;
const bundleFile = (bundle: object) =>
  namedFile("recovery.post-studio.json", JSON.stringify(bundle));
const ref = (name: string, size = 1) => ({
  kind: "local",
  name,
  size,
  lastModified: 10,
});

function packageFor(
  rawDraftText: string,
  assetManifest: unknown,
  withFont = false
) {
  return {
    format: "post-studio-inshot-recovery-v1",
    rawDraftText,
    assetManifest,
    bindings: Object.fromEntries(
      [
        ["main-1", "camera-cut-1.mp4", 25.137199, 70.512272],
        ["main-2", "camera-cut-2.mp4", 48.557108, 142.642444],
        ["main-3", "ending.png", 9.961137, 0],
        ["pip-1", "pip.mp4", 24.767, 0],
      ].map(([id, name, durationSeconds, sourceOffsetSeconds]) => [
        id,
        {
          ref: ref(name as string),
          label: name,
          durationSeconds,
          sourceOffsetSeconds,
        },
      ])
    ),
    fonts: withFont
      ? [{ family: "PermanentMarker.ttf", ref: ref("PermanentMarker.ttf") }]
      : [],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("InShot recovery package", () => {
  it("rejects a missing description, malformed description, and duplicate selected filenames", async () => {
    await expect(
      readInShotRecoveryPackage([namedFile("video.mp4")], "s", 1)
    ).rejects.toThrow(/Select one/);
    const malformed = bundleFile({
      format: "wrong",
      rawDraftText: "{}",
      assetManifest: [],
      bindings: {},
    });
    await expect(
      readInShotRecoveryPackage([malformed], "s", 1)
    ).rejects.toThrow();
    const validShape = packageFor("{}", []);
    await expect(
      readInShotRecoveryPackage(
        [bundleFile(validShape), namedFile("same.mp4"), namedFile("same.mp4")],
        "s",
        1
      )
    ).rejects.toThrow(/Two selected files/);
  });

  it("rejects a missing or mismatched local media binding before import", async () => {
    const bundle = packageFor("{}", []);
    await expect(
      readInShotRecoveryPackage([bundleFile(bundle)], "s", 1)
    ).rejects.toThrow(/Also select camera-cut-1.mp4/);
    await expect(
      readInShotRecoveryPackage(
        [bundleFile(bundle), namedFile("camera-cut-1.mp4", "too long")],
        "s",
        1
      )
    ).rejects.toThrow(/size of camera-cut-1.mp4/);
  });

  it.skipIf(!process.env.INSHOT_RECOVERY_DIR)(
    "binds the original profile and reports a font loading failure",
    async () => {
      const root = process.env.INSHOT_RECOVERY_DIR!;
      const rawDraftText = readFileSync(
        join(root, "Video_20260906_213218030.profile"),
        "utf8"
      );
      const assetManifest = JSON.parse(
        readFileSync(join(root, "assets.manifest.json"), "utf8")
      );
      const bundle = packageFor(rawDraftText, assetManifest);
      const media = [
        "camera-cut-1.mp4",
        "camera-cut-2.mp4",
        "ending.png",
        "pip.mp4",
      ].map((name) => namedFile(name));
      const result = await readInShotRecoveryPackage(
        [bundleFile(bundle), ...media],
        "actual",
        1
      );
      expect(result.project.importSource?.rawDraftText).toBe(rawDraftText);
      expect(result.project.tracks[0]!.items).toHaveLength(3);
      expect(result.files.size).toBe(5);

      class BadFontFace {
        constructor(_family: string, _source: ArrayBuffer | string) {}
        load() {
          return Promise.reject(new Error("font decode failed"));
        }
      }
      vi.stubGlobal("FontFace", BadFontFace);
      vi.stubGlobal("document", { fonts: { add: vi.fn() } });
      const withFont = packageFor(rawDraftText, assetManifest, true);
      await expect(
        readInShotRecoveryPackage(
          [bundleFile(withFont), ...media, namedFile("PermanentMarker.ttf")],
          "actual",
          2
        )
      ).rejects.toThrow(/font decode failed/);
    }
  );
});
