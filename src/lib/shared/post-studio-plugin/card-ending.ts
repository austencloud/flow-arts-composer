import { z } from "zod";

/**
 * How a choreo card clip ends a tutorial: it arrives piece by piece, a gold
 * ring steps through its pictographs on the song's beats, then its QR lifts
 * out of its tile and grows into the end screen. Every rule here is a pure
 * function of the clip's own seconds, so the live preview and the exported
 * file draw the same frame for the same time. The preview and the export
 * only differ in how they paint what this module returns.
 *
 * Times are in the clip's keyframe time: seconds from its start, as a titles
 * clip's `lit` span is.
 *
 * This module and everything it reaches must never import the plugin index
 * by value: the index re-exports item-kinds, which imports this.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** A cascade's defaults: each piece's fade, and the gap between two starts. */
export const CARD_CASCADE_EACH_SECONDS = 0.25;
export const CARD_CASCADE_STEP_SECONDS = 0.035;
/** The first tile starts this long after the clip does. */
export const CARD_CASCADE_FIRST_TILE_SECONDS = 0.04;
/** A ring step lands this much after its beat: one on the beat looks early. */
export const CARD_RING_LATE_SECONDS = 0.05;
/** One ring step's cross-fade, centred on the step's time. */
export const CARD_RING_CROSSFADE_SECONDS = 0.1;
/** How long the QR takes to fly to its landing box. */
export const CARD_QR_EXIT_SECONDS = 1.13;
/** The caption fades in over this share of the QR's flight. */
export const CARD_QR_CAPTION_IN_SHARE = 1 / 3;
/**
 * Where the QR lands by default, in frame fractions: a square 0.55 of the
 * frame's width, centred, its top edge 0.27 of the frame's height down.
 */
export const CARD_QR_LANDING_WIDTH = 0.55;
export const CARD_QR_LANDING_TOP = 0.27;
export const CARD_QR_MAX_CAPTION_LENGTH = 80;
/** What sits behind the landed QR: the frame as it is, or black. */
export const CARD_QR_BACKDROPS = ["clear", "black"] as const;
export type CardQrBackdrop = (typeof CARD_QR_BACKDROPS)[number];
/**
 * The caption's faces: the brand serif (Fraunces 700 italic, the end
 * screen's voice) or the plain sans the app's labels use.
 */
export const CARD_QR_CAPTION_FACES = ["serif", "sans"] as const;
export type CardQrCaptionFace = (typeof CARD_QR_CAPTION_FACES)[number];
/**
 * The caption's letters as a share of the QR's size. The default is the old
 * end screen's: 80 px letters under a code about 660 px wide.
 */
export const CARD_QR_CAPTION_SIZE = 0.12;
export const CARD_QR_CAPTION_MIN_SIZE = 0.03;
export const CARD_QR_CAPTION_MAX_SIZE = 0.3;

const seconds = z.number().finite();

/**
 * Earliest a ring or QR exit may start, in seconds from the clip's start. A
 * time before the clip means the move is already under way when the clip
 * starts: what a start trim past it leaves (see `item-times.ts`).
 */
export const CARD_EARLIEST_AT_SECONDS = -3600;
/** A ring's or QR exit's start: may fall before the clip. */
const startAt = seconds.min(CARD_EARLIEST_AT_SECONDS);

export const PostCardEnterSchema = z
  .object({
    style: z.literal("cascade"),
    /** Seconds between one tile's start and the next; absent = 0.035. */
    step: seconds.min(0).max(1).optional(),
    /** Seconds each piece takes to fade in; absent = 0.25. */
    each: seconds.min(0.01).max(3).optional(),
  })
  .strict();
export type PostCardEnter = z.infer<typeof PostCardEnterSchema>;

export const PostCardRingSchema = z
  .object({
    /** When the ring arrives on pictograph 1; before 0, it already has. */
    at: startAt,
    /**
     * Seconds per step; absent = one beat of the song's grid. At least the
     * cross-fade's length, so two steps never overlap.
     */
    every: seconds.min(CARD_RING_CROSSFADE_SECONDS).max(30).optional(),
    /** Every step lands this much after its time; absent = 0.05. */
    late: seconds.min(0).max(1).optional(),
  })
  .strict();
export type PostCardRing = z.infer<typeof PostCardRingSchema>;

