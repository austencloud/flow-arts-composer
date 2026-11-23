import { describe, expect, it } from "vitest";
import {
  LoopRunSettingsSchema,
  loopRunBadgeAt,
  loopRunDefaultEvents,
  loopRunFrame,
  loopRunLength,
  loopRunPlanOf,
  loopRunShape,
  loopRunTurnDegrees,
  loopTilePlace,
  sourceOf,
  type LoopRunSettings,
} from "./loop-run";
import { engineStepsOf, sequenceFromEngineSteps } from "./loop-run-sequence";

const RECT = { x: 0, y: 0, width: 1080, height: 1920 };

const settings = (over: Partial<LoopRunSettings>): LoopRunSettings =>
  LoopRunSettingsSchema.parse({ seed: 2, change: "reflected", layout: "pairs", colour: "#6F2DA8", events: [], ...over });

describe("loop run layouts", () => {
  it("lays a repetition out as one row, read left to right", () => {
    const shape = loopRunShape({ seed: 2 }, 8);
    const places = [0, 1, 2, 3].map((s) => loopTilePlace("rows", "rotated", shape, RECT, s));
    expect(places[0]!.x).toBeLessThan(places[1]!.x);
    expect(places[0]!.y).toBe(places[1]!.y);
    expect(places[2]!.y).toBeGreaterThan(places[0]!.y);
    expect(places[2]!.x).toBe(places[0]!.x);
  });

  it("keeps every tile inside the frame in each layout", () => {
    const shape = loopRunShape({ seed: 2 }, 8);
    for (const layout of ["ring", "rows", "pairs", "line", "card"] as const)
      for (let s = 0; s < 8; s++) {
        const p = loopTilePlace(layout, "rotated", shape, RECT, s);
        expect(p.x - p.size / 2).toBeGreaterThanOrEqual(-0.5);
        expect(p.x + p.size / 2).toBeLessThanOrEqual(RECT.width + 0.5);
        expect(p.y - p.size / 2).toBeGreaterThanOrEqual(-0.5);
        expect(p.y + p.size / 2).toBeLessThanOrEqual(RECT.height + 0.5);
      }
  });

  it("sits each rewound step beside the one it undoes", () => {
    const shape = loopRunShape({ seed: 2 }, 4);
    expect(sourceOf("rewound", shape, 2)).toBe(1);
    expect(sourceOf("rewound", shape, 3)).toBe(0);
    const twin = loopTilePlace("pairs", "rewound", shape, RECT, 2);
    expect(twin.y).toBe(loopTilePlace("pairs", "rewound", shape, RECT, 1).y);
  });

  it("starts the ring just right of its top and goes clockwise", () => {
    const shape = loopRunShape({ seed: 2 }, 8);
    const first = loopTilePlace("ring", "rotated", shape, RECT, 0);
    const second = loopTilePlace("ring", "rotated", shape, RECT, 1);
    expect(first.x).toBeGreaterThan(RECT.width / 2);
    expect(first.y).toBeLessThan(RECT.height / 2);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });
});

