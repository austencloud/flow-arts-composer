import { describe, expect, it } from "vitest";
import {
  CARD_CASCADE_EACH_SECONDS,
  CARD_CASCADE_FIRST_TILE_SECONDS,
  CARD_CASCADE_STEP_SECONDS,
  CARD_QR_EXIT_SECONDS,
  PostCardEnterSchema,
  PostCardQrExitSchema,
  PostCardRingSchema,
  cardEndingFrame,
  cardEndingOf,
  cascadeOrder,
  cascadeSeconds,
  cascadeTile,
  qrFlight,
  qrLandingBox,
  ringMarks,
  ringStepSeconds,
  type CardLayout,
  type CardPiece,
} from "./card-ending";

/** A card with a start tile and a QR in its top row, then `steps` pictographs. */
function layout(steps: number): CardLayout {
  const tile = (x: number, y: number) => ({ x, y, width: 0.2, height: 0.2 });
  const pieces: CardPiece[] = [
    // Given out of reading order on purpose.
    { kind: "qr", rect: tile(0.6, 0.1), cell: tile(0.6, 0.1) },
    { kind: "start", rect: tile(0, 0.1), cell: tile(0, 0.1) },
  ];
  for (let step = steps - 1; step >= 0; step--) {
    const r = tile((step % 4) * 0.2, 0.3 + Math.floor(step / 4) * 0.2);
    pieces.push({ kind: "step", step, rect: r, cell: r });
  }
  return { pieces, qr: tile(0.62, 0.12) };
}

/** The same card with two mandala tiles between the start tile and the QR. */
function withMandalas(card: CardLayout): CardLayout {
  const tile = (x: number) => ({ x, y: 0.1, width: 0.2, height: 0.2 });
  return {
    ...card,
    pieces: [
      ...card.pieces,
      { kind: "mandala", rect: tile(0.4), cell: tile(0.4) },
      { kind: "mandala", rect: tile(0.2), cell: tile(0.2) },
    ],
  };
}

describe("card ending: a card without settings", () => {
  it("has no ending and every frame is plain", () => {
    expect(cardEndingOf({})).toBeNull();
    const card = layout(16);
    for (const s of [0, 0.1, 1, 5, 60]) {
      const frame = cardEndingFrame({}, s, card, 0.75);
      expect(frame.plain).toBe(true);
      expect(frame.backing).toBe(1);
      expect(frame.rings).toEqual([]);
      expect(frame.qr).toBeNull();
    }
  });

  it("keeps headerTitle alone as an ending that never changes the drawing", () => {
    expect(cardEndingOf({ headerTitle: "clip" })).toEqual({
      headerTitle: "clip",
    });
    expect(
      cardEndingFrame({ headerTitle: "clip" }, 0, layout(4), null).plain
    ).toBe(true);
  });
});