/** A box in fractions of the frame. */
export const PostFrameBoxSchema = z
  .object({
    x: seconds,
    y: seconds,
    width: seconds.positive().max(4),
    height: seconds.positive().max(4),
  })
  .strict();
export type PostFrameBox = z.infer<typeof PostFrameBoxSchema>;

export const PostCardQrExitSchema = z
  .object({
    /** When the QR lifts out of its tile; before 0, it already has. */
    at: startAt,
    /** How long it takes to land; absent = 1.13. */
    seconds: seconds.min(0.05).max(10).optional(),
    /** Where it lands, in frame fractions; absent = the default square. */
    to: PostFrameBoxSchema.optional(),
    /** A short line that travels under the QR. */
    caption: z.string().max(CARD_QR_MAX_CAPTION_LENGTH).optional(),
    /** The caption's face; absent = the brand serif. */
    captionFace: z.enum(CARD_QR_CAPTION_FACES).optional(),
    /** The caption's letters as a share of the QR's size; absent = 0.12. */
    captionSize: seconds
      .min(CARD_QR_CAPTION_MIN_SIZE)
      .max(CARD_QR_CAPTION_MAX_SIZE)
      .optional(),
    /**
     * The QR tile's own fill, carried under the flying code. Absent = on;
     * false flies the bare code, as the end screen on black wants.
     */
    plate: z.boolean().optional(),
    /**
     * What the QR lands on: `black` fades the frame to black behind it as it
     * flies (the card goes with it); absent or `clear` leaves the frame.
     */
    backdrop: z.enum(CARD_QR_BACKDROPS).optional(),
  })
  .strict();
export type PostCardQrExit = z.infer<typeof PostCardQrExitSchema>;

/** Whose title shows in the card's header: its own word, or the titles clip's. */
export const POST_CARD_HEADER_TITLES = ["card", "clip"] as const;
export type PostCardHeaderTitle = (typeof POST_CARD_HEADER_TITLES)[number];

/** A card clip's ending settings, as saved on the item. */
export interface PostCardEnding {
  enter?: PostCardEnter | undefined;
  ring?: PostCardRing | undefined;
  qrExit?: PostCardQrExit | undefined;
  headerTitle?: PostCardHeaderTitle | undefined;
}

/** True when a card has any of the ending settings that change its drawing over time. */
export function hasCardEnding(card: PostCardEnding): boolean {
  return !!(card.enter || card.ring || card.qrExit);
}

/** The ending settings of a card, or null when it has none of them. */
export function cardEndingOf(card: PostCardEnding): PostCardEnding | null {
  if (!hasCardEnding(card) && card.headerTitle !== "clip") return null;
  return {
    ...(card.enter ? { enter: card.enter } : {}),
    ...(card.ring ? { ring: card.ring } : {}),
    ...(card.qrExit ? { qrExit: card.qrExit } : {}),
    ...(card.headerTitle === "clip" ? { headerTitle: "clip" as const } : {}),
  };
}

// ---------------------------------------------------------------------------
// The card's pieces
// ---------------------------------------------------------------------------

/** A box in fractions of the card's own box. */
export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CardPieceKind = "start" | "step" | "qr" | "mandala";

/** One tile of the card, measured from its drawing. */
export interface CardPiece {
  kind: CardPieceKind;
  /** A step's index, 0 for pictograph 1. */
  step?: number;
  /** The tile's box, backing included. */
  rect: CardRect;
  /** The pictograph's cell inside it, which the ring outlines. */
  cell: CardRect;
}

/** What a card's drawing measures to, all in fractions of its box. */
export interface CardLayout {
  pieces: CardPiece[];
  /** The QR code's own square inside its tile, when it shows one. */
  qr?: CardRect | undefined;
  /** The header word's letters, when the header draws a word. */
  word?: CardRect | undefined;
}

/** Rows closer than this share of the card count as one row. */
const SAME_ROW = 0.01;

/**
 * The tiles in the order they arrive: the tiles that are not pictographs
 * (start, QR, mandalas), top row first and left to right, then pictographs 1
 * to N. Returns indices into `pieces`.
 */