describe("loop run frames", () => {
  it("brings a reflected repeat in through the line and lands it in its place", () => {
    const run = settings({ events: loopRunDefaultEvents("reflected", "pairs", 4, 2) });
    const before = loopRunFrame(run, 4, RECT, 3.0);
    expect(before.tiles[2]!.opacity).toBe(0);
    expect(before.copies).toHaveLength(0);
    const midway = loopRunFrame(run, 4, RECT, 4.0);
    const copy = midway.copies.find((c) => c.to === 2)!;
    expect(copy.from).toBe(0);
    expect(copy.flip).toBeLessThan(1);
    expect(copy.flip).toBeGreaterThan(-1);
    const landed = loopRunFrame(run, 4, RECT, 5.05);
    expect(landed.tiles[2]!.opacity).toBe(1);
    expect(landed.copies).toHaveLength(0);
    expect(landed.tiles[2]!.outline).toBe(1);
    expect(landed.tiles[0]!.outline).toBe(0);
  });

  it("parts the pictures sideways before bringing them level into one row", () => {
    const run = settings({ events: loopRunDefaultEvents("reflected", "pairs", 4, 2) });
    const start = loopRunFrame(run, 4, RECT, 5.1).tiles[1]!;
    const early = loopRunFrame(run, 4, RECT, 5.1 + 1.2 * 0.3).tiles[1]!;
    const end = loopRunFrame(run, 4, RECT, 6.4).tiles[1]!;
    expect(Math.abs(early.x - start.x)).toBeGreaterThan(0);
    expect(early.y).toBe(start.y);
    const row = [0, 1, 2, 3].map((s) => loopRunFrame(run, 4, RECT, 6.4).tiles[s]!);
    expect(new Set(row.map((tile) => Math.round(tile.y))).size).toBe(1);
    expect(row.map((tile) => tile.x)).toEqual([...row.map((tile) => tile.x)].sort((a, b) => a - b));
    expect(end.y).toBe(row[0]!.y);
  });

  it("closes the row up into one card, then brings the start position in above the first step", () => {
    const run = settings({ events: loopRunDefaultEvents("reflected", "pairs", 4, 2) });
    const moving = loopRunFrame(run, 4, RECT, 5.1 + 0.6);
    expect(moving.start).toBeNull();
    const rest = loopRunFrame(run, 4, RECT, 8);
    const row = rest.tiles;
    for (let s = 1; s < 4; s++) expect(row[s]!.x - row[s - 1]!.x).toBeCloseTo(row[0]!.size, 6);
    expect(row.every((tile) => tile.corner === 0)).toBe(true);
    expect(rest.start).not.toBeNull();
    expect(rest.start!.opacity).toBe(1);
    expect(rest.start!.x).toBeCloseTo(row[0]!.x, 6);
    expect(row[0]!.y - rest.start!.y).toBeCloseTo(row[0]!.size, 6);
    expect(loopRunFrame(run, 4, RECT, 2).tiles[0]!.corner).toBe(1);
  });

  it("keeps rows outside the view unseen until the view grows to them", () => {
    const run = settings({
      change: "rotated",
      layout: "rows",
      events: [{ kind: "view", at: 0, duration: 0, rows: [0, 1] }, { kind: "view", at: 4, duration: 1, rows: [0, 3] }],
    });
    const before = loopRunFrame(run, 8, RECT, 2).tiles;
    expect(before[2]!.opacity).toBe(1);
    expect(before[4]!.opacity).toBe(0);
    expect(loopRunFrame(run, 8, RECT, 6).tiles[6]!.opacity).toBe(1);
  });

  it("keeps the room above and below clear of pictures", () => {
    const run = settings({ change: "rotated", layout: "rows", room: { top: 0.2, bottom: 0.1 } });
    for (const tile of loopRunFrame(run, 8, RECT, 0).tiles) {
      expect(tile.y - tile.size / 2).toBeGreaterThanOrEqual(RECT.height * 0.2 - 0.5);
      expect(tile.y + tile.size / 2).toBeLessThanOrEqual(RECT.height * 0.9 + 0.5);
    }
  });

  it("clears an inverted run, then performs each row with arrows coming in on the move", () => {
    const run = settings({ change: "inverted", events: loopRunDefaultEvents("inverted", "pairs", 4, 2) });
    expect(loopRunFrame(run, 4, RECT, 6.2).tiles[0]!.props).toBeNull();
    const moving = loopRunFrame(run, 4, RECT, 6.4 + 0.675).tiles;
    expect(moving[0]!.props!.progress).toBeGreaterThan(0);
    expect(moving[0]!.props!.progress).toBeLessThan(1);
    expect(moving[2]!.props!.progress).toBe(moving[0]!.props!.progress);
    expect(moving[0]!.arrows).toBe(moving[0]!.props!.progress);
    expect(moving[1]!.props).toBeNull();
  });

  it("carries each staff on from the tile before before the step is performed", () => {
    const run = settings({ change: "rotated", layout: "rows", events: loopRunDefaultEvents("rotated", "rows", 4, 2) });
    const sliding = loopRunFrame(run, 4, RECT, 2.5);
    expect(sliding.ghosts).toHaveLength(1);
    expect(sliding.ghosts[0]!.step).toBe(0);
    const waiting = loopRunFrame(run, 4, RECT, 2.85).tiles[1]!;
    expect(waiting.props).toEqual({ step: 1, progress: 0, opacity: 1 });
    expect(waiting.arrows).toBe(0);
  });

  it("turns a rotated repeat a quarter round the ring and marks home", () => {
    const run = settings({ change: "rotated", layout: "ring", events: loopRunDefaultEvents("rotated", "ring", 8, 2) });
    const copy = loopRunFrame(run, 8, RECT, 3.8, 90).copies[0]!;
    expect(copy.turn).toBeGreaterThan(0);
    expect(copy.turn).toBeLessThan(90);
    expect(loopRunFrame(run, 8, RECT, 1).home!.opacity).toBeCloseTo(0.35);
    expect(loopRunFrame(run, 8, RECT, 12).home!.opacity).toBeCloseTo(1);
    expect(loopRunLength(run, 8)).toBeGreaterThan(12);
  });

  it("reads the turn from where the first step of two passes starts", () => {
    expect(loopRunTurnDegrees(["e", "s"])).toBe(90);
    expect(loopRunTurnDegrees(["n", "e"])).toBe(90);
    expect(loopRunTurnDegrees(["e", "n"])).toBe(-90);
  });
});

