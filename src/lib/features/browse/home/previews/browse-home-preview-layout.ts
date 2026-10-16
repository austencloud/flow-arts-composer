/**
 * Where things sit in the Browse home's tile previews. Each scene reads its
 * box (the shared Create preview box measures it) and composes for one of
 * the three shapes classifyPreviewShape() names. Pure, so tests check the
 * geometry without drawing.
 */
import type { MethodPreviewShape } from "#lib/features/create/shared/components/method-previews/method-preview-layout.js";

export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A sequence card: its pictograph square, and room for its word under it. */
export interface PreviewCard extends PreviewRect {
  /** The pictograph's side. */
  art: number;
  /** Whether the card has room for the sequence's word under its art. */
  word: boolean;
}

/** The inset between a card's frame and its art. */
export const CARD_PAD = 3;
/** The gap between cards. */
export const CARD_GAP = 8;
/** A card shows its word once its art is at least this wide. */
export const WORD_MIN_ART = 64;
/** The word line's height, as a share of the art. */
const WORD_SHARE = 0.2;

function cardFor(
  x: number,
  y: number,
  art: number,
  word: boolean
): PreviewCard {
  const wordHeight = word ? Math.round(art * WORD_SHARE) : 0;
  return {
    x,
    y,
    width: art + CARD_PAD * 2,
    height: art + CARD_PAD * 2 + wordHeight,
    art,
    word,
  };
}

/** The art side that lets a card fit `height`, word line included. */
function artForHeight(height: number, word: boolean): number {
  const room = height - CARD_PAD * 2;
  return Math.max(0, Math.floor(word ? room / (1 + WORD_SHARE) : room));
}

/**
 * A row of cards as tall as the box, centred, as many as fit up to `max`.
 * When fewer than `min` fit at full height the cards shrink so `min` fit.
 */
export function cardRow(
  width: number,
  height: number,
  min: number,
  max: number,
  words = true
): PreviewCard[] {
  if (!(width > 0) || !(height > 0) || max < 1) return [];
  let word = words && artForHeight(height, true) >= WORD_MIN_ART;
  let art = artForHeight(height, word);
  const cardWidth = (side: number) => side + CARD_PAD * 2;
  let count = Math.min(
    max,
    Math.floor((width + CARD_GAP) / (cardWidth(art) + CARD_GAP))
  );
  if (count < min) {
    count = Math.max(1, min);
    art = Math.max(
      0,
      Math.floor((width - CARD_GAP * (count - 1)) / count - CARD_PAD * 2)
    );
    word = words && art >= WORD_MIN_ART;
  }
  const span = count * cardWidth(art) + (count - 1) * CARD_GAP;
  const x0 = Math.floor((width - span) / 2);
  const sample = cardFor(0, 0, art, word);
  const y = Math.floor((height - sample.height) / 2);
  return Array.from({ length: count }, (_, index) =>
    cardFor(x0 + index * (cardWidth(art) + CARD_GAP), y, art, word)
  );
}

/** A 2×2 block of cards without words, centred in a square box. */
export function cardBlock(width: number, height: number): PreviewCard[] {
  if (!(width > 0) || !(height > 0)) return [];
  const gap = Math.max(3, Math.round(Math.min(width, height) * 0.06));
  const cell = Math.floor((Math.min(width, height) - gap) / 2);
  const art = Math.max(0, cell - CARD_PAD * 2);
  const span = cell * 2 + gap;
  const x0 = Math.floor((width - span) / 2);
  const y0 = Math.floor((height - span) / 2);
  return [0, 1, 2, 3].map((index) =>
    cardFor(
      x0 + (index % 2) * (cell + gap),
      y0 + Math.floor(index / 2) * (cell + gap),
      art,
      false
    )
  );
}

/** Explore sequences: a wall of public sequences. */
export function sequenceWall(
  shape: MethodPreviewShape,
  width: number,
  height: number
): PreviewCard[] {
  if (shape === "square") return cardBlock(width, height);
  return cardRow(width, height, 3, 5);
}

/**
 * Explore collections: stacks of sequences, each a few cards deep. A stack
 * opens into `fan`, a row of its cards across the box.
 */
export interface CollectionShelf {
  /** The top card of each stack, where the stack rests. */
  stacks: PreviewCard[];
  /** Where an opened stack's cards spread to. */
  fan: PreviewCard[];
}