export function cascadeOrder(pieces: readonly CardPiece[]): number[] {
  const indexed = pieces.map((piece, index) => ({ piece, index }));
  const others = indexed
    .filter(({ piece }) => piece.kind !== "step")
    .sort((a, b) =>
      Math.abs(a.piece.rect.y - b.piece.rect.y) > SAME_ROW
        ? a.piece.rect.y - b.piece.rect.y
        : a.piece.rect.x - b.piece.rect.x
    );
  const steps = indexed
    .filter(({ piece }) => piece.kind === "step")
    .sort((a, b) => (a.piece.step ?? 0) - (b.piece.step ?? 0));
  return [...others, ...steps].map(({ index }) => index);
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** The smooth ease every fade here uses. */
export function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function fade(seconds: number, from: number, length: number): number {
  if (length <= 0) return seconds >= from ? 1 : 0;
  return smoothstep((seconds - from) / length);
}

/**
 * How visible the header band (and every part of the card that is no tile)
 * is at `seconds`, and the `position`th tile in arrival order.
 */
export function cascadeHeader(enter: PostCardEnter, seconds: number): number {
  return fade(seconds, 0, enter.each ?? CARD_CASCADE_EACH_SECONDS);
}

export function cascadeTile(
  enter: PostCardEnter,
  seconds: number,
  position: number
): number {
  const step = enter.step ?? CARD_CASCADE_STEP_SECONDS;
  return fade(
    seconds,
    CARD_CASCADE_FIRST_TILE_SECONDS + position * step,
    enter.each ?? CARD_CASCADE_EACH_SECONDS
  );
}

/** When the last tile of `tiles` has fully arrived. */
export function cascadeSeconds(enter: PostCardEnter, tiles: number): number {
  const step = enter.step ?? CARD_CASCADE_STEP_SECONDS;
  const each = enter.each ?? CARD_CASCADE_EACH_SECONDS;
  if (tiles <= 0) return each;
  return Math.max(
    each,
    CARD_CASCADE_FIRST_TILE_SECONDS + (tiles - 1) * step + each
  );
}

/**
 * Seconds per ring step: the clip's own, else one beat of the song's grid.
 * Null when neither is known, and the ring then does not draw.
 */
export function ringEvery(
  ring: PostCardRing,
  beatSeconds: number | null
): number | null {
  if (ring.every !== undefined) return ring.every;
  return beatSeconds !== null && beatSeconds >= CARD_RING_CROSSFADE_SECONDS
    ? beatSeconds
    : null;
}

/** When the ring reaches pictograph `step` (0 for pictograph 1). */
export function ringStepSeconds(
  ring: PostCardRing,
  every: number,
  step: number
): number {
  return ring.at + (ring.late ?? CARD_RING_LATE_SECONDS) + step * every;
}

/** Where the ring is: each pictograph it shows on, and how strong. */
export interface RingMark {
  step: number;
  strength: number;
}

/**
 * The ring at `seconds` over a card of `steps` pictographs: on one
 * pictograph, or two while a step cross-fades. Before its first time there
 * is none; after the last pictograph it stays there.
 */
export function ringMarks(
  ring: PostCardRing,
  seconds: number,
  steps: number,
  beatSeconds: number | null
): RingMark[] {
  const every = ringEvery(ring, beatSeconds);
  if (every === null || steps <= 0) return [];
  const half = CARD_RING_CROSSFADE_SECONDS / 2;
  // How far the ring has come onto pictograph `step`: 0 before its cross-fade,
  // 1 after it. Its strength there is that, less how far it has gone on.
  const arrived = (step: number) =>
    step >= steps
      ? 0
      : smoothstep(
          (seconds - (ringStepSeconds(ring, every, step) - half)) /
            CARD_RING_CROSSFADE_SECONDS
        );
  const first = ringStepSeconds(ring, every, 0) - half;
  if (seconds < first) return [];
  const near = Math.min(
    steps - 1,
    Math.max(0, Math.floor((seconds - first) / every))
  );
  const marks: RingMark[] = [];
  for (const step of [near - 1, near, near + 1]) {
    if (step < 0 || step >= steps) continue;
    const strength = arrived(step) - arrived(step + 1);
    if (strength > 0) marks.push({ step, strength });
  }
  return marks;
}

/** The QR's flight at `seconds`, or null before it leaves. */
export interface QrFlight {
  /** Eased share of the way to the landing box, 0 to 1. */
  progress: number;
  /** How visible the rest of the card still is, 1 to 0. */
  rest: number;
  /** How visible the caption is. */
  caption: number;
}

export function qrFlight(
  qrExit: PostCardQrExit,
  seconds: number
): QrFlight | null {
  if (seconds < qrExit.at) return null;
  const length = qrExit.seconds ?? CARD_QR_EXIT_SECONDS;
  const raw = clamp01((seconds - qrExit.at) / length);
  const progress = smoothstep(raw);
  return {
    progress,
    rest: 1 - progress,
    caption: smoothstep(raw / CARD_QR_CAPTION_IN_SHARE),
  };
}

/**
 * Where the QR lands, in frame fractions, on a frame `aspect` wide for each
 * unit of height: the clip's box, else the default square.
 */
export function qrLandingBox(
  qrExit: PostCardQrExit,
  aspect: number
): PostFrameBox {
  if (qrExit.to) return qrExit.to;
  const width = CARD_QR_LANDING_WIDTH;
  return {
    x: (1 - width) / 2,
    y: CARD_QR_LANDING_TOP,
    width,
    height: width * aspect,
  };
}

/** A box partway from `from` to `to`. */
export function lerpBox<T extends CardRect>(
  from: T,
  to: T,
  share: number
): CardRect {
  const mix = (a: number, b: number) => a + (b - a) * share;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    height: mix(from.height, to.height),
  };
}

