import { describe, expect, it } from "vitest";
import {
  canReplaceOverlayVideoWithAnimation,
  replaceOverlayVideoWithAnimation,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { takeRole } from "$lib/shared/media-composition/domain/post-plan-compiler";
import { NOW, project, take, video } from "./post-project-fixtures";

const cameraId = "inshot-123-main-1";
const pipId = "inshot-123-pip-1";
const nativePip = {
  x: 0.09076,
  y: 0.49004595,
  width: 0.81848,
  height: 0.509976,
  rotation: 0,
  crop: { left: 0, top: 0, right: 1, bottom: 1 },
};

function recoveredProject(): PostProject {
  const camera = video(cameraId, {
    takeId: cameraId,
    sourceIn: 5,
    sourceOut: 30.137199,
  });
  const pip = video(pipId, {
    takeId: pipId,
    sourceIn: 0,
    sourceOut: 24.767,
    sourceGeometry: nativePip,
    opacity: 0.8,
    fadeIn: 0.2,
    fadeOut: 0.3,
  });
  return normalizeProject({
    ...project([camera], [[pip]], [take(cameraId, 40), take(pipId, 24.767)]),
    importSource: {
      format: "inshot-recovery",
      rawDraftText: "{}",
      unresolved: [],
    },
  });
}

describe("replace recovered PIP with live animation", () => {
  it("keeps its timeline placement and frame while following the main take's beat map", () => {
    const before = recoveredProject();
    expect(canReplaceOverlayVideoWithAnimation(before, pipId)).toBe(true);

    const after = replaceOverlayVideoWithAnimation(before, pipId, {
      now: NOW + 1,
    });
    expect(PostProjectSchema.safeParse(after).success).toBe(true);
    expect(after).not.toBe(before);
    expect(before.tracks[1]?.items[0]?.kind).toBe("video");
    expect(after.takes.some((entry) => entry.id === pipId)).toBe(true);
    expect(after.tracks[1]?.items).toHaveLength(1);

    const animation = after.tracks[1]!.items[0]!;
    expect(animation).toMatchObject({
      id: pipId,
      kind: "animation",
      start: 0,
      duration: 24.767,
      opacity: 0.8,
      fadeIn: 0.2,
      fadeOut: 0.3,
      fill: false,
      overlay: false,
    });
    expect(animation.box.x).toBeCloseTo(nativePip.x, 4);
    expect(animation.box.y).toBeCloseTo(1 - nativePip.height, 5);
    expect(animation.box.width).toBeCloseTo(nativePip.width, 4);
    expect(animation.box.height).toBeCloseTo(nativePip.height, 5);

    const compiled = compilePostProject(after, { now: NOW + 1 })!;
    expect(compiled.takeIds).toEqual([cameraId]);
    expect(
      compiled.preset.clips.find((clip) => clip.id === `${pipId}~0`)
    ).toMatchObject({
      timeMapRole: takeRole(cameraId),
      sourceIn: { unit: "seconds", value: 5 },
      sourceOut: { unit: "seconds", value: 29.767 },
      useResolvedTimeMap: true,
    });
  });

  it("leaves unrelated or geometrically incompatible video overlays alone", () => {
    const base = recoveredProject();
    const unrelated = {
      ...base,
      importSource: undefined,
    };
    expect(canReplaceOverlayVideoWithAnimation(unrelated, pipId)).toBe(false);
    expect(
      replaceOverlayVideoWithAnimation(unrelated, pipId, { now: NOW + 1 })
    ).toBe(unrelated);
    expect(canReplaceOverlayVideoWithAnimation(base, cameraId)).toBe(false);

    const keyed = structuredClone(base);
    const pip = keyed.tracks[1]!.items[0]!;
    if (pip.kind !== "video") throw new Error("Expected video fixture");
    pip.keyframes = {
      sourceGeometry: [{ t: 0, value: nativePip, easing: "linear" }],
    };
    expect(canReplaceOverlayVideoWithAnimation(keyed, pipId)).toBe(false);

    const offCanvas = structuredClone(base);
    const offCanvasPip = offCanvas.tracks[1]!.items[0]!;
    if (offCanvasPip.kind !== "video")
      throw new Error("Expected video fixture");
    offCanvasPip.sourceGeometry = { ...nativePip, x: -0.02 };
    expect(canReplaceOverlayVideoWithAnimation(offCanvas, pipId)).toBe(false);
  });

  it("rebases video-clock opacity keys onto the animation's local clock", () => {
    const draft = recoveredProject();
    const pip = draft.tracks[1]!.items[0]!;
    if (pip.kind !== "video") throw new Error("Expected video fixture");
    pip.sourceIn = 1;
    pip.keyframes = {
      opacity: [{ t: 2, value: 0.5, easing: "linear" }],
    };
    const before = normalizeProject(draft);
    const after = replaceOverlayVideoWithAnimation(before, pipId, {
      now: NOW + 1,
    });
    const animation = after.tracks[1]!.items[0]!;
    expect(animation.kind).toBe("animation");
    expect(animation.keyframes?.opacity?.[0]?.t).toBe(1);
    expect(animation.keyframes?.opacity?.[0]?.value).toBe(0.5);
  });
});
