/**
 * How a reflow page's blocks become what FlowFrame draws, and how those
 * pieces split into screens.
 *
 * `flowRenderItems` turns a page's GuideBlock[] into render items: plain
 * blocks, and sequence showcases that own the text written about them. Given
 * the window's room it also cuts them into screens, one figure with its words
 * per screen, so a topic page shows one screen at a time, the page never
 * scrolls (2026-10-24 guide fit pass) and, on a page with a figure, no screen
 * is words alone (2026-11-06). `flowScreens` groups the cut for the host.
 *
 * Both are pure so the screen split is tested without a browser.
 */
import type { GuideBlock } from "./guide-content-blocks";
import { stripHtml, taglineInIntro } from "./flow-intro";
import { htmlSentences } from "../../_components/sentences";
import {
  captionLabel,
  packPieces,
  type PackPiece,
} from "../../_components/fit/pack-words";
import type { ScreenRoom } from "../../_components/fit/guide-screen-url";

export type CardBlock = Extract<GuideBlock, { kind: "pictographGroup" }>;

export type FlowRenderItem = (
  | { type: "block"; block: GuideBlock }
  | {
      type: "showcase";
      card: CardBlock;
      text: GuideBlock[];
      variant: "feature" | "compact";
      /** Its words came from around it, and its caption still shows. */
      keepCaption?: boolean;
      /** The page's words have this screen; the examples come on the next. */
      holdPool?: boolean;
    }
) & {
  /** Which screen it is on, once the page is cut for a window. */
  screen?: number;
};

// Words under the title leave this share of the room's words for the figure.
const HERO_TAGLINE_SHARE = 0.5;

/**
 * A tagline short enough to stand under the page's title. A longer one reads
 * as the page's first words, so the cut holds it with the first figure and
 * the page never pans for it (2026-11-06).
 */
/** The tagline's sentence appears later on the page, or in a pool's example. */
function pageRepeats(content: readonly GuideBlock[], tagline: string): boolean {
  const tag = stripHtml(tagline);
  return content.some((b) =>
    b.kind === "prose"
      ? stripHtml(b.html).includes(tag)
      : b.kind === "pictographGroup" &&
        (b.pool?.entries ?? []).some((e) => stripHtml(e.proseHtml).includes(tag))
  );
}

export function taglineInHero(tagline: string, room?: ScreenRoom): boolean {
  return !room || stripHtml(tagline).length <= room.over * HERO_TAGLINE_SHARE;
}

const isCard = (b: GuideBlock): b is CardBlock =>
  b.kind === "pictographGroup" && !!b.card;
const isFlowText = (b: GuideBlock) =>
  b.kind === "prose" || b.kind === "glyphImage";

/**
 * A prose block that introduces what comes next rather than commenting on
 * what came before: it says so with `attach: "next"`, or it ends with a colon
 * ("Here's one that switches between them:").
 */
export function isLeadIn(b: GuideBlock): boolean {
  if (b.kind !== "prose") return false;
  if (b.attach === "next") return true;
  if (b.attach === "previous") return false;
  return /:\s*$/.test(stripHtml(b.html));
}

// Substantial = a heading, or more plain-text than a caption-sized label.
/**
 * The print sheets broke lines by hand to fit their columns. On a screen a
 * break inside a sentence ("the hub that<br>everything revolves around")
 * strands a few words on their own line, so a single break followed by a
 * lowercase word becomes a space and the line wraps where the screen needs.
 * Breaks between sentences, list lines and paragraph gaps stay.
 */
export function unbreakSentences(html: string): string {
  return html.replace(
    /(<br\s*\/?>)+(\s*)(?=(?:<[^>]+>)*[a-z])/g,
    (match) => (/<br[^>]*>[\s]*<br/i.test(match) ? match : " ")
  );
}
const unbreakProse = (b: GuideBlock): GuideBlock =>
  b.kind === "prose" && b.html.includes("<br")
    ? { ...b, html: unbreakSentences(b.html) }
    : b;

const FEATURE_TEXT_CHARS = 180;
function showcaseVariant(text: GuideBlock[]): "feature" | "compact" {
  if (text.some((b) => b.kind === "heading")) return "feature";
  const chars = text.reduce(
    (n, b) => n + (b.kind === "prose" ? stripHtml(b.html).length : 0),
    0
  );
  return chars > FEATURE_TEXT_CHARS ? "feature" : "compact";
}