describe("loop run play", () => {
  const STAGE = { x: 0.5, y: 970 / 1920, size: 560 / 1080 };
  const played = (over: Partial<LoopRunSettings> = {}) =>
    settings({
      layout: "card",
      events: [{ kind: "play", at: 6, duration: 6, rounds: 2, stage: STAGE }],
      ...over,
    });

  it("draws nothing on the stage until the play is near", () => {
    expect(loopRunFrame(played(), 4, RECT, 5).stage).toBeNull();
    expect(loopRunFrame(settings({}), 4, RECT, 8).stage).toBeNull();
  });

  it("fades the stage in with the props at home, where the stage says", () => {
    const stage = loopRunFrame(played(), 4, RECT, 5.8).stage!;
    expect(stage.opacity).toBeGreaterThan(0);
    expect(stage.opacity).toBeLessThan(1);
    expect(stage.props).toEqual({ step: -1, progress: 1, continued: false });
    expect(stage.x).toBeCloseTo(540, 6);
    expect(stage.y - stage.size / 2).toBeCloseTo(690, 6);
    expect(stage.size).toBeCloseTo(560, 6);
  });

  it("plays every step in order at an even pace, linear inside a step", () => {
    const at = (t: number) => loopRunFrame(played(), 4, RECT, t).stage!.props;
    expect(at(6)).toEqual({ step: 0, progress: 0, continued: false });
    expect(at(6 + 0.375).progress).toBeCloseTo(0.5, 6);
    expect(at(6 + 0.75 * 2 + 0.15)).toMatchObject({ step: 2 });
    expect(at(6 + 0.75 * 2 + 0.15).progress).toBeCloseTo(0.2, 6);
  });

  it("goes round again without a pause: a round's end runs straight into the next", () => {
    const at = (t: number) => loopRunFrame(played(), 4, RECT, t).stage!.props;
    const end = at(9 - 1e-6);
    expect(end.step).toBe(3);
    expect(end.progress).toBeCloseTo(1, 4);
    const next = at(9 + 1e-6);
    expect(next.step).toBe(0);
    expect(next.progress).toBeCloseTo(0, 4);
    // The second round's first step starts where the last step left the props, not at the start position.
    expect(end.continued).toBe(false);
    expect(next.continued).toBe(true);
  });

  it("starts the fade where the play says, and is whole by 0.4 s later", () => {
    const run = played({ events: [{ kind: "play", at: 6.6, from: 5.9, duration: 6, stage: STAGE }] });
    expect(loopRunFrame(run, 4, RECT, 5.85).stage).toBeNull();
    expect(loopRunFrame(run, 4, RECT, 6.1).stage!.opacity).toBeGreaterThan(0);
    expect(loopRunFrame(run, 4, RECT, 6.3).stage!.opacity).toBe(1);
    expect(loopRunFrame(run, 4, RECT, 6.5).stage!.props).toEqual({ step: -1, progress: 1, continued: false });
  });

  it("rests at home after the last round", () => {
    expect(loopRunFrame(played(), 4, RECT, 13).stage!.props).toEqual({ step: 3, progress: 1, continued: true });
  });

  it("puts the gold ring on the box of the tile being played, at full strength", () => {
    const frame = loopRunFrame(played(), 4, RECT, 6 + 0.75 + 0.4);
    const tile = frame.tiles[1]!;
    expect(frame.stage!.rings).toEqual([
      { x: tile.x - tile.size / 2, y: tile.y - tile.size / 2, width: tile.size, height: tile.size, strength: 1 },
    ]);
  });

  it("cross-fades the ring to the next tile over 0.12 s, without sliding", () => {
    const frame = loopRunFrame(played(), 4, RECT, 6 + 0.75 + 0.06);
    const [before, now] = frame.stage!.rings;
    expect(before!.x).toBeCloseTo(frame.tiles[0]!.x - frame.tiles[0]!.size / 2, 6);
    expect(now!.x).toBeCloseTo(frame.tiles[1]!.x - frame.tiles[1]!.size / 2, 6);
    expect(before!.strength).toBeCloseTo(0.5, 6);
    expect(now!.strength).toBeCloseTo(0.5, 6);
    expect(loopRunFrame(played(), 4, RECT, 6 + 0.75 + 0.12).stage!.rings).toHaveLength(1);
    // Round two's first step takes the ring back from the last tile.
    const round = loopRunFrame(played(), 4, RECT, 9 + 0.03).stage!.rings;
    expect(round[0]!.x).toBeCloseTo(frame.tiles[3]!.x - frame.tiles[3]!.size / 2, 6);
    expect(round[1]!.x).toBeCloseTo(frame.tiles[0]!.x - frame.tiles[0]!.size / 2, 6);
  });

  it("fades the ring in with the stage and out over 0.3 s after the last round, and leaves it off when asked", () => {
    const run = played({ events: [{ kind: "play", at: 6.6, from: 5.9, duration: 6, stage: STAGE }] });
    const fading = loopRunFrame(run, 4, RECT, 6.1).stage!;
    expect(fading.rings[0]!.strength).toBeCloseTo(fading.opacity, 6);
    expect(loopRunFrame(run, 4, RECT, 12.6 + 0.15).stage!.rings[0]!.strength).toBeCloseTo(0.5, 6);
    expect(loopRunFrame(run, 4, RECT, 12.6 + 0.3).stage!.rings).toEqual([]);
    const off = played({ events: [{ kind: "play", at: 6, duration: 6, stage: STAGE, marker: false }] });
    expect(loopRunFrame(off, 4, RECT, 7).stage!.rings).toEqual([]);
  });
});