/** How many cards deep a stack is. */
export const STACK_DEPTH = 3;

export function collectionShelf(
  shape: MethodPreviewShape,
  width: number,
  height: number
): CollectionShelf | null {
  if (!(width > 0) || !(height > 0)) return null;
  // A stack's back cards peek out by a share of the card on each side.
  const peek = 0.14;
  const fan = cardRow(width, height * 0.86, STACK_DEPTH, STACK_DEPTH, false);
  if (shape === "square") {
    const art = artForHeight(Math.min(width, height) / (1 + peek * 2), false);
    const card = cardFor(0, 0, art, false);
    return {
      stacks: [
        {
          ...card,
          x: Math.floor((width - card.width) / 2),
          y: Math.floor((height - card.height) / 2),
        },
      ],
      fan: fan.map((rect) => ({
        ...rect,
        y: rect.y + Math.round(height * 0.07),
      })),
    };
  }
  const slots = cardRow(width, height / (1 + peek), 2, 3, false);
  return {
    stacks: slots.map((slot) => ({
      ...slot,
      y: Math.floor((height - slot.height) / 2),
    })),
    fan: fan.map((rect) => ({
      ...rect,
      y: rect.y + Math.round(height * 0.07),
    })),
  };
}

/** Explore visuals: a tunnel and a mandala, side by side. */
export interface VisualsPair {
  tunnel: PreviewRect;
  mandala: PreviewRect;
}

export function visualsPair(width: number, height: number): VisualsPair | null {
  if (!(width > 0) || !(height > 0)) return null;
  const gap = Math.max(4, Math.round(Math.min(width, height) * 0.06));
  const side = Math.floor(Math.min(height, (width - gap) / 2));
  const span = side * 2 + gap;
  const x0 = Math.floor((width - span) / 2);
  const y = Math.floor((height - side) / 2);
  return {
    tunnel: { x: x0, y, width: side, height: side },
    mandala: { x: x0 + side + gap, y, width: side, height: side },
  };
}

/**
 * You: the card being saved, and your shelf of saved work. In a strip the
 * card sits on the left and the shelf fills the rest; in a square the shelf
 * is the badge in the corner the card flies into.
 */
export interface YouShelf {
  source: PreviewCard;
  /** Your saved cards, newest first. Empty in a square box. */
  slots: PreviewCard[];
  /** The plate behind the shelf, or the badge in a square box. */
  plate: PreviewRect;
  /** The heart on the source card. */
  heart: PreviewRect;
}

export function youShelf(
  shape: MethodPreviewShape,
  width: number,
  height: number
): YouShelf | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (shape === "square") {
    const side = Math.min(width, height);
    const art = artForHeight(side * 0.78, false);
    const source = cardFor(
      Math.floor((width - side) / 2),
      Math.floor((height - side) / 2),
      art,
      false
    );
    const badge = Math.round(side * 0.34);
    return {
      source,
      slots: [],
      plate: {
        x: Math.floor((width + side) / 2) - badge,
        y: Math.floor((height + side) / 2) - badge,
        width: badge,
        height: badge,
      },
      heart: heartOn(source),
    };
  }
  // The plate reaches past its cards by an inset, so the row sits inside
  // the box by that much on every side.
  const plateInset = 4;
  const row = cardRow(
    width - plateInset * 2,
    height - plateInset * 2,
    3,
    5
  ).map((card) => ({
    ...card,
    x: card.x + plateInset,
    y: card.y + plateInset,
  }));
  const [first, ...rest] = row;
  if (!first || rest.length === 0) return null;
  const last = rest[rest.length - 1]!;
  const plate = {
    x: rest[0]!.x - plateInset,
    y: rest[0]!.y - plateInset,
    width: last.x + last.width - rest[0]!.x + plateInset * 2,
    height: rest[0]!.height + plateInset * 2,
  };
  // The plate's inset would overlap the source card; nudge the source left.
  const source = { ...first, x: Math.max(0, first.x - plateInset) };
  return { source, slots: rest, plate, heart: heartOn(source) };
}

/** The heart button's spot: the card art's top-right corner. */
function heartOn(card: PreviewCard): PreviewRect {
  const size = Math.max(14, Math.round(card.art * 0.26));
  return {
    x: card.x + card.width - CARD_PAD - size - 2,
    y: card.y + CARD_PAD + 2,
    width: size,
    height: size,
  };
}

export function rectCenter(rect: PreviewRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