type BlockItem = { type: "block"; block: GuideBlock };

/**
 * The page title (level-1 heading) is drawn by the host, so it is dropped.
 * An intro paragraph that is only the tagline goes too; when it says more,
 * the host drops its tagline instead (flow-intro.ts).
 *
 * Which text a `card: true` group owns:
 *   - Text directly above it that starts with a heading (a whole
 *     mini-section), or the lead-in prose directly above it (`isLeadIn`).
 *   - Trailing prose up to the next heading, card or lead-in: the card's own
 *     label or explanation.
 *   - Cards in a run of 2+ own nothing; the shared prose stays above.
 */
export function flowRenderItems(
  content: readonly GuideBlock[],
  tagline: string,
  localize: (b: GuideBlock) => GuideBlock = (b) => b,
  {
    room,
  }: {
    /**
     * The window's room for words: cuts the page into screens. Unset, the
     * whole page in reading order with each figure once.
     */
    room?: ScreenRoom;
  } = {}
): FlowRenderItem[] {
  const intro = taglineInIntro(content, tagline);
  const inHero = taglineInHero(tagline, room);
  const dropBlock =
    intro === "same" && inHero && (room?.bandShowsTagline ?? true)
      ? introBlock(content, tagline)
      : null;
  const blocks: GuideBlock[] = [];
  // A long tagline the page does not repeat becomes its first words.
  if (intro === "none" && !inHero && !pageRepeats(content, tagline))
    blocks.push({ kind: "prose", html: tagline });
  for (const b of content) {
    if (b.kind === "heading" && b.level === 1) continue;
    if (b === dropBlock) continue;
    blocks.push(unbreakProse(localize(b)));
  }

  const items: FlowRenderItem[] = [];
  const isSectionHead = (it: FlowRenderItem) =>
    it.type === "block" && it.block.kind === "heading" && it.block.level !== 1;
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (!isCard(b)) {
      items.push({ type: "block", block: b });
      i++;
      continue;
    }
    const run: CardBlock[] = [];
    while (i < blocks.length && isCard(blocks[i]!))
      run.push(blocks[i++] as CardBlock);
    if (run.length >= 2) {
      for (const c of run)
        items.push({ type: "showcase", card: c, text: [], variant: "compact" });
      continue;
    }
    // Lone card: walk back over the text run directly above it.
    let k = items.length;
    while (k > 0) {
      const it = items[k - 1]!;
      if (it.type === "block" && isFlowText(it.block)) k--;
      else break;
    }
    let from = items.length;
    if (k < items.length && k > 0 && isSectionHead(items[k - 1]!)) {
      from = k - 1;
    } else {
      // No heading above the run: take only its lead-in tail.
      let j = items.length;
      while (j > k && isLeadIn((items[j - 1] as BlockItem).block)) j--;
      if (j === items.length && j > 0 && isSectionHead(items[j - 1]!)) {
        // A heading with no text, directly above the card.
        j--;
      }
      from = j;
    }
    const before = items.splice(from).map((it) => (it as BlockItem).block);
    const after: GuideBlock[] = [];
    while (i < blocks.length && isFlowText(blocks[i]!) && !isLeadIn(blocks[i]!))
      after.push(blocks[i++]!);
    const text = [...before, ...after];
    items.push({
      type: "showcase",
      card: run[0]!,
      text,
      variant: showcaseVariant(text),
    });
  }
  return room ? cutForRoom(items, room) : items;
}

function introBlock(
  content: readonly GuideBlock[],
  tagline: string
): GuideBlock | null {
  const tag = stripHtml(tagline);
  let seenProse = false;
  for (const b of content) {
    if (!seenProse && b.kind === "heading") continue;
    if (b.kind !== "prose") return null;
    seenProse = true;
    if (stripHtml(b.html) === tag) return b;
  }
  return null;
}

const isFigure = (it: FlowRenderItem) =>
  it.type === "showcase" ||
  it.block.kind === "pictograph" ||
  it.block.kind === "pictographGroup" ||
  it.block.kind === "gridFigure" ||
  it.block.kind === "gridExplorer";

