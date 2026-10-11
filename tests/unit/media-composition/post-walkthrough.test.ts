import { describe, expect, it } from "vitest";
import type {
  PostProject,
  PostTextItem,
  PostVideoItem,
} from "@austencloud/video-editor/core";
import { framingAt } from "@austencloud/video-editor/core";
import {
  WALKTHROUGH_TRACK_ID,
  buildWalkthrough,
  type WalkthroughCapture,
  type WalkthroughScript,
} from "#lib/shared/media-composition/domain/post-walkthrough.js";
import { rectToOutput } from "#lib/shared/media-composition/domain/walkthrough-camera.js";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "#lib/shared/media-composition/domain/post-project-ops.js";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import { NOW, project, take } from "./post-project-fixtures";

const ctx = editContext(NOW + 1);
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 2 };

const GENERATE = { x: 1480, y: 855, width: 170, height: 40 };
const level = (n: number) => ({
  x: 1130 + 170 * n,
  y: 34,
  width: 150,
  height: 30,
});
const TURN_CARD = { x: 1440, y: 470, width: 300, height: 110 };
const TURN_PLUS = { x: 1580, y: 510, width: 40, height: 30 };

const centre = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});
const event = (label: string, time: number, rect: typeof GENERATE) => ({
  label,
  action: "click",
  time,
  ...centre(rect),
  rect,
});

/** The Level stretch of take 2 of the Generate tutorial, with boxes. */
const CAPTURE: WalkthroughCapture = {
  viewport: VIEWPORT,
  events: [
    event("button.generate-button-card #0", 6.9, GENERATE),
    event("Level 1: Base Motions", 28.0, level(1)),
    event("button.generate-button-card #0", 33.5, GENERATE),
    event("Level 2: Whole Turns", 40.8, level(2)),
    event("button.generate-button-card #0", 43.7, GENERATE),
    event("Level 3: Half Turns, Floats", 51.0, level(3)),
    event("button.generate-button-card #0", 53.9, GENERATE),
    event("Increase Turn Intensity", 61.7, TURN_PLUS),
  ],
};

const SCRIPT: WalkthroughScript = {
  wideAfter: ["generate-button-card"],
  lines: [
    {
      click: "generate-button-card",
      after: 0.6,
      text: "Press Generate and the sequence appears.",
      chapter: "Generate",
    },
    {
      click: "Level 1",
      after: 0.2,
      text: "Level 1 uses base motions only, with no turns.",
      chapter: "Level",
    },
    {
      click: "Level 1",
      after: 2.6,
      sameClick: true,
      shot: "wide",
      include: TURN_CARD,
      text: "Without turns, the Turn Intensity card goes away.",
    },
    { click: "Level 2", after: 0.2, text: "Level 2 adds whole turns." },
    {
      click: "Level 3",
      after: 0.2,
      text: "Level 3 adds half turns and floats.",
    },
    {
      click: "Increase Turn Intensity",
      after: 0.2,
      text: "Turn Intensity caps the turns added in each step.",
      chapter: "Turn Intensity",
    },
  ],
};

function tutorial(canvas: PostProject["canvas"] = "16:9"): PostProject {
  return { ...project([], [], [take("t", 70)]), canvas };
}

function build(
  overrides: { capture?: WalkthroughCapture; script?: WalkthroughScript } = {},
  chapter: string | null = "Level",
  before = tutorial()
) {
  return buildWalkthrough(
    before,
    {
      takeId: "t",
      capture: overrides.capture ?? CAPTURE,
      script: overrides.script ?? SCRIPT,
      ...(chapter ? { chapter } : {}),
    },
    ctx
  );
}

const clipsOf = (p: PostProject) => p.tracks[0]!.items as PostVideoItem[];
const bubblesOf = (p: PostProject) =>
  p.tracks.find((track) => track.id === WALKTHROUGH_TRACK_ID)!
    .items as PostTextItem[];
const clipAt = (p: PostProject, s: number) =>
  clipsOf(p).find(
    (clip) => s >= clip.start && s <= clip.start + clip.duration
  )!;