describe("card ending: cascade", () => {
  const enter = { style: "cascade" as const };

  it("arrives in reading order: top row left to right, then pictographs 1 to N", () => {
    const card = layout(5);
    const order = cascadeOrder(card.pieces).map((index) => {
      const piece = card.pieces[index]!;
      return piece.kind === "step" ? `p${piece.step! + 1}` : piece.kind;
    });
    expect(order).toEqual(["start", "qr", "p1", "p2", "p3", "p4", "p5"]);
  });

  it("takes mandala tiles in the top row as tiles, in reading order", () => {
    const card = withMandalas(layout(4));
    const order = cascadeOrder(card.pieces).map((index) => {
      const piece = card.pieces[index]!;
      return piece.kind === "step" ? `p${piece.step! + 1}` : piece.kind;
    });
    expect(order).toEqual([
      "start",
      "mandala",
      "mandala",
      "qr",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    // The last pictograph arrives two tiles later than without the mandalas.
    const seconds =
      CARD_CASCADE_FIRST_TILE_SECONDS + 6 * CARD_CASCADE_STEP_SECONDS;
    const lastOf = (layoutWith: CardLayout) =>
      layoutWith.pieces.findIndex(
        (piece) => piece.kind === "step" && piece.step === 3
      );
    const plain = layout(4);
    const without = cardEndingFrame({ enter }, seconds, plain, null);
    expect(without.pieces[lastOf(plain)]).toBeGreaterThan(0);
    const frame = cardEndingFrame({ enter }, seconds, card, null);
    expect(frame.pieces[lastOf(card)]).toBe(0);
    const mandala = card.pieces.findIndex((piece) => piece.kind === "mandala");
    expect(frame.pieces[mandala]).toBeGreaterThan(0);
  });

  it("starts each tile one step after the one before, the first 0.04 s in", () => {
    expect(cascadeTile(enter, CARD_CASCADE_FIRST_TILE_SECONDS, 0)).toBe(0);
    expect(
      cascadeTile(enter, CARD_CASCADE_FIRST_TILE_SECONDS + 0.001, 0)
    ).toBeGreaterThan(0);
    const third =
      CARD_CASCADE_FIRST_TILE_SECONDS + 2 * CARD_CASCADE_STEP_SECONDS;
    expect(cascadeTile(enter, third, 2)).toBe(0);
    expect(cascadeTile(enter, third + CARD_CASCADE_EACH_SECONDS, 2)).toBe(1);
    // Smoothstepped: halfway through its fade a tile is exactly half there.
    expect(
      cascadeTile(enter, third + CARD_CASCADE_EACH_SECONDS / 2, 2)
    ).toBeCloseTo(0.5);
  });

  it("takes about 0.96 s for a 16-count card's twenty tiles", () => {
    expect(cascadeSeconds(enter, 20)).toBeCloseTo(0.955, 3);
  });

  it("is fully transparent before it starts, backing included, and plain once in", () => {
    const card = layout(16);
    const first = cardEndingFrame({ enter }, 0, card, null);
    expect(first.backing).toBe(0);
    expect(first.pieces.every((v) => v === 0)).toBe(true);
    const done = cardEndingFrame({ enter }, 2, card, null);
    expect(done.plain).toBe(true);
  });

  it("rejects a style it does not know and odd step lengths", () => {
    expect(PostCardEnterSchema.safeParse({ style: "fade" }).success).toBe(
      false
    );
    expect(
      PostCardEnterSchema.safeParse({ style: "cascade", each: 0 }).success
    ).toBe(false);
    expect(
      PostCardEnterSchema.safeParse({ style: "cascade", step: 0.05 }).success
    ).toBe(true);
  });
});

describe("card ending: gold ring", () => {
  const ring = { at: 1, every: 0.75 };

  it("is absent before its first step and sits on pictograph 1 after it", () => {
    expect(ringMarks(ring, 0.9, 16, null)).toEqual([]);
    const first = ringStepSeconds(ring, 0.75, 0);
    expect(first).toBeCloseTo(1.05);
    expect(ringMarks(ring, first + 0.2, 16, null)).toEqual([
      { step: 0, strength: 1 },
    ]);
  });

  it("cross-fades over 0.1 s centred on each step", () => {
    const second = ringStepSeconds(ring, 0.75, 1);
    const marks = ringMarks(ring, second, 16, null);
    expect(marks.map((m) => m.step)).toEqual([0, 1]);
    expect(marks[0]!.strength).toBeCloseTo(0.5);
    expect(marks[1]!.strength).toBeCloseTo(0.5);
    expect(ringMarks(ring, second + 0.051, 16, null)).toEqual([
      { step: 1, strength: 1 },
    ]);
  });

  it("stays on the last pictograph", () => {
    const last = ringStepSeconds(ring, 0.75, 15);
    expect(ringMarks(ring, last + 30, 16, null)).toEqual([
      { step: 15, strength: 1 },
    ]);
  });

  it("steps on the song's beat when it has no own pace, and not at all without one", () => {
    const beat = { at: 0 };
    expect(ringMarks(beat, 0.5, 4, null)).toEqual([]);
    const marks = ringMarks(beat, 0.5 + 0.05, 4, 0.5);
    expect(marks.map((m) => m.step)).toEqual([0, 1]);
    expect(marks[1]!.strength).toBeCloseTo(0.5);
  });

  it("takes its tile's visibility while the card arrives", () => {
    const card = layout(4);
    const ending = {
      enter: { style: "cascade" as const },
      ring: { at: 0, every: 1, late: 0 },
    };
    const frame = cardEndingFrame(ending, 0.2, card, null);
    expect(frame.rings).toHaveLength(1);
    const ringed = frame.rings[0]!;
    expect(ringed.strength).toBeCloseTo(frame.pieces[ringed.piece]!);
    expect(ringed.strength).toBeLessThan(1);
  });

  it("refuses a pace under the cross-fade", () => {
    expect(PostCardRingSchema.safeParse({ at: 1, every: 0.05 }).success).toBe(
      false
    );
    expect(PostCardRingSchema.safeParse({ at: -4000, every: 1 }).success).toBe(
      false
    );
    // Before the clip is allowed: the ring is already under way.
    expect(PostCardRingSchema.safeParse({ at: -1, every: 1 }).success).toBe(
      true
    );
  });
});

describe("card ending: QR exit", () => {
  const qrExit = { at: 10 };

  it("eases out over 1.13 s by default and holds", () => {
    expect(qrFlight(qrExit, 9.99)).toBeNull();
    expect(qrFlight(qrExit, 10)).toEqual({ progress: 0, rest: 1, caption: 0 });
    const half = qrFlight(qrExit, 10 + CARD_QR_EXIT_SECONDS / 2)!;
    expect(half.progress).toBeCloseTo(0.5);
    expect(half.caption).toBe(1);
    expect(qrFlight(qrExit, 99)).toEqual({ progress: 1, rest: 0, caption: 1 });
  });

  it("empties the QR's tile from the first frame and fades the rest, ring too", () => {
    const card = layout(4);
    const ending = { qrExit, ring: { at: 0, every: 0.5 } };
    const first = cardEndingFrame(ending, 10, card, null);
    expect(first.pieces[0]).toBe(0);
    expect(first.pieces.slice(1).every((v) => v === 1)).toBe(true);
    const gone = cardEndingFrame(ending, 12, card, null);
    expect(gone.backing).toBe(0);
    expect(gone.rings).toEqual([]);
    expect(gone.plain).toBe(false);
  });

  it("fades the mandala tiles with the rest of the card", () => {
    const card = withMandalas(layout(4));
    const mandalas = card.pieces
      .map((piece, index) => (piece.kind === "mandala" ? index : -1))
      .filter((index) => index >= 0);
    const half = cardEndingFrame(
      { qrExit },
      qrExit.at + CARD_QR_EXIT_SECONDS / 2,
      card,
      null
    );
    for (const index of mandalas)
      expect(half.pieces[index]).toBeCloseTo(half.backing);
    const gone = cardEndingFrame({ qrExit }, 12, card, null);
    for (const index of mandalas) expect(gone.pieces[index]).toBe(0);
  });

  it("lands on a centred square 0.55 of the width, top at 0.27", () => {
    const box = qrLandingBox(qrExit, 9 / 16);
    expect(box.x).toBeCloseTo(0.225);
    expect(box.y).toBe(0.27);
    expect(box.width * 1080).toBeCloseTo(box.height * 1920);
    const to = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };
    expect(qrLandingBox({ at: 0, to }, 1)).toBe(to);
  });

  it("refuses a caption that runs too long", () => {
    expect(
      PostCardQrExitSchema.safeParse({ at: 0, caption: "x".repeat(81) }).success
    ).toBe(false);
  });
});