/** A gallery figure (not a sequence): several sit together on one screen. */
const isGallery = (it: FlowRenderItem) =>
  it.type === "block" &&
  (it.block.kind === "pictograph" ||
    (it.block.kind === "pictographGroup" && it.block.layout !== "strip"));

/**
 * A bare step strip (a sequence drawn as a strip, no player of its own). A
 * short one alone leaves most of a screen empty (Reversals' three-cell
 * strips, 2026-11-07), so consecutive strips share a screen like galleries.
 */
export const isBareStrip = (it: FlowRenderItem) =>
  it.type === "block" &&
  it.block.kind === "pictographGroup" &&
  it.block.layout === "strip" &&
  !it.block.card;

/**
 * A figure card in a run of them (the Staff Motions opener): it owns no
 * words, so the run shares one screen side by side, each under its own
 * small title (2026-11-11).
 */
export const isFigureCardInRun = (it: FlowRenderItem) =>
  it.type === "showcase" && !!it.card.figureCard && it.text.length === 0;

/** Figures that pack together on one screen while their tiles fit. */
export const isPackable = (it: FlowRenderItem) =>
  isGallery(it) || isBareStrip(it) || isFigureCardInRun(it);

const headingOf = (it: FlowRenderItem): string | null => {
  if (it.type === "block")
    return it.block.kind === "heading" && it.block.level !== 1
      ? it.block.text
      : null;
  const h = it.text.find((b) => b.kind === "heading");
  return h && h.kind === "heading" ? h.text : null;
};

const captionOf = (it: FlowRenderItem): string | null => {
  if (it.type === "showcase") return it.card.caption ?? null;
  const b = it.block;
  if (b.kind === "pictographGroup" || b.kind === "pictograph")
    return b.caption ?? null;
  return null;
};

type FigureStop = {
  /** The figure, or a set of gallery figures that share a screen. */
  figures: FlowRenderItem[];
  /** Words above it (for a showcase, the start of its text column). */
  before: GuideBlock[];
  /** Words under it, its notes (for a showcase, the end of its text column). */
  after: GuideBlock[];
};

const HEADING_COST = 70;
// The small section label over a heading ("Shift" over "Prospin").
const KICKER_COST = 20;
const GLYPH_COST = 110;
const PARAGRAPH_COST = 20;
const SHORT_PARAGRAPH = 40;
// A showcase's text column never drops below this, however tall its strip.
const MIN_WORDS = 120;
/** Stands in for a page's lead note while its first screen's words pack. */
const LEAD_NOTE: GuideBlock = { kind: "prose", html: "" };

function wordCost(b: GuideBlock): number {
  if (b.kind === "heading")
    return HEADING_COST + (b.kicker ? KICKER_COST : 0);
  if (b.kind === "glyphImage") return GLYPH_COST;
  if (b.kind === "printOnly") return wordsCost(b.flow);
  if (b.kind === "prose")
    return Math.max(stripHtml(b.html).length, SHORT_PARAGRAPH) + PARAGRAPH_COST;
  return 0;
}
function wordsCost(blocks: readonly GuideBlock[]): number {
  return blocks.reduce((n, b) => n + wordCost(b), 0);
}

// A bare strip's cells sit fused, with no gap or caption between them, so
// three of them take about the room of two captioned gallery tiles
// (2026-11-07: counted one each, a phone gave every Reversals strip its own
// screen). A screen that still overflows recuts itself.
const STRIP_CELL_COST = 2 / 3;
/** How many screens of words (`room.over`) may come before packed strips:
    past that, every word screen carries all of them and a phone shrinks them
    to thumbnails. Measured on Reversals 2026-11-07: a phone fits about one
    and a half screens of words with two strips stacked. */
const STRIP_WORD_SCREENS = 1.5;
const tileCount = (it: FlowRenderItem): number => {
  if (it.type !== "block" || it.block.kind !== "pictographGroup") return 1;
  const cells = it.block.items.length;
  return isBareStrip(it) ? Math.ceil(cells * STRIP_CELL_COST) : cells;
};

const hasPoolWords = (card: CardBlock): boolean =>
  (card.pool?.entries.length ?? 0) > 1;