describe("loop run room and badge", () => {
  it("keeps room at the left and right clear, and eases the room as a room event says", () => {
    const run = settings({
      change: "rotated",
      layout: "rows",
      room: { left: 0.4 },
      events: [{ kind: "room", at: 2, duration: 1, room: { left: 0, right: 0.45 } }],
    });
    for (const tile of loopRunFrame(run, 8, RECT, 0).tiles) expect(tile.x - tile.size / 2).toBeGreaterThanOrEqual(1080 * 0.4 - 0.5);
    const middle = loopRunFrame(run, 8, RECT, 2.5).tiles[0]!.x;
    const after = loopRunFrame(run, 8, RECT, 3).tiles;
    for (const tile of after) expect(tile.x + tile.size / 2).toBeLessThanOrEqual(1080 * 0.55 + 0.5);
    expect(middle).toBeLessThan(loopRunFrame(run, 8, RECT, 0).tiles[0]!.x);
    expect(middle).toBeGreaterThan(after[0]!.x);
  });

  it("glides the chip to a new place when the same name moves, and keeps a new name in its own place", () => {
    const run = settings({
      badges: [
        { at: 0, text: "Reflected", top: 0.55 },
        { at: 5, text: "Reflected", top: 0.67, duration: 1.2 },
        { at: 8, text: "Rotated" },
      ],
    });
    expect(loopRunBadgeAt(run, 1)!.top).toEqual({ from: 0.55, to: 0.55, glide: 1 });
    const mid = loopRunBadgeAt(run, 5.6)!.top;
    expect(mid.from).toBe(0.55);
    expect(mid.to).toBe(0.67);
    expect(mid.glide).toBeCloseTo(0.5, 6);
    expect(loopRunBadgeAt(run, 6.5)!.top.glide).toBe(1);
    expect(loopRunBadgeAt(run, 9)!.top).toEqual({ from: undefined, to: undefined, glide: 1 });
    expect(loopRunBadgeAt(run, 9)!.left).toEqual({ from: undefined, to: undefined, glide: 1 });
  });

  it("glides a chip's left edge like its top, and centres a chip with none", () => {
    const run = settings({
      badges: [
        { at: 0, text: "Reflected", top: 0.1, left: 0.3 },
        { at: 5, text: "Reflected", top: 0.1, left: 0.1, duration: 1 },
      ],
    });
    expect(loopRunBadgeAt(run, 1)!.left).toEqual({ from: 0.3, to: 0.3, glide: 1 });
    const mid = loopRunBadgeAt(run, 5.5)!.left;
    expect(mid).toMatchObject({ from: 0.3, to: 0.1 });
    expect(mid.glide).toBeCloseTo(0.5, 6);
  });

  it("shows the start position from the first frame where the card will put it, when asked", () => {
    const events = [...loopRunDefaultEvents("reflected", "pairs", 4, 2), { kind: "layout" as const, at: 5, duration: 1, layout: "card" as const }];
    expect(loopRunFrame(settings({ events }), 4, RECT, 0).start).toBeNull();
    const run = settings({ startAlways: true, events });
    const first = loopRunFrame(run, 4, RECT, 0).start!;
    const settled = loopRunFrame(run, 4, RECT, 8).start!;
    expect(first.opacity).toBe(1);
    expect(first.x).toBeCloseTo(settled.x, 6);
    expect(first.y).toBeCloseTo(settled.y, 6);
    expect(first.size).toBeCloseTo(settled.size, 6);
  });

  it("marks each place as waiting until its step's tile has come in", () => {
    const run = settings({ waitingGrids: true, events: loopRunDefaultEvents("reflected", "pairs", 4, 2) });
    const early = loopRunFrame(run, 4, RECT, 0.1).slots;
    expect(early.map((slot) => slot.waiting)).toEqual([1, 1, 1, 1]);
    const seeded = loopRunFrame(run, 4, RECT, 3).slots;
    expect(seeded.map((slot) => slot.waiting)).toEqual([0, 0, 1, 1]);
    expect(loopRunFrame(run, 4, RECT, 5.05).slots.every((slot) => slot.waiting === 0)).toBe(true);
  });

  it("ends the reflection line flush with the outer tiles when asked, past them otherwise", () => {
    const events = loopRunDefaultEvents("reflected", "pairs", 4, 2);
    const enter = events.find((event) => event.kind === "enter")!;
    const t = enter.at + enter.duration / 2;
    const past = loopRunFrame(settings({ events }), 4, RECT, t);
    const flush = loopRunFrame(settings({ events, lineReach: 0.5 }), 4, RECT, t);
    const tiles = flush.tiles.filter((tile) => tile.step < 2);
    const top = Math.min(...tiles.map((tile) => tile.y - tile.size / 2));
    const bottom = Math.max(...tiles.map((tile) => tile.y + tile.size / 2));
    expect(flush.line!.y0).toBeCloseTo(top, 6);
    expect(flush.line!.y1).toBeCloseTo(bottom, 6);
    expect(past.line!.y0).toBeLessThan(top);
    expect(past.line!.y1).toBeGreaterThan(bottom);
  });
});

