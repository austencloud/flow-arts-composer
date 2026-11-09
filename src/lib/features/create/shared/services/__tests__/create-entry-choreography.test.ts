import { describe, expect, it } from "vitest";
import {
  CREATE_ENTRY_FLIGHT_MS,
  FILING_SPREAD_MS,
  SPLIT_CONDENSE_MS,
  SPLIT_LEAD_MS,
  SPLIT_SPREAD_MS,
  TAPPED_HOLD_MS,
  TAPPED_SHRINK,
  TAPPED_SHRINK_LIMIT,
  departureTiming,
  filingDistance,
  filingTiming,
  miniatureOf,
  nearestFirst,
  splitSpreadFor,
  splitTiming,
  tappedHoldFrames,
  underTappedSpan,
} from "../create-entry-choreography";
import { CREATE_ENTRY_HOLD_CAP_MS } from "../create-method-entry-gate";

describe("tappedHoldFrames", () => {
  it("passes the old size at the cap and keeps shrinking long after it", () => {
    for (const from of [1, 0.97]) {
      const frames = tappedHoldFrames(from);
      expect(frames[0]).toEqual({ scale: from, offset: 0 });
      expect(frames.at(-1)?.offset).toBe(1);
      const atCap = frames.find(
        ({ offset }) => offset * TAPPED_HOLD_MS === CREATE_ENTRY_HOLD_CAP_MS
      );
      expect(atCap?.scale).toBeCloseTo(TAPPED_SHRINK, 6);
      // Over a second past the cap: a 4x-slow mount ends inside the hold.
      expect(TAPPED_HOLD_MS - CREATE_ENTRY_HOLD_CAP_MS).toBeGreaterThan(1000);
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]!.scale).toBeLessThan(frames[i - 1]!.scale);
        expect(frames[i]!.offset).toBeGreaterThan(frames[i - 1]!.offset);
        expect(frames[i]!.scale).toBeGreaterThan(TAPPED_SHRINK_LIMIT);
      }
    }
  });

  it("slows down as it goes, so it never lurches", () => {
    const frames = tappedHoldFrames(1);
    const speeds = frames
      .slice(1)
      .map(
        (frame, i) =>
          (frames[i]!.scale - frame.scale) / (frame.offset - frames[i]!.offset)
      );
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
    }
  });
});

const box = (left: number, top: number, width = 100, height = 100) => ({
  left,
  top,
  width,
  height,
});

const board = box(0, 0, 1000, 600);
const card = box(600, 40, 300, 200);

describe("departureTiming", () => {
  it("clears the cards nearest the tapped one first", () => {
    const beside = departureTiming(box(400, 40, 180, 200), card, board);
    const farAway = departureTiming(box(20, 400, 180, 180), card, board);
    expect(beside.delay).toBeLessThan(farAway.delay);
  });

  it("pushes each card straight away from the tapped one", () => {
    const left = departureTiming(box(100, 100), card, board);
    expect(left.dx).toBeLessThan(0);
    const below = departureTiming(box(700, 450), card, board);
    expect(below.dy).toBeGreaterThan(0);
  });
});

describe("miniatureOf", () => {
  it("keeps the grid's shape and centers it in the room", () => {
    const mini = miniatureOf(box(0, 0, 800, 400), box(100, 100, 200, 200));
    expect(mini.scale).toBe(0.25);
    expect(mini.width / mini.height).toBe(2);
    expect(mini).toMatchObject({
      left: 100,
      top: 150,
      width: 200,
      height: 100,
    });
  });
});