/** What a card's strip takes from the words beside it. */
function stripCost(card: CardBlock, room: ScreenRoom): number {
  const rows = Math.ceil(card.items.length / room.stripCols);
  return Math.max(0, rows - 1) * room.stripRowChars;
}

/** What a card's own figure takes from the words beside it. */
function figureCost(card: CardBlock, room: ScreenRoom): number {
  // A figure card's room for words is its own (room.card).
  if (card.figureCard) return 0;
  const poolWords = hasPoolWords(card)
    ? Math.max(...card.pool!.entries.map((e) => stripHtml(e.proseHtml).length)) +
      120
    : 0;
  return stripCost(card, room) + poolWords;
}

const TAG_OPENS = /<[a-z][^>]*>/gi;
const TAG_CLOSES = /<\/[a-z][^>]*>/gi;
const VOID_TAG = /<(?:br|img|hr|wbr)[^>]*>/gi;
const balanced = (html: string) =>
  (html.replace(VOID_TAG, "").match(TAG_OPENS)?.length ?? 0) ===
  (html.match(TAG_CLOSES)?.length ?? 0);

/** A paragraph's sentences, its line breaks counting as breaks between them. */
function proseSentences(html: string): string[] {
  const lines = html.split(/(?:<br\s*\/?>\s*)+/i).filter((l) => l.trim());
  // A bullet line is one piece: cut inside it and a screen could end on half
  // a list item or start on a bare "•".
  return (lines.every(balanced) ? lines : [html]).flatMap((l) =>
    /^(?:\s|<[^>]+>)*•/.test(l) ? [l.trim()] : htmlSentences(l)
  );
}

/** The paragraph a sentence piece was cut from (`rejoinSentences`). */
const pieceSource = new WeakMap<GuideBlock, GuideBlock & { kind: "prose" }>();

/**
 * A paragraph longer than a screen breaks at its sentences. `splitOver`
 * (default: the budget) is the cost past which a paragraph breaks.
 */
function wordPieces(
  blocks: readonly GuideBlock[],
  budget: number,
  splitOver = budget
): PackPiece<GuideBlock>[] {
  return blocks.flatMap((b) => {
    const cost = wordCost(b);
    const parts =
      b.kind === "prose" && cost > splitOver ? proseSentences(b.html) : [];
    if (b.kind !== "prose" || parts.length < 2)
      return [{ piece: b, cost, leads: b.kind !== "prose" || isLeadIn(b) }];
    // Broken early (a figure card), its sentences join up again when they
    // land together, so only the first pays for starting a paragraph.
    const rejoins = splitOver < budget;
    return parts.map((html, n) => {
      const piece = { ...b, html };
      pieceSource.set(piece, b);
      return {
        piece,
        cost: rejoins && n > 0 ? stripHtml(html).length : wordCost(piece),
        leads: n === parts.length - 1 && isLeadIn(b),
      };
    });
  });
}

/**
 * Sentences of one paragraph that land on the same screen read as that
 * paragraph again, its own breaks kept; a whole paragraph is the paragraph.
 */
function rejoinSentences(part: readonly GuideBlock[]): GuideBlock[] {
  const out: GuideBlock[] = [];
  for (let i = 0; i < part.length; ) {
    const src = pieceSource.get(part[i]!);
    if (!src) {
      out.push(part[i++]!);
      continue;
    }
    const run: GuideBlock[] = [];
    while (i < part.length && pieceSource.get(part[i]!) === src)
      run.push(part[i++]!);
    const htmls = run.map((b) => (b as { html: string }).html);
    const from = src.html.indexOf(htmls[0]!);
    let end = from;
    for (const h of htmls) {
      const at = end < 0 ? -1 : src.html.indexOf(h, end);
      end = at < 0 ? -1 : at + h.length;
    }
    const html =
      from >= 0 && end >= 0 ? src.html.slice(from, end) : htmls.join(" ");
    out.push(html.trim() === src.html.trim() ? src : { ...src, html });
  }
  return out;
}