describe("loop run pass-3 settings", () => {
  const H = 1920;
  const h = 888 / 0.94;
  const build = { top: (906 - h / 2) / H, bottom: (H - 906 - h / 2) / H, left: 0, right: 0 };
  const events = loopRunDefaultEvents("reflected", "pairs", 4, 2);
  const edges = (tile: { x: number; y: number; size: number }) => ({
    left: tile.x - tile.size / 2,
    right: tile.x + tile.size / 2,
    top: tile.y - tile.size / 2,
    bottom: tile.y + tile.size / 2,
  });

  it("leaves today's tiles, ring and stage as they were when none is set", () => {
    const run = settings({ events });
    const landed = loopRunFrame(run, 4, RECT, 5.05).tiles;
    expect(landed.map((tile) => tile.outline)).toEqual([0, 0, 1, 1]);
    expect(landed.every((tile) => tile.corner === 1)).toBe(true);
    expect(loopRunFrame(run, 4, RECT, 0.9).tiles[0]!.scale).toBeGreaterThan(0.8);
    expect(loopRunFrame(run, 4, RECT, 0.9).tiles[0]!.scale).toBeLessThan(1);
    // The pairs keep 0.22 of a tile between the columns and 0.08 between the rows.
    const shape = loopRunShape({ seed: 2 }, 4);
    const [a, b, c] = [0, 1, 2].map((s) => loopTilePlace("pairs", "reflected", shape, RECT, s));
    expect(c!.x - a!.x).toBeCloseTo(a!.size * 1.22, 6);
    expect(b!.y - a!.y).toBeCloseTo(a!.size * 1.08, 6);
    const play = settings({ layout: "card", events: [{ kind: "play", at: 6, duration: 6, stage: { x: 0.5, y: 0.5, size: 0.5 } }] });
    const stage = loopRunFrame(play, 4, RECT, 7).stage!;
    expect(stage.grid).toBe(1);
    expect(stage.rings.every((ring) => !("look" in ring))).toBe(true);
  });

  it("lays the card out as one row centred in the room, with no start, when cardStart is false", () => {
    const run = settings({ layout: "card", cardStart: false, startAlways: true, room: { top: 0.2, bottom: 0.5 } });
    const frame = loopRunFrame(run, 4, RECT, 3);
    expect(frame.start).toBeNull();
    const room = { top: 0.2 * H, bottom: 0.5 * H };
    const size = Math.min((1080 * 0.94) / 4, (room.bottom - room.top) * 0.94);
    for (const tile of frame.tiles) {
      expect(tile.size).toBeCloseTo(size, 6);
      expect(tile.y).toBeCloseTo((room.top + room.bottom) / 2, 6);
    }
    expect(edges(frame.tiles[0]!).left).toBeCloseTo(540 - 2 * size, 6);
    // Going into the card from pairs, the start position never comes either.
    const later = settings({ events, cardStart: false });
    expect(loopRunFrame(later, 4, RECT, 9).start).toBeNull();
  });

  it("puts the pairs at 420 with 48 px gaps both ways when pairsGap says so", () => {
    const run = settings({ events, room: build, pairsGap: { across: 48 / 420, down: 48 / 420 }, lineReach: 0.5 });
    const frame = loopRunFrame(run, 4, RECT, 5.05);
    const boxes = frame.tiles.map(edges);
    const near = (got: number, want: number) => expect(got).toBeCloseTo(want, 6);
    near(boxes[0]!.left, 96);
    near(boxes[0]!.right, 516);
    near(boxes[2]!.left, 564);
    near(boxes[2]!.right, 984);
    near(boxes[0]!.top, 462);
    near(boxes[0]!.bottom, 882);
    near(boxes[1]!.top, 930);
    near(boxes[1]!.bottom, 1350);
    near(frame.line!.x0, 540);
    near(frame.line!.y0, 462);
    near(frame.line!.y1, 1350);
    // Other layouts keep their own gaps.
    const shape = loopRunShape({ seed: 2 }, 4);
    const rows = [0, 1].map((s) => loopTilePlace("rows", "reflected", shape, RECT, s, undefined, run));
    expect(rows[1]!.x - rows[0]!.x).toBeCloseTo(rows[0]!.size * 1.08, 6);
  });

  it("sets the rows' gap from a view, easing with it, and keeps 0.08 when no view sets one", () => {
    // Build: two rows of 420 with 48 gaps, rows y 388 to 1276. Play: four rows of 230, no gap, x 32 to 492.
    const h = 888 / 0.94;
    const build = { top: (832 - h / 2) / 1920, bottom: (1920 - 832 - h / 2) / 1920, left: 0, right: 0 };
    const w = 460 / 0.94;
    const tall = 920 / 0.94;
    const play = {
      top: (848 - tall / 2) / 1920,
      bottom: (1920 - 848 - tall / 2) / 1920,
      left: (262 - w / 2) / 1080,
      right: (1080 - 262 - w / 2) / 1080,
    };
    const run = settings({
      change: "rotated",
      layout: "rows",
      room: build,
      events: [
        { kind: "view", at: 0, duration: 0, rows: [0, 1], gap: 48 / 420 },
        { kind: "view", at: 2, duration: 1, rows: [1, 2] },
        { kind: "view", at: 5, duration: 1, rows: [0, 3], gap: 0 },
        { kind: "room", at: 5, duration: 1, room: play },
      ],
    });
    const near = (got: number, want: number) => expect(got).toBeCloseTo(want, 6);
    const first = loopRunFrame(run, 8, RECT, 1).tiles.map(edges);
    near(first[0]!.left, 96);
    near(first[1]!.right, 984);
    near(first[1]!.left, 564);
    near(first[0]!.top, 388);
    near(first[2]!.top, 856);
    near(first[2]!.bottom, 1276);
    // A view with no gap keeps the gap before it: one row down, same pitch.
    const moved = loopRunFrame(run, 8, RECT, 4).tiles.map(edges);
    near(moved[2]!.top, 388);
    near(moved[4]!.bottom, 1276);
    near(moved[1]!.left - moved[0]!.right, 48);
    const end = loopRunFrame(run, 8, RECT, 7).tiles;
    const boxes = end.map(edges);
    near(boxes[0]!.left, 32);
    near(boxes[1]!.right, 492);
    near(boxes[0]!.top, 388);
    near(boxes[7]!.bottom, 1308);
    near(boxes[1]!.left, boxes[0]!.right);
    expect(end.every((tile) => tile.opacity === 1)).toBe(true);
    // Halfway, the gap is between the two.
    const half = loopRunFrame(run, 8, RECT, 5.5).tiles;
    const gap = half[1]!.x - half[0]!.x - half[0]!.size;
    expect(gap).toBeGreaterThan(0);
    expect(gap / half[0]!.size).toBeLessThan(48 / 420);
    // Without a gap on any view, rows keep their own.
    const plainView = settings({ change: "rotated", layout: "rows", events: [{ kind: "view", at: 0, duration: 0, rows: [0, 1] }] });
    const tiles = loopRunFrame(plainView, 8, RECT, 1).tiles;
    expect(tiles[1]!.x - tiles[0]!.x).toBeCloseTo(tiles[0]!.size * 1.08, 6);
  });

  it("keeps plain tiles' empty frames waiting in rows, only for the rows in view", () => {
    const events: LoopRunSettings["events"] = [
      { kind: "view", at: 0, duration: 0, rows: [0, 1] },
      { kind: "reveal", at: 0.3, duration: 0.5 },
      { kind: "enter", at: 3, duration: 1.2 },
    ];
    const rows = (plainTiles?: boolean) =>
      settings({ change: "rotated", layout: "rows", events, ...(plainTiles ? { plainTiles } : {}) });
    expect(loopRunFrame(rows(), 8, RECT, 2).slots).toHaveLength(0);
    const slots = loopRunFrame(rows(true), 8, RECT, 2).slots;
    expect(slots).toHaveLength(8);
    expect(slots[2]!.opacity).toBe(1);
    expect(slots[2]!.waiting).toBe(1);
    expect(slots[0]!.waiting).toBe(0);
    expect(slots[4]!.opacity).toBe(0);
    // The frame waits where its tile will land.
    const landed = loopRunFrame(rows(true), 8, RECT, 5).tiles[2]!;
    expect(slots[2]!.x).toBeCloseTo(landed.x, 6);
    expect(slots[2]!.y).toBeCloseTo(landed.y, 6);
    expect(loopRunFrame(rows(true), 8, RECT, 5).slots[2]!.waiting).toBe(0);
  });

  it("puts the gold ring on the tile being played in rows and in the ring", () => {
    for (const layout of ["rows", "ring"] as const) {
      const run = settings({
        change: "rotated",
        layout,
        plainTiles: true,
        events: [{ kind: "play", at: 2, duration: 10.4, rounds: 2, stage: { x: 0.5, y: 0.5, size: 0.3 }, ring: "card", flare: true }],
      });
      // 0.65 s a step: 2 + 0.65 * 5.5 is the middle of step 5.
      const frame = loopRunFrame(run, 8, RECT, 2 + 0.65 * 5.5);
      const tile = frame.tiles[5]!;
      expect(frame.stage!.rings).toHaveLength(1);
      const ring = frame.stage!.rings[0]!;
      expect(ring.look).toBe("card");
      expect(ring.x).toBeCloseTo(tile.x - tile.size / 2, 6);
      expect(ring.y).toBeCloseTo(tile.y - tile.size / 2, 6);
      expect(ring.width).toBeCloseTo(tile.size, 6);
      // The first round ends at 7.2: the flare starts on it.
      expect(loopRunFrame(run, 8, RECT, 7.2).stage!.flares!.length).toBeGreaterThan(0);
    }
  });

  it("gives plain tiles square corners, no outline and no grow as they are revealed", () => {
    const run = settings({ events, plainTiles: true });
    const appearing = loopRunFrame(run, 4, RECT, 0.9).tiles[0]!;
    expect(appearing.opacity).toBeGreaterThan(0);
    expect(appearing.opacity).toBeLessThan(1);
    expect(appearing.scale).toBe(1);
    for (const t of [0.9, 3, 5.05, 5.7, 8])
      for (const tile of loopRunFrame(run, 4, RECT, t).tiles) {
        expect(tile.corner).toBe(0);
        expect(tile.outline).toBe(0);
      }
    expect(loopRunFrame(run, 4, RECT, 3).slots).toHaveLength(4);
  });

  it("carries the play's ring look and the stage grid's strength into the frame", () => {
    const run = settings({
      layout: "card",
      events: [{ kind: "play", at: 6, duration: 6, stage: { x: 0.5, y: 0.5, size: 0.5, grid: 0.5 }, ring: "card" }],
    });
    const stage = loopRunFrame(run, 4, RECT, 7).stage!;
    expect(stage.grid).toBe(0.5);
    expect(stage.rings.length).toBeGreaterThan(0);
    expect(stage.rings.every((ring) => ring.look === "card")).toBe(true);
  });
});