const share = (rect: typeof GENERATE) => ({
  x: rect.x / 1920,
  y: rect.y / 1080,
  width: rect.width / 1920,
  height: rect.height / 1080,
});
const overlaps = (a: typeof GENERATE, b: typeof GENERATE) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe("buildWalkthrough", () => {
  it("cuts one chapter from 2 s before its first click to the next chapter's first move", () => {
    const { project: built, chapters } = build();
    const clips = clipsOf(built);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.sourceIn).toBeCloseTo(26);
    expect(clips[0]!.sourceOut).toBeCloseTo(61.7 - 1.1);
    expect(chapters.map((entry) => entry.name)).toEqual(["Level"]);
    const bubbles = bubblesOf(built);
    expect(bubbles.map((bubble) => bubble.text)).toEqual([
      "Level 1 uses base motions only, with no turns.",
      "Without turns, the Turn Intensity card goes away.",
      "Level 2 adds whole turns.",
      "Level 3 adds half turns and floats.",
    ]);
    expect(bubbles[0]!.label).toBe("Level");
    expect(bubbles.slice(1).every((bubble) => !bubble.label)).toBe(true);
    expect(chapters[0]!.seconds).toBeCloseTo(bubbles[0]!.start - 1.5);
  });

  it("starts wide, moves in on each click and keeps every key in bounds", () => {
    const clip = clipsOf(build().project)[0]!;
    const keys = clip.keyframes!.framing!;
    expect(keys[0]!.value.zoom).toBe(1);
    expect(Math.max(...keys.map((key) => key.value.zoom))).toBe(2);
    for (const key of keys) {
      expect(key.value.zoom).toBeGreaterThanOrEqual(1);
      expect(key.value.zoom).toBeLessThanOrEqual(2);
      expect(Math.abs(key.value.panX)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(key.value.panY)).toBeLessThanOrEqual(0.5);
    }
    // At the Level 1 press, the button is in view and close.
    const at = clip.start + (28 - clip.sourceIn);
    const framing = framingAt(clip, at);
    expect(framing.zoom).toBe(2);
    const button = rectToOutput(framing, share(level(1)));
    expect(button.x).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width).toBeLessThanOrEqual(1);
    expect(button.y).toBeGreaterThanOrEqual(0);
  });

  it("holds each bubble on a still camera, inside the frame and off its target", () => {
    const { project: built } = build();
    const targets = [level(1), TURN_CARD, level(2), level(3)];
    bubblesOf(built).forEach((bubble, index) => {
      const clip = clipAt(built, bubble.start);
      const end = bubble.start + bubble.duration;
      const still = framingAt(clip, bubble.start);
      expect(framingAt(clip, (bubble.start + end) / 2)).toEqual(still);
      expect(framingAt(clip, end)).toEqual(still);
      const { box } = bubble;
      expect(box.x).toBeGreaterThan(0);
      expect(box.y).toBeGreaterThan(0);
      expect(box.x + box.width).toBeLessThan(1);
      expect(box.y + box.height).toBeLessThan(1);
      expect(overlaps(box, rectToOutput(still, share(targets[index]!)))).toBe(
        false
      );
      // The tail aims at the click, or at the area the line talks about.
      const aim = rectToOutput(still, share(targets[index]!));
      expect(bubble.callout!.x).toBeCloseTo(aim.x + aim.width / 2);
    });
  });

  it("pulls out for a wide line before it shows", () => {
    const { project: built } = build();
    const wideLine = bubblesOf(built)[1]!;
    expect(framingAt(clipAt(built, wideLine.start), wideLine.start).zoom).toBe(
      1
    );
  });

  it("builds every chapter with each chapter's name on its first bubble", () => {
    const { project: built, chapters } = build({}, null);
    expect(chapters.map((entry) => entry.name)).toEqual([
      "Generate",
      "Level",
      "Turn Intensity",
    ]);
    const labels = bubblesOf(built)
      .map((bubble) => bubble.label)
      .filter(Boolean);
    expect(labels).toEqual(["Generate", "Level", "Turn Intensity"]);
  });

  it("keeps typed words through a rebuild", () => {
    const first = build().project;
    const bubbles = bubblesOf(first);
    const typed: PostProject = {
      ...first,
      tracks: first.tracks.map((track) =>
        track.id === WALKTHROUGH_TRACK_ID
          ? {
              ...track,
              items: track.items.map((item, index) =>
                index === 2 ? { ...item, text: "Whole turns now." } : item
              ),
            }
          : track
      ),
    };
    const rebuilt = build({}, "Level", typed).project;
    const again = bubblesOf(rebuilt);
    expect(again.map((bubble) => bubble.id)).toEqual(
      bubbles.map((bubble) => bubble.id)
    );
    expect(again[2]!.text).toBe("Whole turns now.");
    expect(clipsOf(rebuilt)).toHaveLength(1);
  });

  it("builds a take without boxes or a page size", () => {
    const bare: WalkthroughCapture = {
      events: CAPTURE.events.map(({ rect: _rect, ...rest }) => rest),
    };
    const { project: built } = build({ capture: bare });
    expect(bubblesOf(built)).toHaveLength(4);
    const keys = clipsOf(built)[0]!.keyframes!.framing!;
    expect(Math.max(...keys.map((key) => key.value.zoom))).toBe(2);
  });

  it("refuses a line inside a cut", () => {
    expect(() =>
      build({
        script: {
          ...SCRIPT,
          keep: [
            [0, 28.1],
            [29, 70],
          ],
        },
      })
    ).toThrow(/falls inside a cut/);
  });

  it("refuses a missing click, repeated words and the wrong shape", () => {
    const lines = SCRIPT.lines;
    expect(() =>
      build({
        script: { ...SCRIPT, lines: [{ ...lines[1]!, click: "Level 9" }] },
      })
    ).toThrow(/No click matching "Level 9"/);
    expect(() =>
      build({
        script: {
          ...SCRIPT,
          lines: [lines[1]!, { ...lines[3]!, text: lines[1]!.text }],
        },
      })
    ).toThrow(/Two lines say/);
    expect(() => build({}, "Level", tutorial("9:16"))).toThrow(
      /recording's shape/
    );
  });
});

describe("build-walkthrough op", () => {
  const op = (script: unknown, extra: object = {}) =>
    ({
      op: "build-walkthrough",
      take: "t",
      capture: { ...CAPTURE, id: "generate-tutorial", frames: [] },
      script,
      ...extra,
    }) as PostProjectOp;

  it("builds from the files as the command line sends them", () => {
    const next = applyPostProjectOps(
      tutorial(),
      [op(JSON.parse(JSON.stringify(SCRIPT)), { chapter: "Level" })],
      ctx
    );
    expect(bubblesOf(next)).toHaveLength(4);
  });

  it("says where a lines file goes wrong", () => {
    const broken = { lines: [{ ...SCRIPT.lines[0], after: "soon" }] };
    expect(() => applyPostProjectOps(tutorial(), [op(broken)], ctx)).toThrow(
      /Edit 1 \(build-walkthrough\): The lines file does not read: lines\.0\.after/
    );
  });
});