// ---------------------------------------------------------------------------
// One frame
// ---------------------------------------------------------------------------

/** Everything the card draws at one time, for its painter. */
export interface CardEndingFrame {
  /** The header band and every part of the card that is no tile. */
  backing: number;
  /** Each tile's visibility, in `layout.pieces` order. */
  pieces: number[];
  /** The ring on each pictograph it shows on: the tile index and strength. */
  rings: { piece: number; strength: number }[];
  /** The QR's flight, once it has left its tile. */
  qr: QrFlight | null;
  /** True when the frame is the card exactly as drawn, with nothing to add. */
  plain: boolean;
}

/**
 * The card at `seconds` into its clip. `beatSeconds` is one beat of the
 * song's grid, or null when the post has none.
 */
export function cardEndingFrame(
  ending: PostCardEnding,
  seconds: number,
  layout: CardLayout,
  beatSeconds: number | null
): CardEndingFrame {
  const { pieces } = layout;
  const visible = pieces.map(() => 1);
  let backing = 1;
  if (ending.enter) {
    backing = cascadeHeader(ending.enter, seconds);
    cascadeOrder(pieces).forEach((pieceIndex, position) => {
      visible[pieceIndex] = cascadeTile(ending.enter!, seconds, position);
    });
  }
  const qr = ending.qrExit ? qrFlight(ending.qrExit, seconds) : null;
  if (qr) {
    backing *= qr.rest;
    pieces.forEach((piece, index) => {
      // The tile the QR left is empty from the first frame of the move.
      visible[index] = piece.kind === "qr" ? 0 : visible[index]! * qr.rest;
    });
  }
  const rings: CardEndingFrame["rings"] = [];
  if (ending.ring) {
    const stepPieces = new Map<number, number>();
    pieces.forEach((piece, index) => {
      if (piece.kind === "step" && piece.step !== undefined)
        stepPieces.set(piece.step, index);
    });
    for (const mark of ringMarks(
      ending.ring,
      seconds,
      stepPieces.size,
      beatSeconds
    )) {
      const piece = stepPieces.get(mark.step);
      if (piece === undefined) continue;
      // A ring on a tile still arriving, or leaving, shares its visibility.
      const strength = mark.strength * visible[piece]!;
      if (strength > 0) rings.push({ piece, strength });
    }
  }
  const plain =
    backing === 1 &&
    visible.every((value) => value === 1) &&
    rings.length === 0 &&
    qr === null;
  return { backing, pieces: visible, rings, qr, plain };
}

// ---------------------------------------------------------------------------
// The title hand-off
// ---------------------------------------------------------------------------

/** Seconds a titles clip takes to glide onto the card's header. */
export const CARD_TITLE_LANDING_SECONDS = 0.6;
/** Seconds the titles' spoken line takes to fade out of, and back into, a quiet span. */
export const TITLES_QUIET_FADE_SECONDS = 0.3;
