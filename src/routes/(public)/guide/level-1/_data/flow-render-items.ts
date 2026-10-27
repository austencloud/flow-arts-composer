/**
 * How a reflow page's blocks become what FlowFrame draws, and how those
 * pieces split into screens.
 *
 * `flowRenderItems` turns a page's GuideBlock[] into render items: plain
 * blocks, and sequence showcases that own the text written about them.
 * `flowScreens` cuts the items into screens, one idea and its example per
 * screen, so a topic page shows one screen at a time and the page never
 * scrolls (2026-10-24 guide fit pass, the same rule as /codex).
 *
 * Both are pure so the screen split is tested without a browser.
 */
import type { GuideBlock } from "./guide-content-blocks";
import { stripHtml, taglineInIntro } from "./flow-intro";

export type CardBlock = Extract<GuideBlock, { kind: "pictographGroup" }>;

export type FlowRenderItem =
  | { type: "block"; block: GuideBlock }
  | {
      type: "showcase";
      card: CardBlock;
      text: GuideBlock[];
      variant: "feature" | "compact";
    };

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
    detachTextChars,
  }: {
    /**
     * A small window: a lone card whose text runs at least this long keeps
     * none of it. The text stays as plain blocks in reading order (its
     * heading and lead-in above, its notes below), so flowScreens can give
     * the words a screen and the figure a screen.
     */
    detachTextChars?: number;
  } = {}
): FlowRenderItem[] {
  const intro = taglineInIntro(content, tagline);
  const dropBlock = intro === "same" ? introBlock(content, tagline) : null;
  const blocks: GuideBlock[] = [];
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
    const chars = text.reduce(
      (n, b) => n + (b.kind === "prose" ? stripHtml(b.html).length : 0),
      0
    );
    if (detachTextChars !== undefined && chars >= detachTextChars) {
      for (const block of before) items.push({ type: "block", block });
      items.push({
        type: "showcase",
        card: run[0]!,
        text: [],
        variant: "compact",
      });
      for (const block of after) items.push({ type: "block", block });
      continue;
    }
    items.push({
      type: "showcase",
      card: run[0]!,
      text,
      variant: showcaseVariant(text),
    });
  }
  return items;
}

function introBlock(
  content: readonly GuideBlock[],
  tagline: string
): GuideBlock | null {
  const tag = stripHtml(tagline);
  for (const b of content) {
    if (b.kind === "heading" && b.level === 1) continue;
    if (b.kind !== "prose") return null;
    if (stripHtml(b.html) === tag) return b;
  }
  return null;
}

export type FlowScreen = {
  /** Indexes into the render items, in order. */
  items: number[];
  /** The pill label: the screen's heading, else its figure's caption. */
  label: string;
};

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

/**
 * One idea and its example per screen:
 *   - A heading starts a new screen once the current one holds a figure.
 *   - A second figure starts a new screen and takes the lead-in text above it
 *     (a heading, or prose that introduces it). Text that comments on the
 *     figure before stays with that figure.
 *   - Gallery figures with nothing between them stay together, so a set of
 *     letters reads as one set, unless `keepGalleriesTogether` is false
 *     (a laptop or phone, where a set of them would shrink past reading).
 *   - Text-only sections share a screen.
 *   - `textScreenMaxChars`: a screen of words alone ends before it passes
 *     that many characters, at a paragraph break.
 *   - `textScreenChars` (a small window): words that run at least that long
 *     before a figure, lead-in included, get a screen of their own and the
 *     figure follows on the next; notes that long after a figure get a
 *     screen after it. Neither has to pan.
 */