/**
 * Hands every run of words to a figure and draws one screen per figure, more
 * when its words need them.
 *   - Headings, lead-ins and anything before the first figure go with the next
 *     figure. Notes stay with the figure above them while that screen has
 *     room; past it they go with the next figure, or with the last one when
 *     no figure follows.
 *   - Gallery figures and bare strips with nothing between them share a
 *     screen while their tiles (a strip's cells) fit (`room.tiles`); a strip
 *     also needs the words before it to stay short (`STRIP_WORD_SCREENS`).
 *   - A page with no figure is cut by words alone.
 */
function cutForRoom(
  items: readonly FlowRenderItem[],
  room: ScreenRoom
): FlowRenderItem[] {
  const stops: FigureStop[] = [];
  let pending: GuideBlock[] = [];
  // A showcase that owns its words: one figure with a text column.
  const ownsWords = (it: FlowRenderItem) =>
    it.type === "showcase" && !isFigureCardInRun(it);
  const budgetOf = (stop: FigureStop): number => {
    const first = stop.figures[0]!;
    if (!ownsWords(first) || first.type !== "showcase") return room.over;
    // A figure card holds one size on every screen its words run across,
    // so its words get the room beside it or over it, and no less.
    if (first.card.figureCard) return room.card ?? room.beside;
    return Math.max(room.beside - figureCost(first.card, room), MIN_WORDS);
  };
  const stopWords = (stop: FigureStop): number => {
    const first = stop.figures[0]!;
    return (
      wordsCost(stop.before) +
      wordsCost(stop.after) +
      (first.type === "showcase" && ownsWords(first) ? wordsCost(first.text) : 0)
    );
  };

  for (const it of items) {
    const stop = stops[stops.length - 1];
    if (!isFigure(it)) {
      const b = (it as BlockItem).block;
      if (b.kind === "rule") continue;
      const note = b.kind === "prose" && !isLeadIn(b);
      if (
        stop &&
        pending.length === 0 &&
        note &&
        stopWords(stop) + wordCost(b) <= budgetOf(stop)
      ) {
        stop.after.push(b);
      } else {
        pending.push(b);
      }
      continue;
    }
    if (
      stop &&
      pending.length === 0 &&
      stop.after.length === 0 &&
      isPackable(it) &&
      stop.figures.every(isPackable) &&
      stop.figures.reduce((n, f) => n + tileCount(f), 0) + tileCount(it) <=
        room.tiles &&
      // A strip joins only while the words before it stay short enough to
      // leave the strips room (STRIP_WORD_SCREENS).
      (!isBareStrip(it) || wordsCost(stop.before) <= room.over * STRIP_WORD_SCREENS)
    ) {
      stop.figures.push(it);
      continue;
    }
    stops.push({ figures: [it], before: pending, after: [] });
    pending = [];
  }

  const out: FlowRenderItem[] = [];
  if (stops.length === 0) {
    packPieces(wordPieces(pending, room.alone), room.alone).forEach(
      (part, screen) => {
        for (const block of part) out.push({ type: "block", block, screen });
      }
    );
    return out;
  }
  // The words after the last figure stay with it.
  stops[stops.length - 1]!.after.push(...pending);

  let screen = 0;
  for (const stop of stops) {
    const first = stop.figures[0]!;
    const budget = budgetOf(stop);
    // The first screen shares its room with the page's lead note, if any:
    // the note goes in as a piece of words ahead of the rest, then leaves.
    const lead = stop === stops[0] ? (room.lead ?? 0) : 0;
    // A figure card keeps one size on every screen, so words that overflow
    // its room break at any sentence, not only inside a paragraph longer
    // than a screen; sentences that land together join up again.
    const figureCard =
      first.type === "showcase" && ownsWords(first) && !!first.card.figureCard;
    const pack = (blocks: readonly GuideBlock[], b: number): GuideBlock[][] => {
      if (figureCard) {
        // Whole paragraphs first: they read best. Sentences break only when
        // a screen of whole paragraphs would run past the card's room, or
        // when breaking them saves a screen.
        const whole = packPieces(wordPieces(blocks, b), b);
        if (wordsCost(blocks) <= b) return whole;
        const split = packPieces(wordPieces(blocks, b, 0), b).map(
          rejoinSentences
        );
        // A short tail joins the screen before it (packPieces) and can run
        // that screen past the room; a cut that does is no saving.
        const fits = (parts: GuideBlock[][]) =>
          parts.every((part) => wordsCost(part) <= b);
        if (!fits(whole)) return split;
        return whole.length <= split.length || !fits(split) ? whole : split;
      }
      const pieces = wordPieces(blocks, b);
      if (!lead) return packPieces(pieces, b);
      const parts = packPieces(
        [{ piece: LEAD_NOTE, cost: lead, leads: false }, ...pieces],
        b
      );
      // The note may take the first screen to itself beside its figure.
      parts[0] = parts[0]!.filter((p) => p !== LEAD_NOTE);
      return parts;
    };
    if (first.type === "showcase" && ownsWords(first)) {
      const words = [...stop.before, ...first.text, ...stop.after];
      // A pool's own words change length as it cycles. When the longest of them
      // and the page's words won't share a screen, the page's words run first
      // with the figure, and the examples and their button follow.
      const cost = figureCost(first.card, room);
      const holdPool =
        hasPoolWords(first.card) &&
        words.length > 0 &&
        wordsCost(words) > room.beside - cost;
      const wordsBudget = holdPool
        ? Math.max(room.beside - stripCost(first.card, room), MIN_WORDS)
        : budget;
      const parts = pack(words, wordsBudget);
      if (holdPool) parts.push([]);
      const keepCaption = first.text.length === 0 && !!first.card.caption;
      (parts.length ? parts : [[]]).forEach((part, k) => {
        out.push({
          ...first,
          text: part,
          holdPool: holdPool && k < parts.length - 1,
          // One figure at one size on every screen its words run across.
          variant: parts.length > 1 ? "feature" : showcaseVariant(part),
          keepCaption: keepCaption && part.length > 0,
          screen: screen++,
        });
      });
      continue;
    }
    // Words above and notes below: each screen keeps the order they read in.
    const isAbove = (b: GuideBlock) =>
      stop.before.includes(b) ||
      (b.kind === "prose" &&
        stop.before.some((o) => o.kind === "prose" && o.html.includes(b.html)));
    const parts = pack([...stop.before, ...stop.after], budget);
    for (const part of parts.length ? parts : [[]]) {
      for (const block of part.filter(isAbove))
        out.push({ type: "block", block, screen });
      for (const f of stop.figures) out.push({ ...f, screen });
      for (const block of part.filter((b) => !isAbove(b)))
        out.push({ type: "block", block, screen });
      screen++;
    }
  }
  return out;
}

