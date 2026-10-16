/**
 * The letter explorer's opening: every variation starts stacked like a deck
 * of cards on the board cell that was clicked, then fans out to its place in
 * the grid. The clicked variation is the top card and lands in its own slot.
 *
 * Built for a steady 60fps: each card moves with one Web Animation on
 * `transform` alone, which the compositor runs off the main thread. Every
 * rect is read once, before the first frame, and nothing is written to
 * layout while the cards fly. A frame monitor records each main-thread
 * frame's delta while they do: `window.__codexFan` holds the latest run, and
 * a `codex-fan` performance measure marks it in a DevTools trace, where the
 * compositor's own frames (PipelineReporter) show what reached the screen.
 * The main thread can stall without stopping the cards; a stall there still
 * flags work worth moving out of the opening.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a card starts: on top of the origin, at the origin's size. */
export interface DeckOffset {
  x: number;
  y: number;
  scale: number;
}

/**
 * The translate and scale that put a card's picture exactly over the origin.
 * The card scales about its own centre, so the picture's centre lands on the
 * origin's centre once the picture's offset inside the card is scaled too.
 */
export function deckOffset(card: Box, picture: Box, origin: Box): DeckOffset {
  const scale = picture.width > 0 ? origin.width / picture.width : 1;
  const cardX = card.x + card.width / 2;
  const cardY = card.y + card.height / 2;
  const pictureX = picture.x + picture.width / 2;
  const pictureY = picture.y + picture.height / 2;
  return {
    x: origin.x + origin.width / 2 - cardX - scale * (pictureX - cardX),
    y: origin.y + origin.height / 2 - cardY - scale * (pictureY - cardY),
    scale,
  };
}

/** How far down the deck each card sits: the clicked one on top (0), the
 *  rest in grid order beneath it. */
export function deckDepths(count: number, selected: number): number[] {
  const top = selected >= 0 && selected < count ? selected : 0;
  let next = 1;
  return Array.from({ length: count }, (_, index) =>
    index === top ? 0 : next++
  );
}

/** The slight turn that makes a stack read as a deck; the top card is square. */
export function deckTilt(depth: number): number {
  if (depth === 0) return 0;
  const sign = depth % 2 === 0 ? 1 : -1;
  return sign * Math.min(1.5 + depth * 0.9, 7);
}

/** Start delays: the top card leaves first, and the rest are dealt within
 *  `spreadMs` however many there are. */
export function deckDelays(
  depths: readonly number[],
  spreadMs = 240,
  maxStepMs = 32
): number[] {
  const deepest = Math.max(0, ...depths);
  const step = deepest > 0 ? Math.min(maxStepMs, spreadMs / deepest) : 0;
  return depths.map((depth) => Math.round(depth * step));
}

export interface FrameStats {
  frames: number;
  durationMs: number;
  averageMs: number;
  worstMs: number;
  /** Frames that took longer than one and a half 60Hz frames (25ms). */
  longFrames: number;
  fps: number;
}

const LONG_FRAME_MS = 25;

export function summarizeFrames(deltas: readonly number[]): FrameStats {
  const durationMs = deltas.reduce((sum, delta) => sum + delta, 0);
  const frames = deltas.length;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    frames,
    durationMs: round(durationMs),
    averageMs: frames ? round(durationMs / frames) : 0,
    worstMs: round(Math.max(0, ...deltas)),
    longFrames: deltas.filter((delta) => delta > LONG_FRAME_MS).length,
    fps: durationMs > 0 ? round((frames * 1000) / durationMs) : 0,
  };
}

declare global {
  interface Window {
    __codexFan?: { last: FrameStats | null; runs: FrameStats[] };
  }
}

function recordRun(stats: FrameStats): void {
  const store = (window.__codexFan ??= { last: null, runs: [] });
  store.last = stats;
  store.runs = [...store.runs.slice(-9), stats];
  if (import.meta.env.DEV) console.debug("[codex-fan]", stats);
}

const DURATION_MS = 560;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export interface FanOptions {
  /** The card that was clicked; it travels on top and lands outlined. */
  selectedIndex: number;
  /** Let cards fly outside the grid and dialog while they fan. Only safe
   *  where those boxes do not scroll (the desktop layout). */
  unclip: boolean;
  onDone?: () => void;
}

/**
 * Lifts `overflow` clipping between the grid and its dialog for the length of
 * the fan, on boxes that are not scrolling (lifting a scroller's clip would
 * move its content). Returns the undo.
 */
function unclipAncestors(grid: HTMLElement): () => void {
  const lifted: { element: HTMLElement; value: string }[] = [];
  let element: HTMLElement | null = grid;
  while (element) {
    const style = getComputedStyle(element);
    const scrolls =
      element.scrollHeight > element.clientHeight + 1 ||
      element.scrollWidth > element.clientWidth + 1;
    if (style.overflow !== "visible" && !scrolls) {
      lifted.push({ element, value: element.style.overflow });
      element.style.overflow = "visible";
    }
    if (element.tagName === "DIALOG") break;
    element = element.parentElement;
  }
  return () => {
    for (const { element: lift, value } of lifted) lift.style.overflow = value;
  };
}

/**
 * Plays the fan on `grid`'s cards from `origin` (a viewport rect). Returns a
 * cancel that jumps every card to its slot. Under reduced motion the cards
 * are simply placed.
 */
export function fanOutDeck(
  grid: HTMLElement,
  origin: Box,
  { selectedIndex, unclip, onDone }: FanOptions
): () => void {
  const cards = Array.from(
    grid.querySelectorAll<HTMLElement>("[data-variation-index]")
  );
  if (
    cards.length === 0 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    onDone?.();
    return () => {};
  }

  // Read every rect before writing anything.
  const placements = cards.map((card) => ({
    card: card.getBoundingClientRect(),
    picture: (
      card.querySelector<HTMLElement>(".variation-picture") ?? card
    ).getBoundingClientRect(),
  }));
  const depths = deckDepths(cards.length, selectedIndex);
  const delays = deckDelays(depths);

  const restoreClip = unclip ? unclipAncestors(grid) : () => {};
  grid.classList.add("fanning");
  performance.mark("codex-fan-start");

  const animations = cards.map((card, index) => {
    const { card: cardBox, picture } = placements[index]!;
    const offset = deckOffset(cardBox, picture, origin);
    const depth = depths[index]!;
    card.style.zIndex = String(cards.length - depth);
    return card.animate(
      [
        {
          transform: `translate(${offset.x}px, ${offset.y}px) rotate(${deckTilt(depth)}deg) scale(${offset.scale})`,
        },
        { transform: "none" },
      ],
      {
        duration: DURATION_MS,
        delay: delays[index]!,
        easing: EASING,
        fill: "backwards",
      }
    );
  });

  const deltas: number[] = [];
  let last = performance.now();
  let monitoring = true;
  const tick = (now: number) => {
    if (!monitoring) return;
    deltas.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(tick);
  });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    monitoring = false;
    for (const card of cards) card.style.zIndex = "";
    grid.classList.remove("fanning");
    restoreClip();
    performance.mark("codex-fan-end");
    performance.measure("codex-fan", "codex-fan-start", "codex-fan-end");
    recordRun(summarizeFrames(deltas));
    onDone?.();
  };

  void Promise.all(animations.map((animation) => animation.finished)).then(
    finish,
    finish
  );

  return () => {
    for (const animation of animations) animation.cancel();
    finish();
  };
}