export function flowScreens(
  items: readonly FlowRenderItem[],
  introLabel = "Intro",
  {
    textScreenChars,
    textScreenMaxChars,
    keepGalleriesTogether = true,
    introOwnScreen = false,
  }: {
    textScreenChars?: number;
    textScreenMaxChars?: number;
    keepGalleriesTogether?: boolean;
    /** The page's opening words get a screen of their own when the first
     * figure is a showcase that brings its own words (a laptop window). */
    introOwnScreen?: boolean;
  } = {}
): FlowScreen[] {
  const groups: number[][] = [];
  let cur: number[] = [];
  let hasFigure = false;
  let lastFigure: FlowRenderItem | null = null;
  let textSinceFigure = 0;

  const flush = (keepFrom: number) => {
    const moved = cur.splice(keepFrom);
    if (cur.length) groups.push(cur);
    cur = moved;
    hasFigure = false;
    lastFigure = null;
    textSinceFigure = 0;
  };

  // Text after the last figure that introduces the next one: a heading, or
  // prose that leads in. It moves with that figure.
  const leadInStart = (): number => {
    let keep = cur.length;
    while (keep > 0) {
      const prev = items[cur[keep - 1]!]!;
      if (prev.type !== "block" || isFigure(prev)) break;
      if (headingOf(prev) !== null || isLeadIn(prev.block)) keep--;
      else break;
    }
    return keep;
  };
  const textChars = (from: number, to: number): number => {
    let n = 0;
    for (const idx of cur.slice(from, to)) {
      const it = items[idx]!;
      if (it.type === "block" && it.block.kind === "prose")
        n += stripHtml(it.block.html).length;
    }
    return n;
  };

  // The prose run starting at `idx`, up to the next heading or figure.
  const proseRunChars = (idx: number): number => {
    let n = 0;
    for (let k = idx; k < items.length; k++) {
      const it = items[k]!;
      if (isFigure(it) || headingOf(it) !== null) break;
      if (it.type === "block" && it.block.kind === "prose")
        n += stripHtml(it.block.html).length;
    }
    return n;
  };

  items.forEach((it, idx) => {
    const heading = headingOf(it);
    if (!isFigure(it)) {
      if (heading !== null && hasFigure) flush(cur.length);
      // A small window: notes that follow a figure and run long get a
      // screen of their own after it.
      else if (
        textScreenChars !== undefined &&
        hasFigure &&
        textSinceFigure === 0 &&
        proseRunChars(idx) >= textScreenChars
      )
        flush(cur.length);
      // A screen of words alone stops before it outgrows the window; the
      // next paragraph, and a heading just above it, start the next one.
      else if (
        textScreenMaxChars !== undefined &&
        !hasFigure &&
        it.type === "block" &&
        it.block.kind === "prose" &&
        textChars(0, cur.length) > 0 &&
        textChars(0, cur.length) + stripHtml(it.block.html).length >
          textScreenMaxChars
      ) {
        let keep = cur.length;
        while (keep > 0 && headingOf(items[cur[keep - 1]!]!) !== null) keep--;
        if (textChars(0, keep) > 0) flush(keep);
      }
      cur.push(idx);
      if (hasFigure) textSinceFigure++;
      return;
    }
    if (hasFigure) {
      const together =
        keepGalleriesTogether &&
        heading === null &&
        textSinceFigure === 0 &&
        lastFigure !== null &&
        isGallery(lastFigure) &&
        isGallery(it);
      if (!together) flush(leadInStart());
    }
    if (
      introOwnScreen &&
      groups.length === 0 &&
      !hasFigure &&
      it.type === "showcase" &&
      it.text.length > 0 &&
      textChars(0, cur.length) > 0
    )
      flush(cur.length);
    else if (!hasFigure && textScreenChars !== undefined) {
      // A small window: words that run long get their own screen, lead-in
      // and all, and the figure follows on the next.
      if (textChars(0, cur.length) >= textScreenChars) flush(cur.length);
    }
    cur.push(idx);
    hasFigure = true;
    lastFigure = it;
    textSinceFigure = 0;
  });
  if (cur.length) groups.push(cur);

  return groups.map((g, n) => {
    let label: string | null = null;
    for (const idx of g) {
      label = headingOf(items[idx]!);
      if (label) break;
    }
    if (!label) {
      for (const idx of g) {
        label = captionOf(items[idx]!);
        if (label) break;
      }
    }
    return {
      items: g,
      label: label ?? (n === 0 ? introLabel : `Part ${n + 1}`),
    };
  });
}
