import assert from "node:assert/strict";
import test from "node:test";
import {
  BOXES,
  MOVE_SECONDS,
  applyCut,
  keyframeTime,
  landingClock,
} from "./post-3d-cut.mjs";

// The DJII take: 50 bpm, beat one at 59.4265 s plus 0.3667 s, the footage
// from 69.7606 s at 1.3x.
const SECTION = { bpm: 50, beatOneSeconds: 59.42651864814732, offsetSeconds: 0.366666 };
const FOOTAGE = {
  id: "video-1",
  kind: "video",
  takeId: "take-1",
  start: 0,
  duration: (114.424 - 69.760618) / 1.3,
  sourceIn: 69.760618,
  sourceOut: 114.424,
  speed: 1.3,
  box: BOXES.top,
  fadeIn: 0,
  fadeOut: 0,
};

const close = (actual, expected, digits = 2) =>
  assert.ok(
    Math.abs(actual - expected) < 10 ** -digits,
    `${actual} is not ${expected}`
  );

test("landings sit on the take's grid, a beat apart in post time", () => {
  const L = landingClock(FOOTAGE, SECTION);
  close(L(0), 0.644);
  close(L(7), 7.10);
  close(L(15), 14.49);
  close(L(31), 29.26);
  close(L(34), 32.03);
  close(L(1) - L(0), 1.2 / 1.3, 6);
  // Landing 0 is the first grid beat in the footage, not one before it.
  assert.ok(L(0) >= 0 && L(-1) < 0);
});

test("a retap moves every landing with it", () => {
  const before = landingClock(FOOTAGE, SECTION);
  const after = landingClock(FOOTAGE, { ...SECTION, offsetSeconds: 0.366666 + 0.13 });
  close(after(7) - before(7), 0.1, 6);
});

test("footage keyframes run on its source clock", () => {
  close(keyframeTime(FOOTAGE, 10), 69.760618 + 13, 6);
  close(keyframeTime({ kind: "animation", start: 2 }, 10), 8, 6);
});

function project() {
  return {
    updatedAt: 1,
    timings: { "take-1": { sections: [SECTION] } },
    tracks: [
      {
        id: "main",
        items: [FOOTAGE, { id: "card-1", kind: "card", start: 37.056, duration: 11, fadeIn: 0.5 }],
      },
      {
        id: "track-2",
        items: [
          {
            id: "animation-2",
            kind: "animation",
            start: 0,
            duration: 17.2,
            followers: [{ beatsBehind: 0, mirror: true }],
            animationAppearance: { mandala: false, darkMode: true },
            stage3d: { shot: "orbit" },
          },
        ],
      },
      { id: "qr-track", items: [{ id: "animation-1", kind: "animation", start: 17.2 }, { id: "qr-1", kind: "image" }] },
    ],
  };
}

test("the cut replaces its own items, keeps the rest and is idempotent", () => {
  const once = applyCut(project(), 5).project;
  const twice = applyCut(once, 5).project;
  assert.deepEqual(twice, once);
  assert.equal(once.updatedAt, 5);
  assert.deepEqual(once.tracks.map((track) => track.id), ["main", "track-2", "qr-track", "inset-track"]);
  assert.deepEqual(once.tracks[2].items[1], { id: "qr-1", kind: "image" });
  assert.deepEqual(once.tracks[0].items[1], project().tracks[0].items[1]);
  assert.equal(once.tracks.flatMap((track) => track.items).length, 7);
});

test("the 3D and 2D clips trade the bottom half on the landings", () => {
  const cut = applyCut(project(), 5).project;
  const items = cut.tracks.flatMap((track) => track.items);
  const stage = items.find((item) => item.id === "animation-2");
  const notation = items.find((item) => item.id === "animation-1");
  const L = landingClock(FOOTAGE, SECTION);
  close(stage.start, L(1), 5);
  close(stage.start + stage.duration, 37.556, 5);
  assert.deepEqual(stage.stage3d, { shot: "orbit", spacing: 0.9, zoom: 0.6, elevation: 20 });
  close(notation.start, L(15) - MOVE_SECONDS, 5);
  close(notation.start + notation.duration, L(23), 5);
  assert.deepEqual(notation.followers, stage.followers);
  assert.equal(notation.animationAppearance.mandala, true);
  // Each box move ends on its landing.
  const ends = stage.keyframes.box
    .filter((frame) => frame.easing === "hold")
    .map((frame) => stage.start + frame.t);
  [L(7), L(15), L(31)].forEach((landing, index) => close(ends[index], landing, 5));
});

test("the inset copy shows the same source time as the footage under it", () => {
  const cut = applyCut(project(), 5).project;
  const footage = cut.tracks[0].items[0];
  for (const inset of cut.tracks[3].items) {
    const at = inset.start + 0.25;
    close(keyframeTime(inset, at), keyframeTime(footage, at), 5);
    assert.equal(inset.volume, 0);
  }
});