export type FlowScreen = {
  /** Indexes into the render items, in order. */
  items: number[];
  /** The pill label: the screen's heading, else its figure's caption. */
  label: string;
};

/**
 * Groups cut items into screens. A screen's label is its heading; a screen
 * that goes on with the figure before it keeps that screen's label; otherwise
 * the plain part of its figure's caption, else the label before it. A screen
 * is never "Part 4". The first screen is named by its heading, else
 * `introLabel`, never by a caption.
 */
export function flowScreens(
  items: readonly FlowRenderItem[],
  introLabel = "Intro"
): FlowScreen[] {
  const groups = new Map<number, number[]>();
  items.forEach((it, idx) => {
    const n = it.screen ?? 0;
    const group = groups.get(n);
    if (group) group.push(idx);
    else groups.set(n, [idx]);
  });
  const figureKey = (it: FlowRenderItem) =>
    it.type === "showcase" ? it.card : isFigure(it) ? it.block : null;
  let previous = introLabel;
  let previousFigure: unknown = null;
  return [...groups.values()].map((group, n) => {
    const all = group.map((idx) => items[idx]!);
    const figure = all.map(figureKey).find((k) => k !== null) ?? null;
    const heading = all.map(headingOf).find((h) => h !== null);
    const caption = all
      .map((it) => captionLabel(captionOf(it)))
      .find((c) => c !== null);
    const goesOn = figure !== null && figure === previousFigure;
    // The first screen shares its room with the intro words, and the first
    // strip's own heading only arrives on the next screen, so its caption
    // ("Start + steps 1–4") would name the whole opening. It takes the intro
    // label instead.
    const label =
      n === 0
        ? (heading ?? introLabel)
        : (heading ?? (goesOn ? previous : caption) ?? previous);
    previous = label;
    previousFigure = figure;
    return { items: group, label };
  });
}
