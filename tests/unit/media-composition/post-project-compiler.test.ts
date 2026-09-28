import { describe, expect, it } from "vitest";
import {
  TEXT_ROLE_PREFIX,
  compilePostProject,
  itemIdFromClipId,
  itemIdFromStaffEffectRole,
  itemIdFromTextRole,
  staffEffectRole,
  textRole,
} from "$lib/shared/media-composition/domain/post-project-compiler";
import { MediaCompositionPresetSchema } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import {
  clampBox,
  wrapDegrees,
  type PostEasing,
} from "$lib/shared/media-composition/domain/post-project";
import {
  EASING_PRESETS,
  boxAt,
  framingAt,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  ANIMATION_OVERLAY_ROLE,
  stripRole,
  takeRole,
} from "$lib/shared/media-composition/domain/post-plan-compiler";
import { POST_STUDIO_ROLE } from "$lib/shared/media-composition/domain/post-studio-presets";
import { NOW, card, overlay, project, take, text, video } from "./post-project-fixtures";

const ctx = { now: NOW };

describe("compilePostProject", () => {
  describe("regions", () => {
    it("draws one clamped region per item, stacked in z-order by track", () => {
      const box = { x: 0.9, y: 0.9, width: 0.5, height: 0.5 };
      const result = compilePostProject(
        project([video("v1", { sourceOut: 4, box })], [[text("t1", 0, 2)]]),
        ctx
      )!;
      expect(result).not.toBeNull();

      const videoRegion = result.preset.regions.find((r) => r.id === "v1")!;
      expect(videoRegion).toEqual({
        id: "v1",
        label: "video",
        ...clampBox(box),
        zIndex: 10,
        fit: "cover",
        clipContent: true,
        respectSafeArea: false,
      });

      const textRegion = result.preset.regions.find((r) => r.id === "t1")!;
      expect(textRegion).toEqual({
        id: "t1",
        label: "text",
        x: 0.07,
        y: 0.05,
        width: 0.86,
        height: 0.14,
        zIndex: 20,
        fit: "fill",
        clipContent: true,
        respectSafeArea: false,
      });
    });

    it("skips every item on a hidden overlay track, and its duration", () => {
      const proj = project(
        [video("v1", { sourceOut: 5 })],
        [[text("t1", 8, 2)]]
      );
      proj.tracks[1] = { ...proj.tracks[1]!, hidden: true };

      const result = compilePostProject(proj, ctx)!;
      expect(result.preset.clips.some((c) => c.id === "t1")).toBe(false);
      expect(result.preset.regions.some((r) => r.id === "t1")).toBe(false);
      // t1 alone would push this to 10; it must not count while hidden.
      expect(result.durationSeconds).toBe(5);
    });
  });

  describe("video items", () => {
    it("skips a video whose take id is unknown, without disturbing the rest of the project", () => {
      const result = compilePostProject(
        project([
          video("v1", { takeId: "missing", sourceOut: 4 }),
          card("c1", 3, { start: 4 }),
        ]),
        ctx
      )!;
      expect(result).not.toBeNull();
      expect(result.preset.clips.some((c) => c.id === "v1")).toBe(false);
      expect(result.preset.regions.some((r) => r.id === "v1")).toBe(false);
      expect(result.takeIds).toEqual([]);
      expect(result.preset.clips).toHaveLength(1);
      // Only c1's own end counts; the skipped video's span is ignored.
      expect(result.durationSeconds).toBe(7);
    });
  });

  describe("staff effects", () => {
    it("adds no staff layer to a clip without an effect", () => {
      const result = compilePostProject(project([video("v1", { sourceOut: 4 })]), ctx)!;
      expect(result.preset.clips.map((c) => c.id)).toEqual(["v1"]);
    });

    it("lays the staff effect over its clip on the clip's own span, media time and framing", () => {
      const result = compilePostProject(
        project([
          video("v1", {
            sourceIn: 2,
            sourceOut: 6,
            speed: 0.5,
            zoom: 1.5,
            panX: 0.2,
            rotation: 90,
            flip: true,
            opacity: 0.8,
            fadeIn: 0.5,
            staffEffect: { effect: "sparkles" },
          }),
        ]),
        ctx
      )!;
      expect(MediaCompositionPresetSchema.safeParse(result.preset).success).toBe(true);
      const clip = result.preset.clips.find((c) => c.id === "v1")!;
      const staff = result.preset.clips.find((c) => c.id === "v1~staff")!;
      expect(itemIdFromClipId(staff.id)).toBe("v1");
      expect(staff).toMatchObject({
        kind: "visual",
        sourceRole: staffEffectRole("v1"),
        useResolvedTimeMap: false,
      });
      for (const key of [
        "regionId",
        "start",
        "end",
        "sourceIn",
        "sourceOut",
        "playbackRate",
        "opacity",
        "fadeInSeconds",
        "transform",
      ] as const) {
        expect(staff[key as keyof typeof staff]).toEqual(clip[key as keyof typeof clip]);
      }
      // Drawn above the footage in the same slot.
      const order = result.preset.clips.map((c) => c.id);
      expect(order.indexOf("v1~staff")).toBeGreaterThan(order.indexOf("v1"));
      expect(result.preset.sourceRoles.some((r) => r.key === staffEffectRole("v1"))).toBe(
        true
      );

      // Halfway through the slowed clip, the layer reads the same media time
      // as the footage under it.
      const layers = evaluatePresetFrame(result.preset, result.durationSeconds, 4);
      const footage = layers.find((l) => l.clipId === "v1")!;
      const effect = layers.find((l) => l.clipId === "v1~staff")!;
      expect(effect.sourceTimeSeconds).toBeCloseTo(footage.sourceTimeSeconds, 6);
      expect(effect.sourceTimeSeconds).toBeCloseTo(4, 6);
      expect(effect.transform).toEqual(footage.transform);
    });
  });

  describe("sequence layers split at main-track video edges", () => {
    it("maps each piece to the take, source span and rate of the main clip covering it", () => {
      const v1 = video("v1", { takeId: "a", sourceIn: 0, sourceOut: 4, speed: 1 });
      const v2 = video("v2", {
        takeId: "b",
        sourceIn: 10,
        sourceOut: 16,
        speed: 2,
        start: 4,
      }); // (16-10)/2 = 3s -> spans [4, 7)
      const anim = overlay("ov", "animation", { start: 0, duration: 7 });

      const result = compilePostProject(
        project([v1, v2], [[anim]], [take("a"), take("b")]),
        ctx
      )!;
      expect(result).not.toBeNull();

      const piece0 = result.preset.clips.find((c) => c.id === "ov~0")!;
      const piece1 = result.preset.clips.find((c) => c.id === "ov~1")!;

      expect(piece0).toMatchObject({
        sourceRole: POST_STUDIO_ROLE.animation,
        regionId: "ov",
        start: { unit: "seconds", value: 0 },
        end: { unit: "seconds", value: 4 },
        sourceIn: { unit: "seconds", value: 0 },
        sourceOut: { unit: "seconds", value: 4 },
        playbackRate: 1,
        useResolvedTimeMap: true,
        timeMapRole: takeRole("a"),
      });
      expect(piece1).toMatchObject({
        sourceRole: POST_STUDIO_ROLE.animation,
        regionId: "ov",
        start: { unit: "seconds", value: 4 },
        end: { unit: "seconds", value: 7 },
        sourceIn: { unit: "seconds", value: 10 },
        sourceOut: { unit: "seconds", value: 16 },
        playbackRate: 2,
        useResolvedTimeMap: true,
        timeMapRole: takeRole("b"),
      });

      // One region for the whole layer, not one per piece.
      expect(result.preset.regions.filter((r) => r.id === "ov")).toHaveLength(1);
      expect(result.durationSeconds).toBe(7);
      expect(result.takeIds).toEqual(["a", "b"]);
      expect(result.videoSegments).toEqual([
        {
          itemId: "v1",
          takeId: "a",
          trackIndex: 0,
          startSeconds: 0,
          endSeconds: 4,
          sourceIn: 0,
          sourceOut: 4,
          speed: 1,
          volume: 1,
        },
        {
          itemId: "v2",
          takeId: "b",
          trackIndex: 0,
          startSeconds: 4,
          endSeconds: 7,
          sourceIn: 10,
          sourceOut: 16,
          speed: 2,
          volume: 1,
        },
      ]);
    });

    it("holds a piece's opening pose over a card or a gap instead of reading a move from nothing", () => {
      const c1 = card("c1", 3); // [0, 3)
      const v1 = video("v1", { sourceOut: 4, start: 3 }); // [3, 7)
      const anim = overlay("ov", "animation", {
        start: 0,
        duration: 7,
        fadeIn: 0.3,
        fadeOut: 0.2,
      });

      const result = compilePostProject(project([c1, v1], [[anim]]), ctx)!;
      const piece0 = result.preset.clips.find((c) => c.id === "ov~0")!;
      const piece1 = result.preset.clips.find((c) => c.id === "ov~1")!;

      expect(piece0).toMatchObject({
        start: { unit: "seconds", value: 0 },
        end: { unit: "seconds", value: 3 },
        sourceIn: { unit: "seconds", value: 0 },
        sourceOut: { unit: "seconds", value: 3 },
        playbackRate: 1,
        useResolvedTimeMap: false,
        fadeInSeconds: 0.3,
      });
      expect(piece0).not.toHaveProperty("timeMapRole");
      expect(piece0).not.toHaveProperty("fadeOutSeconds");

      expect(piece1).toMatchObject({
        start: { unit: "seconds", value: 3 },
        end: { unit: "seconds", value: 7 },
        useResolvedTimeMap: true,
        timeMapRole: takeRole("a"),
        fadeOutSeconds: 0.2,
      });
      expect(piece1).not.toHaveProperty("fadeInSeconds");
    });

    it("keeps opacity continuous across a cut that falls inside the item's fade-in", () => {
      const v1 = video("v1", { sourceOut: 10 }); // [0, 10)
      const v2 = video("v2", { start: 10, sourceOut: 13 }); // [10, 13)
      // Whole item spans [9.5, 13) with a 1s fade-in; the cut at 10 falls
      // inside that fade, so both pieces must share one continuous ramp.
      const anim = overlay("ov", "animation", { start: 9.5, duration: 3.5, fadeIn: 1 });

      const result = compilePostProject(project([v1, v2], [[anim]]), ctx)!;
      expect(result).not.toBeNull();

      const layerAt = (seconds: number, clipId: string) =>
        evaluatePresetFrame(result.preset, result.durationSeconds, seconds).find(
          (layer) => layer.clipId === clipId
        );

      const beforeCut = layerAt(9.99, "ov~0")!;
      const afterCut = layerAt(10.01, "ov~1")!;
      expect(Math.abs(afterCut.opacity - beforeCut.opacity)).toBeLessThan(0.05);

      // A full second after the whole item's own start, the fade is done.
      expect(layerAt(10.5, "ov~1")!.opacity).toBeCloseTo(1, 5);
    });

    it("still uses a hidden or unknown-take main video's own timing to split pieces", () => {
      const proj = project([], [[overlay("ov", "animation", { start: 0, duration: 4 })]]);
      proj.tracks[0] = {
        ...proj.tracks[0]!,
        items: [video("v1", { sourceOut: 4, takeId: "ghost" })],
        hidden: true,
      };

      const result = compilePostProject(proj, ctx)!;
      expect(result).not.toBeNull();
      // The hidden video draws nothing of its own...
      expect(result.preset.regions.some((r) => r.id === "v1")).toBe(false);
      expect(result.preset.clips.some((c) => c.id === "v1")).toBe(false);
      // ...but the overlay's one piece still reads its span and take role.
      const piece = result.preset.clips.find((c) => c.id === "ov~0")!;
      expect(piece).toMatchObject({
        useResolvedTimeMap: true,
        timeMapRole: takeRole("ghost"),
        sourceIn: { unit: "seconds", value: 0 },
        sourceOut: { unit: "seconds", value: 4 },
      });
      expect(result.durationSeconds).toBe(4);
    });

    it("keys a moves layer's role by its strip mode, and a carousel layer by its own fixed key", () => {
      const result = compilePostProject(
        project(
          [video("v1", { sourceOut: 5 })],
          [
            [overlay("moves1", "moves", { start: 0, duration: 5, mode: "mandala" })],
            [overlay("car1", "carousel", { start: 0, duration: 5 })],
          ]
        ),
        ctx
      )!;

      const movesClip = result.preset.clips.find((c) => c.id === "moves1~0")!;
      const carouselClip = result.preset.clips.find((c) => c.id === "car1~0")!;
      expect(movesClip.sourceRole).toBe(stripRole("mandala"));
      expect(carouselClip.sourceRole).toBe(POST_STUDIO_ROLE.carousel);

      const movesRole = result.preset.sourceRoles.find(
        (r) => r.key === stripRole("mandala")
      )!;
      expect(movesRole.acceptedKinds).toEqual(["sequence-animation"]);
      const carouselRole = result.preset.sourceRoles.find(
        (r) => r.key === POST_STUDIO_ROLE.carousel
      )!;
      expect(carouselRole.acceptedKinds).toEqual(["beat-carousel"]);
    });
  });

  describe("animation overlay clips", () => {
    const proj = () =>
      project(
        [video("v1", { sourceOut: 5 })],
        [[overlay("ov", "animation", { start: 0, duration: 5, overlay: true })]]
      );

    it("are left out unless the host asks for them", () => {
      const result = compilePostProject(proj(), ctx)!;
      expect(result.preset.clips.some((c) => c.id.endsWith(":overlay"))).toBe(false);
      expect(
        result.preset.sourceRoles.some((r) => r.key === ANIMATION_OVERLAY_ROLE)
      ).toBe(false);
    });

    it("add one overlay clip per piece, sharing the piece's region and timing", () => {
      const result = compilePostProject(proj(), { ...ctx, animationOverlay: true })!;
      const base = result.preset.clips.find((c) => c.id === "ov~0")!;
      const overlayClip = result.preset.clips.find((c) => c.id === "ov~0:overlay")!;
      expect(overlayClip).toMatchObject({
        sourceRole: ANIMATION_OVERLAY_ROLE,
        regionId: "ov",
        start: base.start,
        end: base.end,
      });
      expect(
        result.preset.sourceRoles.some((r) => r.key === ANIMATION_OVERLAY_ROLE)
      ).toBe(true);
    });
  });

  describe("text items", () => {
    it("produces a clip, a region and a CompiledTextItem for drawn text", () => {
      const result = compilePostProject(
        project([card("c1", 5)], [[text("t1", 1, 2, { text: "Hello", size: "l" })]]),
        ctx
      )!;
      expect(result.texts).toEqual([
        {
          itemId: "t1",
          role: textRole("t1"),
          text: "Hello",
          size: "l",
          box: { x: 0.07, y: 0.05, width: 0.86, height: 0.14 },
          startSeconds: 1,
          endSeconds: 3,
        },
      ]);
      const clip = result.preset.clips.find((c) => c.id === "t1")!;
      expect(clip.sourceRole).toBe(textRole("t1"));
      expect(clip.useResolvedTimeMap).toBe(false);
      const region = result.preset.regions.find((r) => r.id === "t1")!;
      expect(region.fit).toBe("fill");
    });

    it("skips a blank text item", () => {
      const result = compilePostProject(
        project([card("c1", 5)], [[text("t1", 1, 2, { text: "   " })]]),
        ctx
      )!;
      expect(result.texts).toEqual([]);
      expect(result.preset.clips.some((c) => c.id === "t1")).toBe(false);
    });
  });

  describe("nothing drawn", () => {
    it("returns null for a project with no items", () => {
      expect(compilePostProject(project([]), ctx)).toBeNull();
    });

    it("returns null when the only item is blank text", () => {
      expect(
        compilePostProject(project([], [[text("t1", 0, 2, { text: "" })]]), ctx)
      ).toBeNull();
    });
  });

  describe("the compiled preset", () => {
    it("validates against MediaCompositionPresetSchema", () => {
      const result = compilePostProject(
        project(
          [video("v1", { sourceOut: 4 }), card("c1", 3, { start: 4 })],
          [
            [overlay("ov", "animation", { start: 0, duration: 7 })],
            [text("t1", 0, 2)],
          ]
        ),
        { ...ctx, animationOverlay: true }
      )!;
      expect(MediaCompositionPresetSchema.safeParse(result.preset).success).toBe(true);
    });
  });

  describe("keyframes", () => {
    const LINEAR: PostEasing = [0, 0, 1, 1];

    /** `clip.motion`, narrowed past the visual/audio clip union for the test. */
    function motionOf(
      result: NonNullable<ReturnType<typeof compilePostProject>>,
      id: string
    ): unknown {
      const clip = result.preset.clips.find((c) => c.id === id);
      return (clip as { motion?: unknown } | undefined)?.motion;
    }

    it("carries a video's framing and opacity keyframes into motion, in post seconds", () => {
      const result = compilePostProject(
        project([
          video("v1", {
            sourceOut: 10,
            keyframes: {
              framing: [
                { t: 0, value: { zoom: 1, panX: 0, panY: 0, rotation: 0 }, easing: "hold" },
                { t: 5, value: { zoom: 2, panX: 0.1, panY: -0.1, rotation: 90 }, easing: LINEAR },
              ],
              opacity: [
                { t: 0, value: 0, easing: "hold" },
                { t: 2, value: 1, easing: LINEAR },
              ],
            },
          }),
        ]),
        ctx
      )!;

      expect(motionOf(result, "v1")).toEqual({
        transform: [
          {
            atSeconds: 0,
            value: { scale: 1, rotationDegrees: 0, translateX: 0, translateY: 0 },
            easing: "hold",
          },
          {
            atSeconds: 5,
            value: { scale: 2, rotationDegrees: 90, translateX: 0.1, translateY: -0.1 },
            easing: LINEAR,
          },
        ],
        opacity: [
          { atSeconds: 0, value: 0, easing: "hold" },
          { atSeconds: 2, value: 1, easing: LINEAR },
        ],
      });
    });

    it("emits a video's box keyframes as a regionKeyframes track keyed by its own item id", () => {
      const result = compilePostProject(
        project([
          video("v1", {
            sourceOut: 10,
            keyframes: {
              box: [
                { t: 1, value: { x: 0, y: 0, width: 0.5, height: 0.5 }, easing: "hold" },
              ],
            },
          }),
        ]),
        ctx
      )!;

      const track = result.preset.regionKeyframes?.find((r) => r.regionId === "v1");
      expect(track).toEqual({
        regionId: "v1",
        keyframes: [
          {
            atSeconds: 1,
            value: { x: 0, y: 0, width: 0.5, height: 0.5 },
            easing: "hold",
          },
        ],
      });
    });

    it("keeps a card's opacity keyframes but never gives it a transform track", () => {
      const result = compilePostProject(
        project([
          video("v1", { sourceOut: 4 }),
          card("c1", 5, {
            start: 4,
            keyframes: {
              opacity: [
                { t: 0, value: 0.2, easing: "hold" },
                { t: 3, value: 1, easing: LINEAR },
              ],
            },
          }),
        ]),
        ctx
      )!;

      // Card content-time is seconds from the item's own start (4), unlike a
      // video's take-media clock, so t=0/t=3 land at post seconds 4 and 7.
      expect(motionOf(result, "c1")).toEqual({
        opacity: [
          { atSeconds: 4, value: 0.2, easing: "hold" },
          { atSeconds: 7, value: 1, easing: LINEAR },
        ],
      });
    });

    it("adds no motion and no regionKeyframes entry for an unanimated item", () => {
      const result = compilePostProject(
        project([card("c1", 5)]),
        ctx
      )!;

      expect(motionOf(result, "c1")).toBeUndefined();
      expect(result.preset.regionKeyframes).toBeUndefined();
    });

    it("plays an overshooting zoom and box move exactly as the editor samples them", () => {
      const overshoot = EASING_PRESETS.overshoot;
      const clip = video("v1", {
        sourceOut: 10,
        keyframes: {
          framing: [
            { t: 0, value: { zoom: 1, panX: 0, panY: 0, rotation: 0 }, easing: overshoot },
            { t: 10, value: { zoom: 4, panX: 0.5, panY: 0, rotation: 0 }, easing: LINEAR },
          ],
          box: [
            { t: 0, value: { x: 0, y: 0, width: 0.5, height: 0.5 }, easing: overshoot },
            { t: 10, value: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, easing: LINEAR },
          ],
        },
      });
      const result = compilePostProject(project([clip]), ctx)!;

      // Past the curve's peak, the unclamped move would leave both ranges.
      for (const seconds of [2, 6.4, 8]) {
        const layer = evaluatePresetFrame(
          result.preset,
          result.durationSeconds,
          seconds
        ).find((candidate) => candidate.clipId === "v1")!;
        const framing = framingAt(clip, seconds);
        expect(layer.transform.scale).toBeCloseTo(framing.zoom, 9);
        expect(layer.transform.translateX).toBeCloseTo(framing.panX, 9);
        const box = boxAt(clip, seconds);
        const rect = layer.regionRect!;
        expect(rect.x).toBeCloseTo(box.x, 9);
        expect(rect.y).toBeCloseTo(box.y, 9);
        expect(rect.width).toBeCloseTo(box.width, 9);
        expect(rect.height).toBeCloseTo(box.height, 9);
      }
      expect(framingAt(clip, 6.4).zoom).toBe(4);
    });

    it("turns across -180..180 the short way, as the editor does", () => {
      const at = (rotation: number) => ({ zoom: 1, panX: 0, panY: 0, rotation });
      const clip = video("v1", {
        sourceOut: 10,
        keyframes: {
          framing: [
            { t: 0, value: at(-180), easing: LINEAR },
            { t: 4, value: at(175), easing: LINEAR },
            { t: 6, value: at(180), easing: LINEAR },
            { t: 10, value: at(-90), easing: LINEAR },
          ],
        },
      });
      const result = compilePostProject(project([clip]), ctx)!;

      let previous: number | null = null;
      for (let seconds = 0; seconds <= 10; seconds += 0.5) {
        const layer = evaluatePresetFrame(
          result.preset,
          result.durationSeconds,
          seconds
        ).find((candidate) => candidate.clipId === "v1")!;
        const turn = layer.transform.rotationDegrees;
        expect(wrapDegrees(turn - framingAt(clip, seconds).rotation)).toBeCloseTo(0, 6);
        // Half a second never turns it more than the keys ask for.
        if (previous !== null) {
          expect(Math.abs(wrapDegrees(turn - previous))).toBeLessThanOrEqual(12);
        }
        previous = turn;
      }
    });
  });

  describe("clip and text role ids", () => {
    it("round-trips a text role to its item id", () => {
      const role = textRole("t1");
      expect(role).toBe(`${TEXT_ROLE_PREFIX}t1`);
      expect(itemIdFromTextRole(role)).toBe("t1");
      expect(itemIdFromTextRole("take:a")).toBeNull();
    });

    it("round-trips a staff effect role to its item id", () => {
      expect(itemIdFromStaffEffectRole(staffEffectRole("v1"))).toBe("v1");
      expect(itemIdFromStaffEffectRole(textRole("v1"))).toBeNull();
    });

    it("recovers an item id from a plain, a piece, or an overlay piece clip id", () => {
      expect(itemIdFromClipId("v1")).toBe("v1");
      expect(itemIdFromClipId("ov~0")).toBe("ov");
      expect(itemIdFromClipId("ov~0:overlay")).toBe("ov");
    });
  });
});