describe("loop run pass-4 settings", () => {
  const STAGE = { x: 0.5, y: 0.5, size: 0.5 };
  // Four steps, two rounds of 6 s from 6.6: the rounds end at 9.6 and 12.6.
  const run = (extra: { shadow?: boolean; flare?: boolean; wayBack?: boolean } = {}) =>
    settings({
      layout: "card",
      cardStart: false,
      events: [{ kind: "play", at: 6.6, from: 6.3, duration: 6, rounds: 2, stage: STAGE, ring: "card", ...extra }],
    });
  const stageAt = (t: number, extra?: Parameters<typeof run>[0]) => loopRunFrame(run(extra), 4, RECT, t).stage!;

  it("adds no shadow, flare or way back when none is asked for", () => {
    for (const t of [6.4, 7, 9.6, 9.8, 12.6, 13.5]) {
      const stage = stageAt(t);
      expect("shadow" in stage).toBe(false);
      expect("flares" in stage).toBe(false);
      expect("wayBack" in stage).toBe(false);
    }
  });

  it("carries the shadow in the pose a round leaves the props, from the play's start", () => {
    expect(stageAt(6.5, { shadow: true }).shadow).toBeNull();
    const landed = { step: 3, progress: 1, continued: true };
    expect(stageAt(6.6, { shadow: true }).shadow).toEqual(landed);
    expect(stageAt(8, { shadow: true }).shadow).toEqual(landed);
    expect(stageAt(13.5, { shadow: true }).shadow).toEqual(landed);
    // Where the second round leaves the props is where the shadow is.
    expect(stageAt(13.5, { shadow: true }).props).toEqual(landed);
  });

  it("fires the flare at each round's end, the last included, and has it gone 0.6 s later", () => {
    expect(stageAt(9.55, { flare: true }).flares).toEqual([]);
    for (const end of [9.6, 12.6]) {
      const flares = stageAt(end, { flare: true }).flares!;
      expect(flares).toHaveLength(1);
      expect(flares[0]!.strength).toBeCloseTo(0.7, 6);
      expect(flares[0]!.clearance).toBeCloseTo(20, 6);
      expect(flares[0]!.width).toBeCloseTo(5, 6);
      expect(flares[0]!.pose).toEqual({ step: 3, progress: 1, continued: true });
      const both = stageAt(end + 0.2, { flare: true }).flares!;
      expect(both).toHaveLength(2);
      expect(both[0]!.clearance).toBeGreaterThan(both[1]!.clearance);
      expect(both[0]!.strength).toBeCloseTo(0.7 * 0.6, 6);
      expect(both[1]!.strength).toBeCloseTo(0.3 * 0.8, 6);
      expect(stageAt(end + 0.6, { flare: true }).flares).toEqual([]);
    }
    // It grows to 50 px clear of the props, on a 1080-wide frame.
    expect(stageAt(9.6 + 0.4999, { flare: true }).flares![0]!.clearance).toBeCloseTo(50, 2);
  });

  it("draws the way back on as the first round ends, settles it, and brings it up at the next", () => {
    expect(stageAt(9.19, { wayBack: true }).wayBack).toBeNull();
    const half = stageAt(9.4, { wayBack: true }).wayBack!;
    expect(half.drawn).toBeCloseTo(0.5, 6);
    expect(half.strength).toBe(1);
    const arrived = stageAt(9.6, { wayBack: true }).wayBack!;
    expect(arrived.drawn).toBe(1);
    expect(arrived.strength).toBe(1);
    expect(stageAt(9.85, { wayBack: true }).wayBack!.strength).toBe(1);
    expect(stageAt(11.6, { wayBack: true }).wayBack!.strength).toBeCloseTo(0.35, 6);
    expect(stageAt(12.6, { wayBack: true }).wayBack!.strength).toBe(1);
    expect(stageAt(13.5, { wayBack: true }).wayBack!.strength).toBeCloseTo(0.35, 6);
  });

  it("anchors the way back on the bottom centres of the last and the first tile", () => {
    const frame = loopRunFrame(run({ wayBack: true }), 4, RECT, 10);
    const [first, , , last] = frame.tiles;
    const way = frame.stage!.wayBack!;
    expect(way.from).toEqual({ x: last!.x, y: last!.y + last!.size / 2 });
    expect(way.to).toEqual({ x: first!.x, y: first!.y + first!.size / 2 });
    expect(way.unit).toBeCloseTo(last!.size / 254, 9);
  });

  it("keeps bareCopies in the compiled plan, and the frames as they were", () => {
    const events = loopRunDefaultEvents("reflected", "pairs", 4, 2);
    const item = { ...settings({ events, plainTiles: true, bareCopies: true }), id: "x", start: 0, duration: 9, sequence: {} as never };
    expect(loopRunPlanOf(item, "overlay").settings.bareCopies).toBe(true);
    const without = { ...item, bareCopies: undefined };
    expect("bareCopies" in loopRunPlanOf(without, "overlay").settings).toBe(false);
    for (const t of [3.5, 4.85, 4.9])
      expect(loopRunFrame(item, 4, RECT, t)).toEqual(loopRunFrame(settings({ events, plainTiles: true }), 4, RECT, t));
  });
});

