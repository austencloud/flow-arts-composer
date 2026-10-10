import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importRecoveredInShotDraft } from "#lib/shared/media-composition/domain/post-inshot-import.js";
import { compilePostProject } from "#lib/shared/media-composition/domain/post-project-compiler.js";
import {
  channelValueAt,
  sampleEasing,
  setKeyframe,
} from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import {
  duplicateItem,
  splitItemAt,
  trimItem,
  updateItemAt,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";

const matrix = (sx = 0.5625, sy = 1, tx = 0, ty = 0) => [
  sx,
  0,
  0,
  0,
  0,
  sy,
  0,
  0,
  0,
  0,
  1,
  0,
  tx,
  ty,
  0,
  1,
];
const crop = { CP_1: 0, CP_2: 0, CP_3: 1, CP_4: 1 };
const filter = (enabled = false) => ({
  FP_31: { AAP_1: enabled ? 0.4 : 0, AAP_5: enabled },
});

function fixture() {
  const paths = ["/camera.mp4", "/camera.mp4", "/ending.png", "/pip.mp4"];
  const main = [
    [0, 25_000_000, 70_000_000, 95_000_000],
    [24_000_000, 49_000_000, 140_000_000, 189_000_000],
    [72_000_000, 10_000_000, 0, 10_000_000],
  ].map(([start, duration, sourceIn, sourceOut], index) => ({
    MCI_1: { VFI_1: paths[index] },
    MCI_2: sourceIn,
    MCI_3: sourceOut,
    MCI_8: duration,
    MCI_10: 1,
    MCI_56: start,
    MCI_11: crop,
    MCI_22: matrix(),
    MCI_12: filter(index === 0),
    MCI_33: { TI_1: index < 2 ? 1_000_000 : 0, TI_2: index < 2 ? 1 : 0 },
    MCI_54:
      index === 1
        ? Array.from({ length: 17 }, (_, keyIndex) => ({
            VKF_1: 0.5625 * (1 + keyIndex / 10),
            VKF_2: 1 + keyIndex / 10,
            VKF_3: keyIndex / 100,
            VKF_4: 0,
            VKF_5: keyIndex,
            VKF_6: 1,
            VKF_7: 250_000 + keyIndex * 2_000_000,
            VKF_8: 140_250_000 + keyIndex * 2_000_000,
            VKF_9: [0, 4, 5, 6][keyIndex % 4],
          }))
        : [],
  }));
  const pipClip = {
    MCI_1: { VFI_1: paths[3] },
    MCI_2: 0,
    MCI_3: 24_000_000,
    MCI_8: 24_000_000,
    MCI_10: 1,
    MCI_56: 0,
    MCI_11: crop,
  };
  const texts = Array.from({ length: 4 }, (_, index) => ({
    BCI_3: 10_000_000 + index * 3_000_000,
    BCI_5: 2_000_000,
    TI_1: `Text ${index + 1} `,
    TI_15: {
      TAS_0: 255,
      TAS_1: 84,
      TAS_2: 0,
      TAS_3: 1,
      TAS_4: 2,
      TAS_7: "PermanentMarker.ttf",
    },
    BI_3: 0.79,
    BI_5: 738,
    BI_6: 1313,
    BI_13: [100, 100, 600, 100, 600, 200, 100, 200],
    BOI_9: { AP_3: 953_127, AP_7: 26, AP_8: 26, AP_15: 0.983333, AP_16: 0 },
  }));
  const draft = {
    MediaClipConfig: { ConfigJson: main },
    PipClipConfig: {
      ConfigJson: [{ PCI_0: pipClip, BOI_2: matrix(0.46, 0.5, 0, -0.5) }],
    },
    TextConfig: { ConfigJson: texts },
    EffectClipConfig: {
      ConfigJson: [
        {
          ECI_0: "ORIGINAL",
          ECI_2: filter(true),
          BCI_3: 24_500_000,
          BCI_5: 48_500_000,
        },
      ],
    },
    OpaqueId: "90071992547409931",
  };
  const rawDraftText = JSON.stringify(draft);
  const assetManifest = [...new Set(paths)].map((source) => ({
    source,
    local: source.slice(1),
    bytes: 1,
    sha256: "x",
  }));
  const bindings = Object.fromEntries(
    ["main-1", "main-2", "main-3", "pip-1"].map((id, index) => [
      id,
      {
        ref: { kind: "linked" as const, url: `/prepared/${id}` },
        label: id,
        durationSeconds: [25, 49, 10, 24][index]!,
        sourceOffsetSeconds: [70, 140, 0, 0][index]!,
      },
    ])
  );
  return {
    rawDraftText,
    assetManifest,
    bindings,
    sequenceId: "test",
    now: 1234,
  };
}

describe("recovered InShot import", () => {
  it("gives prepared cuts stable media keys across reimports", () => {
    const options = fixture();
    const first = importRecoveredInShotDraft(options);
    const again = importRecoveredInShotDraft({
      ...options,
      now: options.now + 500,
    });
    expect(again.takes.map((take) => take.takeKey)).toEqual(
      first.takes.map((take) => take.takeKey)
    );
    expect(first.takes[0]?.takeKey).not.toBe(first.takes[1]?.takeKey);
    const changed = importRecoveredInShotDraft({
      ...options,
      bindings: {
        ...options.bindings,
        "main-2": {
          ...options.bindings["main-2"]!,
          durationSeconds: 49.1,
        },
      },
    });
    expect(changed.takes[1]?.takeKey).not.toBe(first.takes[1]?.takeKey);
    expect(changed.takes[0]?.takeKey).toBe(first.takes[0]?.takeKey);
  });
  it.skipIf(!process.env.INSHOT_RECOVERY_DIR)(
    "accepts the recovered draft when locally available",
    () => {
      const root = process.env.INSHOT_RECOVERY_DIR!;
      const rawDraftText = readFileSync(
        join(root, "draft.decoded.json"),
        "utf8"
      );
      const rawProfileText = readFileSync(
        join(root, "Video_20260906_213218030.profile"),
        "utf8"
      );
      const assetManifest = JSON.parse(
        readFileSync(join(root, "assets.manifest.json"), "utf8")
      );
      const binding = (
        id: string,
        durationSeconds: number,
        sourceOffsetSeconds: number
      ) => ({
        ref: { kind: "linked" as const, url: `/prepared/${id}` },
        label: id,
        durationSeconds,
        sourceOffsetSeconds,
      });
      const project = importRecoveredInShotDraft({
        rawDraftText,
        assetManifest,
        bindings: {
          "main-1": binding("main-1", 25.137199, 70.512272),
          "main-2": binding("main-2", 48.557108, 142.642444),
          "main-3": binding("main-3", 9.961137, 0),
          "pip-1": binding("pip-1", 24.767, 0),
        },
        sequenceId: "actual",
        now: 1234,
      });
      expect(project.tracks[0]!.items.map((item) => item.start)).toEqual([
        0, 24.137199, 71.694307,
      ]);
      const fromProfile = importRecoveredInShotDraft({
        rawDraftText: rawProfileText,
        assetManifest,
        bindings: {
          "main-1": binding("main-1", 25.137199, 70.512272),
          "main-2": binding("main-2", 48.557108, 142.642444),
          "main-3": binding("main-3", 9.961137, 0),
          "pip-1": binding("pip-1", 24.767, 0),
        },
        sequenceId: "original",
        now: 1234,
      });
      expect(fromProfile.importSource?.rawDraftText).toBe(rawProfileText);
      expect(fromProfile.tracks[0]!.items.map((item) => item.start)).toEqual([
        0, 24.137199, 71.694307,
      ]);
      expect(fromProfile.tracks[0]!.items[0]).toMatchObject({ speed: 1 });
      expect(fromProfile.tracks[0]!.items[1]).toMatchObject({
        autoAdjust: {
          startSeconds: 24.637199,
          endSeconds: 72.694307,
        },
      });
      const native = JSON.parse(rawDraftText);
      const nativeKeys = native.MediaClipConfig.ConfigJson[1].MCI_54;
      const importedSecond = fromProfile.tracks[0]!.items[1]!;
      if (importedSecond.kind !== "video")
        throw new Error("Expected camera clip");
      expect(
        importedSecond.keyframes?.sourceGeometry?.map((key) => key.t)
      ).toEqual(
        nativeKeys.map(
          (key: { VKF_8: number }) => (key.VKF_8 - 142_642_444) / 1_000_000
        )
      );
      expect(
        channelValueAt(importedSecond, "sourceGeometry", importedSecond.start)
      ).toEqual(importedSecond.sourceGeometry);
      expect(
        compilePostProject(normalizeProject(fromProfile), {
          now: 1234,
        })?.preset.clips.find((clip) => clip.id === importedSecond.id)
          ?.sourceGeometryKeyframes?.[1]?.atSeconds
      ).toBeCloseTo(24.385055);
      const second = project.tracks[0]!.items[1]!;
      expect(
        second.kind === "video" && second.keyframes?.sourceGeometry?.length
      ).toBe(17);
      expect(
        compilePostProject(normalizeProject(project), { now: 1234 })?.preset
          .transitions
      ).toHaveLength(2);
    }
  );
  it("retains editable media, overlaps, native key times, styles, and lossless source", () => {
    const options = fixture();
    const project = importRecoveredInShotDraft(options);
    expect(project.importSource?.rawDraftText).toBe(options.rawDraftText);
    expect(project.importSource?.unresolved).toContain(
      "AutoAdjust uses a recovered native model and LUTs; its inference and blend are not yet reproduced in Post Studio"
    );
    expect(project.importSource?.unresolved).toContain(
      "Letter-slide text animation uses a Post Studio approximation of InShot's glyph motion"
    );
    expect(project.tracks[0]!.items.map((item) => item.kind)).toEqual([
      "video",
      "video",
      "image",
    ]);
    expect(project.tracks[0]!.items.map((item) => item.start)).toEqual([
      0, 24, 72,
    ]);
    const second = project.tracks[0]!.items[1]!;
    if (second.kind !== "video") throw new Error("Expected imported video");
    expect(second.sourceIn).toBe(0);
    expect(second.sourceOut).toBe(49);
    expect(second.keyframes?.sourceGeometry).toHaveLength(17);
    expect(second.keyframes?.sourceGeometry?.[0]?.t).toBe(0.25);
    expect(channelValueAt(second, "sourceGeometry", 24.25).width).toBe(1);
    expect(project.tracks[2]!.items[0]).toMatchObject({
      text: "Text 1 ",
      style: {
        fontFamily: "PermanentMarker.ttf",
        fontScale: 0.79,
        sourceCanvasWidth: 738,
      },
    });
    const normalized = normalizeProject(project);
    expect(normalized.tracks[0]!.items.map((item) => item.start)).toEqual([
      0, 24, 72,
    ]);
    const compiled = compilePostProject(normalized, { now: 1234 })!;
    expect(compiled.imageIds).toHaveLength(1);
    expect(compiled.preset.transitions).toHaveLength(2);
    const geometryKeys = compiled.preset.clips.find(
      (clip) => clip.id === second.id
    )?.sourceGeometryKeyframes;
    expect(geometryKeys).toHaveLength(18);
    expect(geometryKeys?.[0]?.easing).toBe("hold");
  });

  it("requires every playable prepared binding and keeps edits on the geometry channel", () => {
    const options = fixture();
    expect(() =>
      importRecoveredInShotDraft({
        ...options,
        bindings: { ...options.bindings, "main-2": undefined },
      })
    ).toThrow(/prepared media binding/);
    expect(() =>
      importRecoveredInShotDraft({
        ...options,
        bindings: {
          ...options.bindings,
          "main-2": { ...options.bindings["main-2"]!, durationSeconds: 48 },
        },
      })
    ).toThrow(/does not cover its source span/);
    expect(() =>
      importRecoveredInShotDraft({
        ...options,
        bindings: {
          ...options.bindings,
          "pip-1": { ...options.bindings["pip-1"]!, durationSeconds: 23 },
        },
      })
    ).toThrow(/does not cover its source span/);
    expect(() =>
      importRecoveredInShotDraft({
        ...options,
        bindings: {
          ...options.bindings,
          "main-3": { ...options.bindings["main-3"]!, sourceOffsetSeconds: 1 },
        },
      })
    ).toThrow(/image binding.*source offset/);
    const alphaDraft = JSON.parse(options.rawDraftText);
    alphaDraft.MediaClipConfig.ConfigJson[1].MCI_54[0].VKF_6 = 0.5;
    expect(() =>
      importRecoveredInShotDraft({
        ...options,
        rawDraftText: JSON.stringify(alphaDraft),
      })
    ).toThrow(/unsupported animated opacity/);
    let project = importRecoveredInShotDraft(options);
    const second = project.tracks[0]!.items[1]!;
    if (second.kind !== "video") throw new Error("Expected imported video");
    const value = channelValueAt(second, "sourceGeometry", 26);
    project = updateItemAt(
      project,
      second.id,
      { sourceGeometry: { ...value, x: value.x + 0.1 } },
      26,
      { now: 1235 }
    );
    const edited = project.tracks[0]!.items[1]!;
    if (edited.kind !== "video") throw new Error("Expected edited video");
    expect(edited.keyframes?.sourceGeometry).toHaveLength(18);
    expect(channelValueAt(edited, "sourceGeometry", 26).x).toBeCloseTo(
      value.x + 0.1
    );
    const image = project.tracks[0]!.items[2]!;
    if (image.kind !== "image") throw new Error("Expected imported image");
    const keyedImage = setKeyframe(image, "sourceGeometry", image.start + 2);
    if (keyedImage.kind !== "image") throw new Error("Expected edited image");
    expect(keyedImage.keyframes?.sourceGeometry?.[0]?.t).toBe(2);
    project = {
      ...project,
      tracks: project.tracks.map((track, index) =>
        index === 0
          ? {
              ...track,
              items: track.items.map((item) =>
                item.id === image.id ? keyedImage : item
              ),
            }
          : track
      ),
    };
    const imageGeometry = channelValueAt(
      keyedImage,
      "sourceGeometry",
      image.start + 3
    );
    project = updateItemAt(
      project,
      image.id,
      {
        sourceGeometry: {
          ...imageGeometry,
          x: imageGeometry.x + 0.1,
        },
      },
      image.start + 3,
      { now: 1236 }
    );
    const editedImage = project.tracks[0]!.items[2]!;
    if (editedImage.kind !== "image") throw new Error("Expected keyed image");
    expect(editedImage.keyframes?.sourceGeometry?.map((key) => key.t)).toEqual([
      2, 3,
    ]);
    expect(
      channelValueAt(editedImage, "sourceGeometry", image.start + 3).x
    ).toBeCloseTo(imageGeometry.x + 0.1);
    const split = splitItemAt(project, image.id, image.start + 5, {
      now: 1236,
    })!;
    expect(split.project.tracks[0]!.items).toHaveLength(4);
    const splitImage = split.project.tracks[0]!.items[3]!;
    if (splitImage.kind !== "image") throw new Error("Expected split image");
    expect(splitImage.sourceGeometry).toEqual(editedImage.sourceGeometry);
    expect(splitImage.keyframes?.sourceGeometry?.map((key) => key.t)).toEqual([
      -3, -2,
    ]);
    const trimmed = trimItem(split.project, split.newItemId, "end", 80, {
      now: 1237,
    });
    expect(trimmed.tracks[0]!.items[3]!.kind).toBe("image");
    const duplicated = duplicateItem(trimmed, second.id, { now: 1238 })!;
    expect(duplicated.project.tracks[0]!.items).toHaveLength(5);
    const duplicatedImage = duplicateItem(trimmed, split.newItemId, {
      now: 1239,
    })!;
    const imageCopy = duplicatedImage.project.tracks[0]!.items.find(
      (item) => item.id === duplicatedImage.newItemId
    );
    expect(imageCopy).toMatchObject({
      kind: "image",
      imageId: image.imageId,
      sourceGeometry: editedImage.sourceGeometry,
    });
  });

  it("samples the native cubic curve on its 300-point grid", () => {
    const value = sampleEasing(
      { kind: "sampled-bezier", curve: [0.3, 0, 0.7, 1], samples: 300 },
      0.25
    );
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.25);
    expect(
      sampleEasing(
        { kind: "sampled-bezier", curve: [0.3, 0, 0.7, 1], samples: 300 },
        0.5
      )
    ).toBeCloseTo(0.5, 6);
  });
});