describe("splitTiming", () => {
  const grid = box(0, 300, 800, 400);
  const miniature = miniatureOf(grid, card);

  it("starts each card where it sits in the miniature", () => {
    const place = box(400, 500, 400, 200);
    const { dx, dy } = splitTiming({
      card: place,
      grid,
      miniature,
      fraction: 0.5,
    });
    expect(place.left + dx).toBeCloseTo(miniature.left + 400 * miniature.scale);
    expect(place.top + dy).toBeCloseTo(miniature.top + 200 * miniature.scale);
  });

  it("leaves at its turn, the first as the plate arrives", () => {
    const first = splitTiming({ card: grid, grid, miniature, fraction: 0 });
    const last = splitTiming({
      card: grid,
      grid,
      miniature,
      fraction: 1,
      spread: 160,
    });
    // No hold: the first piece goes as the plate reaches the miniature.
    expect(first.delay).toBe(SPLIT_LEAD_MS);
    expect(SPLIT_LEAD_MS).toBe(SPLIT_CONDENSE_MS);
    expect(last.delay).toBe(SPLIT_LEAD_MS + 160);
  });
});

describe("nearestFirst", () => {
  it("orders the places nearest the tapped card first", () => {
    const near = nearestFirst(box(650, 300), card, 800);
    const far = nearestFirst(box(0, 600), card, 800);
    expect(near).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(1);
  });
});

describe("the entry's length", () => {
  it("comes to rest well inside a second after the swap", () => {
    // The longest wave any method plays: a full spread at twice the relaxed
    // stagger, then one flight.
    expect(
      SPLIT_LEAD_MS + 2 * SPLIT_SPREAD_MS + CREATE_ENTRY_FLIGHT_MS
    ).toBeLessThanOrEqual(600);
  });
});

describe("splitSpreadFor", () => {
  it("gives a full set of cards the whole spread", () => {
    expect(splitSpreadFor(8)).toBe(SPLIT_SPREAD_MS);
  });

  it("sends a few large pieces out nearly together", () => {
    expect(splitSpreadFor(1)).toBe(0);
    expect(splitSpreadFor(3)).toBeLessThan(SPLIT_SPREAD_MS / 2);
  });
});

describe("filingTiming", () => {
  const icon = box(10, 200, 44, 44);
  const near = box(100, 180, 300, 200);
  const far = box(700, 400, 300, 200);
  const trips = {
    nearest: filingDistance(near, icon),
    farthest: filingDistance(far, icon),
  };

  it("lands the card's center on its drawer", () => {
    const { dx, dy } = filingTiming({ element: far, drawer: icon, ...trips });
    expect(far.left + far.width / 2 + dx).toBeCloseTo(icon.left + 22);
    expect(far.top + far.height / 2 + dy).toBeCloseTo(icon.top + 22);
  });

  it("shrinks evenly to fit the drawer", () => {
    const { scale } = filingTiming({ element: far, drawer: icon, ...trips });
    expect(scale).toBeCloseTo(44 / 300);
    const pill = box(500, 1000, 240, 48);
    expect(
      filingTiming({ element: far, drawer: pill, nearest: 0, farthest: 0 })
        .scale
    ).toBeCloseTo(48 / 200);
  });

  it("files the card nearest its drawer first, within the spread", () => {
    expect(filingTiming({ element: near, drawer: icon, ...trips }).delay).toBe(
      0
    );
    expect(filingTiming({ element: far, drawer: icon, ...trips }).delay).toBe(
      FILING_SPREAD_MS
    );
  });
});

describe("underTappedSpan", () => {
  // The board's top row: the tapped card on the left, its neighbour on the
  // right, and the drawers in a sidebar further left.
  const tapped = box(100, 170, 600, 300);
  const drawer = box(10, 200, 30, 30);

  it("fades a card whose way runs under the tapped one as it slips beneath", () => {
    const element = box(720, 170, 600, 300);
    const filing = filingTiming({ element, drawer, nearest: 0, farthest: 0 });
    const span = underTappedSpan({ element, filing, tapped });
    expect(span).not.toBeNull();
    expect(span!.from).toBeGreaterThan(0);
    expect(span!.to).toBeGreaterThan(span!.from);
    expect(span!.to).toBeLessThan(0.5);
  });

  it("leaves a card that never passes under the tapped one alone", () => {
    const element = box(20, 600, 200, 150);
    const filing = filingTiming({ element, drawer, nearest: 0, farthest: 0 });
    expect(underTappedSpan({ element, filing, tapped })).toBeNull();
  });
});