describe("engine steps", () => {
  const motion = (startLocation: string, endLocation: string, motionType = "anti", rotationDirection = "cw") => ({
    motionType,
    startLocation,
    endLocation,
    rotationDirection,
    startOrientation: "in",
    endOrientation: "out",
    turns: 0,
  });
  const steps = engineStepsOf({
    steps: [
      { letter: "β", startPlacement: "beta3", endPlacement: "beta3", leftMotion: motion("e", "e", "static", "noRotation"), rightMotion: motion("e", "e", "static", "noRotation") },
      { letter: "E", startPlacement: "beta3", endPlacement: "alpha1", leftMotion: motion("e", "s", "anti", "ccw"), rightMotion: motion("e", "n") },
    ],
  });

  it("makes the first entry the start position and the rest the steps", () => {
    const sequence = sequenceFromEngineSteps(steps, { name: "EK", id: "loop-ek" });
    expect(sequence.id).toBe("loop-ek");
    expect(sequence.steps).toHaveLength(1);
    expect(sequence.word).toBe("E");
    const start = sequence.startPlacement as { isStartPlacement?: boolean; gridPlacement?: string };
    expect(start.isStartPlacement).toBe(true);
    expect(start.gridPlacement).toBe("beta3");
    const left = sequence.steps[0]!.motions.left!;
    expect(left.motionType).toBe("anti");
    expect(left.rotationDirection).toBe("ccw");
    expect(left.endLocation).toBe("s");
  });

  it("refuses a list without a step", () => {
    expect(() => sequenceFromEngineSteps(steps.slice(0, 1), { name: "x" })).toThrow();
  });
});
