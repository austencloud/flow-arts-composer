import { describe, expect, it } from "vitest";
import {
  PostProjectSchema,
  type PostImageItem,
  type PostItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { mirrorPostProject } from "$lib/shared/media-composition/domain/post-project-mirror";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import {
  NOW,
  card,
  overlay,
  project,
  text,
  video,
} from "./post-project-fixtures";

const ease = [0.12, 0.34, 0.56, 0.78] as const;
const geometry = {
  x: 0.16,
  y: 0.21,
  width: 0.44,
  height: 0.52,
  rotation: 23,
  crop: { left: 0.11, top: 0.07, right: 0.81, bottom: 0.93 },
};
const pictureBox = { x: 0.13, y: 0.2, width: 0.4, height: 0.5, turn: 31 };

function authoredProject(): PostProject {
  const picture = video("camera", {
    sourceOut: 5,
    box: pictureBox,
    sourceGeometry: geometry,
    panX: 0.19,
    rotation: 45,
    staffEffect: { effect: "sparkles" },
    keyframes: {
      box: [
        { t: 1, value: pictureBox, easing: ease },
        {
          t: 3,
          value: { x: 0.4, y: 0.1, width: 0.25, height: 0.6, turn: -48 },
          easing: "hold",
        },
      ],
      framing: [
        {
          t: 2,
          value: { zoom: 1.5, panX: -0.2, panY: 0.14, rotation: 70 },
          easing: ease,
        },
      ],
      sourceGeometry: [
        { t: 2.5, value: geometry, easing: ease },
        {
          t: 4,
          value: { ...geometry, x: 0.33, rotation: -81 },
          easing: "hold",
        },
      ],
    },
  });
  const image: PostImageItem = {
    id: "image-item",
    kind: "image",
    label: "Opening artwork",
    imageId: "opening",
    start: 5,
    duration: 2,
    box: pictureBox,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    sourceGeometry: geometry,
    keyframes: {
      sourceGeometry: [{ t: 0.5, value: geometry, easing: ease }],
      box: [{ t: 0.5, value: pictureBox, easing: ease }],
    },
  };
  const caption = text("caption", 1, 2, {
    box: pictureBox,
    keyframes: {
      box: [{ t: 0.5, value: pictureBox, easing: ease }],
    },
  });
  return normalizeProject({
    ...project(
      [card("open", 1, { box: pictureBox }), picture, image, card("end", 2)],
      [[overlay("animation", "animation", { box: pictureBox }), caption]]
    ),
    images: [
      {
        id: "opening",
        label: "Opening artwork",
        ref: { kind: "linked", url: "https://example.test/opening.png" },
      },
    ],
  });
}

function item(projectValue: PostProject, id: string): PostItem {
  const result = projectValue.tracks
    .flatMap((track) => track.items)
    .find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing ${id}`);
  return result;
}

describe("mirrorPostProject", () => {
  it("reflects every authored position and turn without moving keys in time", () => {
    const original = authoredProject();
    const mirrored = mirrorPostProject(original, { now: NOW + 1 });
    expect(mirrored.mirrored).toBe(true);
    expect(PostProjectSchema.safeParse(mirrored).success).toBe(true);
    const camera = item(mirrored, "camera");
    if (camera.kind !== "video") throw new Error("Expected camera video");
    expect(camera.box).toEqual({ ...pictureBox, x: 0.47, turn: -31 });
    expect(camera.sourceGeometry?.x).toBeCloseTo(0.4, 9);
    expect(camera.sourceGeometry?.rotation).toBe(-23);
    expect(camera.sourceGeometry?.crop).toEqual(geometry.crop);
    expect(camera.flip).toBe(true);
    expect(camera.panX).toBe(-0.19);
    expect(camera.rotation).toBe(-45);
    expect(camera.keyframes?.box?.[1]).toEqual({
      t: 3,
      value: { x: 0.35, y: 0.1, width: 0.25, height: 0.6, turn: 48 },
      easing: "hold",
    });
    expect(camera.keyframes?.framing?.[0]).toEqual({
      t: 2,
      value: { zoom: 1.5, panX: 0.2, panY: 0.14, rotation: -70 },
      easing: [...ease],
    });
    expect(camera.keyframes?.sourceGeometry?.[1]?.value.x).toBeCloseTo(0.23, 9);
    expect(camera.keyframes?.sourceGeometry?.[1]?.value.rotation).toBe(81);
    expect(item(mirrored, "caption").box).toEqual({
      ...pictureBox,
      x: 0.47,
      turn: -31,
    });
    expect(item(mirrored, "animation").box).toEqual({
      ...pictureBox,
      x: 0.47,
      turn: -31,
    });
    const image = item(mirrored, "image-item");
    if (image.kind !== "image") throw new Error("Expected image");
    expect(image.sourceGeometry?.x).toBeCloseTo(0.4);
    expect(image.keyframes?.sourceGeometry?.[0]?.value.rotation).toBe(-23);
    expect(image.keyframes?.sourceGeometry?.[0]?.value.crop).toEqual(
      geometry.crop
    );
    expect(
      mirrored.tracks.map((track) =>
        track.items.map((entry) => [entry.id, entry.start, entry.duration])
      )
    ).toEqual(
      original.tracks.map((track) =>
        track.items.map((entry) => [entry.id, entry.start, entry.duration])
      )
    );
  });

  it("mirrors twice back to original authored geometry and preserves legacy drafts", () => {
    const original = authoredProject();
    expect(original.mirrored).toBeUndefined();
    expect(PostProjectSchema.safeParse(original).success).toBe(true);
    const restored = mirrorPostProject(
      mirrorPostProject(original, { now: NOW + 1 }),
      { now: NOW + 2 }
    );
    expect(restored.mirrored).toBe(false);
    for (const initialTrack of original.tracks) {
      for (const initial of initialTrack.items) {
        const output = item(restored, initial.id);
        expect(output.box.x).toBeCloseTo(initial.box.x, 9);
        expect(output.box.turn).toBe(initial.box.turn);
        for (const channel of [
          "box",
          "opacity",
          "framing",
          "sourceGeometry",
        ] as const) {
          const before =
            initial.keyframes?.[channel as keyof typeof initial.keyframes];
          const after =
            output.keyframes?.[channel as keyof typeof output.keyframes];
          if (!Array.isArray(before) || !Array.isArray(after)) {
            expect(after).toEqual(before);
            continue;
          }
          expect(after.map((key) => [key.t, key.easing])).toEqual(
            before.map((key) => [key.t, key.easing])
          );
          expect(after).toHaveLength(before.length);
        }
        if (initial.kind === "video" && output.kind === "video") {
          expect(output.flip).toBe(initial.flip);
          expect(output.sourceGeometry?.x).toBeCloseTo(
            initial.sourceGeometry!.x,
            9
          );
          expect(output.sourceGeometry?.crop).toEqual(
            initial.sourceGeometry?.crop
          );
        }
      }
    }
  });

  it("compiles reflected camera and staff effect with the same flip", () => {
    const mirrored = mirrorPostProject(authoredProject(), { now: NOW + 1 });
    const compiled = compilePostProject(mirrored, { now: NOW + 1 })!;
    const camera = compiled.preset.clips.find((clip) => clip.id === "camera");
    const staff = compiled.preset.clips.find(
      (clip) => clip.id === "camera~staff"
    );
    expect(camera?.kind).toBe("visual");
    expect(staff?.kind).toBe("visual");
    if (camera?.kind !== "visual" || staff?.kind !== "visual") return;
    expect(camera.transform.flipHorizontal).toBe(true);
    expect(staff.transform).toEqual(camera.transform);
    expect(staff.sourceGeometry).toEqual(camera.sourceGeometry);
    expect(staff.sourceGeometryKeyframes).toEqual(
      camera.sourceGeometryKeyframes
    );
  });
});
