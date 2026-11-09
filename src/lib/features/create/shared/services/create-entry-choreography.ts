/**
 * The Create board handing over to a method's workspace, as one piece of
 * choreography. All six methods play it.
 *
 * The card you tapped is the thing you are following, and it never stands
 * still. The other cards file into their drawers (the sidebar icon on a
 * desktop, the bottom pill elsewhere), so the eye learns where the methods
 * went, and each drawer nods as its card goes in. The tapped card's own icon
 * and name file into its drawer just behind them, while the card starts
 * shrinking. As soon as the workspace's pieces are laid out, the card
 * condenses into a miniature of them (Generate's settings cards, Construct's
 * start positions, Fuse's sources and preview), the real ones at a small
 * scale, and they fly out of it to their places with no pause, contents and
 * all. Whatever else is on show (a toolbar, a hint) leaves the miniature in
 * the same wave. Each method has its own order for the wave and, for some, a
 * signature as the pieces land (`LANDINGS`).
 *
 *   tap        the other cards and the tapped card's name file into their
 *              drawers; the tapped card starts shrinking. Runs before any
 *              mounting starts (see `depart`).
 *   swap       the gate opens the first frame the pieces are laid out
 *              (`create-method-entry-gate.ts`). Pictures still drawing do not
 *              hold it; they show up where their piece lands.
 *   split      the card condenses into the miniature (`CreateEntryFlight.svelte`)
 *              and, as it gets there, everything flies out in one wave.
 *
 * The miniature fits inside the part of the card the pieces' clipping boxes
 * show, so no piece starts cut off. Everything but the plate's corners and
 * the backings animates `opacity` and `transform`, so the compositor keeps it
 * moving while the workspace mounts on the main thread, and deferred work is
 * held out of the whole thing.
 *
 * Reduced motion plays none of this: `depart` says so and the entry stays the
 * plain crossfade. A workspace with no pieces yet (a capped-out first load),
 * or a card with too little of itself on show, skips the split and crossfades
 * after the filing.
 *
 * Specs: docs/superpowers/specs/2026-11-07-create-entry-one-motion-design.md
 * (the timing and each method's order), which builds on
 * 2026-11-07-generate-entry-choreography-design.md and
 * 2026-11-07-create-entry-filing-design.md.
 */
import {
  holdBackgroundFor,
  releaseBackground,
} from "#lib/shared/background/shared/state/background-hold.svelte.js";
import { holdDeferredWorkForMotion } from "#lib/shared/foundation/utils/background-scheduling.js";
import {
  EMANATE_LEAD_MS,
  EMANATE_SPREAD_MS,
  emanateTiming,
  playEmanate,
  type EmanateRect,
} from "#lib/shared/transitions/emanate.js";
import {
  EASE_STANDARD,
  EASE_STANDARD_IN,
  EASE_STANDARD_OUT,
  reducedMotion,
} from "#lib/shared/transitions/motion.js";
import { DURATION, STAGGER } from "#lib/shared/transitions/transitions.js";
import { CREATE_ENTRY_HOLD_CAP_MS } from "./create-method-entry-gate";

/** One piece's flight out of the miniature to its place. */
export const CREATE_ENTRY_FLIGHT_MS = DURATION.emphasis;

/** First leaving card to last. */
const DEPARTURE_SPREAD_MS = STAGGER.relaxed + STAGGER.normal;

/** One card filing into its drawer. */
export const FILING_MS = DURATION.emphasis;

/** First card into the drawer to last, nearest first. */
export const FILING_SPREAD_MS = STAGGER.normal;

/**
 * The tapped card's name files in just behind the others, so it reads as the
 * last of them and its drawer's nod is its own.
 */
const NAME_FILING_DELAY_MS = FILING_SPREAD_MS + STAGGER.micro;

/** How small the tapped card gets by the gate's cap. */
export const TAPPED_SHRINK = 0.9;

/** The size the tapped card's shrink slows toward and never reaches. */
export const TAPPED_SHRINK_LIMIT = 0.86;

/**
 * How long the tapped card keeps shrinking. The cap does not bound the wait:
 * a busy thread holds the workspace's mount past it (over a second at 4x CPU
 * slowdown), and a shrink that ended at the cap left the card frozen through
 * that. The plate picks it up long before this on a fast device.
 */
export const TAPPED_HOLD_MS = 4 * CREATE_ENTRY_HOLD_CAP_MS;

/** Where the hold's curve is sampled, as fractions of the cap. */
/**
 * The animated backdrop holds still from the press until the entry ends. It
 * repaints a viewport-sized canvas on the main thread every frame (37-51 ms a
 * frame at 4x CPU slowdown), and those frames sat between the press and its
 * release and again before the departure's first frame. Nobody watches the
 * backdrop while the board clears (`background-hold.svelte.ts`).
 */
export const PRESS_BACKDROP_KEY = "create-method-press";
/** Long enough for a held press to become its click. */
export const PRESS_BACKDROP_MS = 600;
const ENTRY_BACKDROP_KEY = "create-method-entry";
/** A backstop: every entry ends in `cleanUp`, which lets the backdrop go. */
const ENTRY_BACKDROP_CAP_MS = 4000;

/**
 * How long the board waits for a workspace whose own button rides in
 * (`Landing.source`). The button drifts the whole time, so a cold mount reads
 * as the button travelling rather than a stalled card; the backdrop's own cap
 * bounds it.
 */
export const SOURCE_HOLD_CAP_MS = ENTRY_BACKDROP_CAP_MS;

/** How small a card starts as it springs out of the button. */
const SPRING_FROM = 0.25;

/** How far through the button's morph the first card springs out of it. */
const SPRING_AT = 0.5;

const HOLD_SAMPLES = [0, 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/**
 * The tapped card's hold as keyframes: from its pressed size it slows toward
 * `TAPPED_SHRINK_LIMIT`, passing `TAPPED_SHRINK` at the cap, so it reads as
 * one motion that never stops. Played with linear easing between samples.
 */
export function tappedHoldFrames(
  from: number
): { scale: number; offset: number }[] {
  const start = Math.max(from, TAPPED_SHRINK + 0.01);
  const span = start - TAPPED_SHRINK_LIMIT;
  const tau =
    CREATE_ENTRY_HOLD_CAP_MS /
    Math.log(span / (TAPPED_SHRINK - TAPPED_SHRINK_LIMIT));
  return HOLD_SAMPLES.map((share) => {
    const t = share * CREATE_ENTRY_HOLD_CAP_MS;
    return {
      scale: TAPPED_SHRINK_LIMIT + span * Math.exp(-t / tau),
      offset: t / TAPPED_HOLD_MS,
    };
  });
}

/** How far through its filing a card starts to fade: it fades as it arrives. */
const FILING_FADE_FROM = 0.6;

/**
 * How much of a filing card is under the tapped card when it has gone: the
 * tapped card's colors are see-through, so a card passing beneath would show
 * its words through it.
 */
const UNDER_GONE_AT = 0.25;

/** How small a dealt piece starts, about its own middle (`Landing.deal`). */
const DEAL_FROM = 0.88;

/**
 * How far through its filing a card has gone in, for the drawer's nod: by then
 * it has crossed the workspace's edge (which clips it) and mostly faded.
 */
const FILING_IN_AT = 0.8;

/** The drawer's nod as a card lands in it. */
const DRAWER_PULSE_MS = DURATION.emphasis;

/**
 * The card condensing onto the miniature (`CreateEntryFlight.svelte`). The
 * small cards are hidden until it gets there: the card's colors are
 * see-through, and the cards showing through them read as a tint.
 */
export const SPLIT_CONDENSE_MS = DURATION.fast;

/** The plate letting go and the small cards coming into view, together. */
export const SPLIT_REVEAL_MS = DURATION.instant;

/**
 * When the small cards start coming into view: halfway through the plate's
 * condense, so the plate never sits empty and the first piece is on show by
 * the time it leaves.
 */
export const SPLIT_REVEAL_AT_MS = SPLIT_CONDENSE_MS / 2;

/**
 * When the first piece leaves the miniature: as the plate reaches it. No
 * hold, so the card's shrink runs straight on into the flight.
 */
export const SPLIT_LEAD_MS = SPLIT_CONDENSE_MS;

/** First piece out of the miniature to last, by default. */
export const SPLIT_SPREAD_MS = STAGGER.relaxed;

/**
 * The piece count that gets the whole spread. Fewer pieces are larger, and a
 * large piece leaving early grows over a neighbour still waiting in the
 * miniature, so a few pieces leave nearly together.
 */
const SPLIT_FULL_SPREAD_PIECES = 6;

/** The spread for this many pieces. */
export function splitSpreadFor(count: number): number {
  return (
    SPLIT_SPREAD_MS *
    Math.min(1, Math.max(0, count - 1) / (SPLIT_FULL_SPREAD_PIECES - 1))
  );
}

/**
 * The least share of the card's height that has to be on show for the
 * miniature to read as the card. Less, and the entry crossfades.
 */
const LEAST_ROOM = 0.4;

/**
 * How far through its flight a piece is when a method's signature on it
 * starts (Shape's ripple, Assemble's rings): mostly in place, still moving.
 */
const SIGNATURE_AT = 0.5;

export interface DepartureTiming {
  delay: number;
  /** Where the element ends, relative to its place: away from the card. */
  dx: number;
  dy: number;
}

/**
 * One element leaving the board: `emanate`'s geometry run backwards. Nearest
 * leaves first, and each pushes straight away from the card.
 */
export function departureTiming(
  element: EmanateRect,
  card: EmanateRect,
  board: EmanateRect
): DepartureTiming {
  const { delay, dx, dy } = emanateTiming({
    card: element,
    origin: card,
    bounds: board,
    stacked: false,
  });
  const fraction = (delay - EMANATE_LEAD_MS) / EMANATE_SPREAD_MS;
  return { delay: fraction * DEPARTURE_SPREAD_MS, dx: -dx, dy: -dy };
}

export interface FilingTiming {
  delay: number;
  /** Where the element's center ends, relative to where it is: the drawer. */
  dx: number;
  dy: number;
  /** One scale for both sides, so the card shrinks without stretching. */
  scale: number;
}

/** How far a card has to travel to reach its drawer. */
export function filingDistance(
  element: EmanateRect,
  drawer: EmanateRect
): number {
  const from = centre(element);
  const to = centre(drawer);
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * One card filing into its drawer (the sidebar icon or the bottom pill). It
 * shrinks evenly to the drawer's size as it goes, and the card nearest its
 * drawer goes first.
 */
export function filingTiming({
  element,
  drawer,
  nearest,
  farthest,
}: {
  element: EmanateRect;
  drawer: EmanateRect;
  /** The shortest and longest trip any filing card makes. */
  nearest: number;
  farthest: number;
}): FilingTiming {
  const from = centre(element);
  const to = centre(drawer);
  const span = farthest - nearest;
  const fraction =
    span > 0
      ? Math.min(
          1,
          Math.max(0, (filingDistance(element, drawer) - nearest) / span)
        )
      : 0;
  const fit = Math.min(
    drawer.width / element.width,
    drawer.height / element.height
  );
  return {
    delay: fraction * FILING_SPREAD_MS,
    dx: to.x - from.x,
    dy: to.y - from.y,
    scale: Math.min(1, Math.max(0.05, fit)),
  };
}

/** The share of `box` that `over` covers. */
function coveredShare(box: EmanateRect, over: EmanateRect): number {
  const width =
    Math.min(box.left + box.width, over.left + over.width) -
    Math.max(box.left, over.left);
  const height =
    Math.min(box.top + box.height, over.top + over.height) -
    Math.max(box.top, over.top);
  if (width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return 0;
  return (width * height) / (box.width * box.height);
}

/**
 * The stretch of a filing card's trip where it slides under the tapped card:
 * from the moment its edge meets the card to when `UNDER_GONE_AT` of it is
 * beneath, as fractions of the trip. It fades over that stretch, so nothing
 * shows through the tapped card. Null when its path stays clear of the card.
 */
export function underTappedSpan({
  element,
  filing,
  tapped,
}: {
  element: EmanateRect;
  filing: FilingTiming;
  tapped: EmanateRect;
}): { from: number; to: number } | null {
  const from = centre(element);
  const steps = 50;
  let meets: number | null = null;
  for (let step = 0; step <= steps; step += 1) {
    const at = step / steps;
    const scale = 1 - (1 - filing.scale) * at;
    const width = element.width * scale;
    const height = element.height * scale;
    const box = {
      left: from.x + filing.dx * at - width / 2,
      top: from.y + filing.dy * at - height / 2,
      width,
      height,
    };
    const share = coveredShare(box, tapped);
    if (meets === null && share > 0) meets = at;
    if (share >= UNDER_GONE_AT) return { from: meets ?? at, to: at };
  }
  return null;
}

/**
 * Hover follows the pointer, not the pieces. After a mouse tap the cursor
 * rests where the card was, and the workspace's pieces fly in under it, so a
 * hover style would light whichever piece slid beneath and then jump to the
 * next. Pieces that opt in (`html:not([data-entry-hover-quiet])` in their
 * hover rule) stay quiet until the mouse really moves or presses. Clicks are
 * untouched. Returns the way to end it early.
 */
function quietHoverUntilMoved(): () => void {
  if (!window.matchMedia("(hover: hover)").matches) return () => {};
  const root = document.documentElement;
  root.setAttribute("data-entry-hover-quiet", "");
  const moved = (event: PointerEvent) => {
    if (event.movementX !== 0 || event.movementY !== 0) end();
  };
  function end(): void {
    root.removeAttribute("data-entry-hover-quiet");
    window.removeEventListener("pointermove", moved, true);
    window.removeEventListener("pointerdown", end, true);
  }
  window.addEventListener("pointermove", moved, {
    capture: true,
    passive: true,
  });
  window.addEventListener("pointerdown", end, { capture: true, passive: true });
  return end;
}

/**
 * Where a board card files to. With the desktop sidebar showing, it is that
 * method's own icon; otherwise the bottom pill that opens the method list.
 * Null when neither is on screen, and the card simply clears away.
 */
function drawerFor(item: Element): HTMLElement | null {
  const name = item.querySelector(".method-name")?.textContent?.trim();
  const sidebar = document.querySelector<HTMLElement>(".ac-sidebar");
  if (sidebar && onScreen(sidebar)) {
    const button = [
      ...sidebar.querySelectorAll<HTMLElement>(".section-button"),
    ].find((element) => element.getAttribute("aria-label") === name);
    const icon = button?.querySelector<HTMLElement>(".icon-wrapper") ?? button;
    if (icon && onScreen(icon)) return icon;
  }
  const pill = document.querySelector<HTMLElement>(".tab-picker-trigger");
  return pill && onScreen(pill) ? pill : null;
}

function onScreen(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.right > 0 &&
    box.bottom > 0 &&
    box.left < window.innerWidth &&
    box.top < window.innerHeight
  );
}

export interface Miniature {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The grid's scale inside the card. */
  scale: number;
}

/**
 * The settings grid at one scale, as large as fits in `room` and centered in
 * it. One scale, so no card stretches.
 */
export function miniatureOf(grid: EmanateRect, room: EmanateRect): Miniature {
  const scale = Math.min(room.width / grid.width, room.height / grid.height);
  const width = grid.width * scale;
  const height = grid.height * scale;
  return {
    left: room.left + (room.width - width) / 2,
    top: room.top + (room.height - height) / 2,
    width,
    height,
    scale,
  };
}

export interface SplitTiming {
  delay: number;
  /** Where the card starts, relative to its place, before the scale. */
  dx: number;
  dy: number;
}

function centre(rect: EmanateRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * How far from the tapped card a place is, over the farthest any place is:
 * the default order of the wave, nearest first.
 */
export function nearestFirst(
  place: EmanateRect,
  origin: EmanateRect,
  reach: number
): number {
  const from = centre(origin);
  const at = centre(place);
  const distance = Math.hypot(at.x - from.x, at.y - from.y);
  return reach > 0 ? Math.min(1, distance / reach) : 0;
}

/**
 * One piece leaving the miniature: it starts where it sits in the miniature
 * (scaled about its top left corner), and leaves at its turn in the wave
 * (`fraction`, 0 first and 1 last, over `spread`) as the plate gets there.
 */
export function splitTiming({
  card,
  grid,
  miniature,
  fraction,
  spread = SPLIT_SPREAD_MS,
}: {
  /** The piece's place. */
  card: EmanateRect;
  /** All the places together: what the miniature is of. */
  grid: EmanateRect;
  miniature: Miniature;
  /** Its turn in the wave. */
  fraction: number;
  /** First piece out to last. */
  spread?: number;
}): SplitTiming {
  const turn = Math.min(1, Math.max(0, fraction));
  return {
    delay: SPLIT_LEAD_MS + turn * spread,
    dx: miniature.left + (card.left - grid.left) * miniature.scale - card.left,
    dy: miniature.top + (card.top - grid.top) * miniature.scale - card.top,
  };
}

/** What the stage offers the entry: `CreateEntryFlight.svelte`. */
export interface EntryFlightPlayer {
  /** The tapped card's icon and name file into its drawer. */
  file(request: {
    card: HTMLElement;
    name: HTMLElement;
    drawer: EmanateRect;
    delay: number;
    duration: number;
    fadeFrom: number;
  }): Animation[];
  /** The card condenses onto the miniature from wherever it is on screen. */
  fly(request: { card: HTMLElement; miniature: EmanateRect }): Animation[];
  /**
   * A copy of `button` lifts off the card and drifts toward `toward` until
   * `morph`. False when there was nothing to lift.
   */
  lift?(request: {
    button: HTMLElement;
    toward: { x: number; y: number };
    holdMs: number;
  }): boolean;
  /** The lifted copy grows into `to` and hands over to it as it lands. */
  morph?(request: { to: HTMLElement; duration: number }): Animation[];
  /** A lifted copy is waiting for its morph. */
  isRiding?(): boolean;
  /** Gone at once. */
  clear(): void;
  /** Gone from where it is on screen. */
  dismiss(): void;
}

export type EntryChoreographyBeat =
  | "departure"
  | "flight"
  | "landed"
  | "arrived";

/** One player in the wave: a piece, or something arriving around them. */
export interface WavePlayer {
  element: Element;
  /** Its place. */
  box: EmanateRect;
  /** A piece flies out of the miniature; the rest arrive around them. */
  piece: boolean;
}

/** What a method's order reads about the whole scene. */
export interface WaveScene {
  /** All the players' places together. */
  whole: EmanateRect;
  /** The tapped card. */
  origin: EmanateRect;
  /** The farthest any place is from the tapped card. */
  reach: number;
}

/** When a method's signature starts, and what it plays on. */
interface Signature {
  layer: Element;
  /** When the pieces are mostly in place (`SIGNATURE_AT`), from now. */
  at: number;
}

/**
 * How a method's workspace receives the card: the pieces that split out of the
 * miniature, what arrives around them, the order they all leave in, and the
 * method's own signature as they land.
 */
interface Landing {
  pieces: string;
  /**
   * What arrives around the pieces. Left out, everything in the layer that is
   * neither a piece nor holds one arrives (`besidePieces`).
   */
  arriving?: string;
  /**
   * Each player's turn in the wave, 0 first and 1 last. Left out, nearest the
   * tapped card first.
   */
  order?: (player: WavePlayer, scene: WaveScene) => number;
  /** First player out to last. Left out, `splitSpreadFor` the pieces. */
  spread?: number;
  /**
   * Pieces dealt in the method's order without ever crossing. With this set,
   * every piece flies out together, so the miniature grows as one picture
   * and no piece covers a neighbour still waiting in it. The pieces matching
   * this start a little small, each about its own middle, and come up to
   * size at their turn: the order shows as a ripple across them.
   */
  deal?: string;
  /** The method's own touch as the pieces land. Reduced motion never gets here. */
  signature?: (moment: Signature) => Animation[];
  /**
   * A button the card's preview shows and the workspace has for real. With
   * this, the preview's button lifts off at the tap and grows into the real
   * one, and the other pieces spring out of it nearest first; there is no
   * plate or miniature.
   */
  source?: { real: string; preview: string };
}

/** The beat grid beside a kept sequence, in every method. */
const SEQUENCE = ".workspace-container";

/** A player's center across the scene, 0 at the left edge and 1 at the right. */
function across(player: WavePlayer, { whole }: WaveScene): number {
  return whole.width > 0
    ? (centre(player.box).x - whole.left) / whole.width
    : 0;
}

/** A player's center up the scene, 0 at the bottom and 1 at the top. */
function upward(player: WavePlayer, { whole }: WaveScene): number {
  return whole.height > 0
    ? (whole.top + whole.height - centre(player.box).y) / whole.height
    : 0;
}

/** The players matching `later` go a beat after the rest. */
function beatAfter(later: string) {
  return ({ element }: WavePlayer): number =>
    element.matches(later) || element.querySelector(later) ? 1 : 0;
}

/**
 * Shape's ripple: as the grid comes to rest its shapes come in diagonally
 * from the top-left corner. Its cells exist from the first layout, painted or
 * not, so a shape still drawing comes in on its beat as an empty tile.
 */
function shapeRipple({ layer, at }: Signature): Animation[] {
  const tiles = [
    ...layer.querySelectorAll<HTMLElement>(
      ".shape-app button.cell, .shape-app th > *"
    ),
  ].map((element) => ({ element, box: element.getBoundingClientRect() }));
  const shown = tiles.filter(({ box }) => box.width > 0 && box.height > 0);
  if (shown.length === 0) return [];
  // The grid is at one scale wherever it is in its flight, so the tiles'
  // places within it read the same now as at rest.
  const grid = unionOf(shown.map(({ box }) => box));
  return shown.map(({ element, box }) => {
    const diagonal =
      ((box.left - grid.left) / Math.max(1, grid.width) +
        (box.top - grid.top) / Math.max(1, grid.height)) /
      2;
    return element.animate(
      [
        { opacity: 0, transform: "scale(0.85)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: DURATION.emphasis,
        delay: at + diagonal * (STAGGER.relaxed * 2),
        easing: EASE_STANDARD_OUT,
        fill: "backwards",
      }
    );
  });
}

/** The middle of the grid's drawing, in its own units (`HitTargetOverlay`). */
const ASSEMBLE_CENTRE = 475;

/**
 * Assemble's rings: as the grid lands, its target rings pop out from the
 * center point to their spots.
 */
function assembleRings({ layer, at }: Signature): Animation[] {
  const rings = [
    ...layer.querySelectorAll<SVGCircleElement>(
      ".assemble-tool-panel circle.hit-target"
    ),
  ];
  return rings.map((ring, i) => {
    const cx = ring.cx.baseVal.value;
    const cy = ring.cy.baseVal.value;
    return ring.animate(
      [
        {
          opacity: 0,
          transformOrigin: `${cx}px ${cy}px`,
          transform: `translate(${ASSEMBLE_CENTRE - cx}px, ${ASSEMBLE_CENTRE - cy}px) scale(0.3)`,
        },
        { opacity: 1, transformOrigin: `${cx}px ${cy}px`, transform: "none" },
      ],
      {
        duration: DURATION.emphasis,
        delay: at + i * STAGGER.micro,
        easing: EASE_STANDARD_OUT,
        fill: "backwards",
      }
    );
  });
}

/**
 * The landing per method: every method on the board has one. Each lists its
 * workspace's own top-level pieces, so a piece carries its contents with it.
 * Generate's hint is taken by its own box: its slot is an empty line in flow,
 * and a transform on the slot would make it the hint's containing block,
 * dropping the hint into place only once the arrival ended.
 */
const LANDINGS: Readonly<Record<string, Landing>> = {
  // Built up from the button: the card preview's button grows into the real
  // one, the tiles spring out of it row by row, and the level pills land
  // last (`source`). Without a lifted button, the same order out of the
  // miniature.
  generate: {
    source: {
      real: ".generate-button-card",
      preview: ".method-stage .generate-button",
    },
    pieces: ".card-grid > .card-wrapper",
    arriving: `.level-toolbar, .generate-empty-slot .empty-state, .compact-level-card, ${SEQUENCE}`,
    order: (player, scene) => {
      const { element } = player;
      if (
        element.matches(".generate-button-card") ||
        element.querySelector(".generate-button-card")
      ) {
        return 0;
      }
      if (element.matches(".level-toolbar, .compact-level-card")) return 1;
      return 0.15 + 0.7 * upward(player, scene);
    },
    spread: STAGGER.relaxed * 2,
  },
  // Dealt like cards: the picker grows out of the miniature as one picture,
  // and the start pictures come up to size left to right. Leaving one at a
  // time instead, each grew over the next one still in the miniature.
  construct: {
    pieces:
      ".start-placement-picker > .picker-header, .start-placement-picker .pictograph-row > *, .start-placement-picker > .controls-footer",
    order: across,
    spread: STAGGER.relaxed * 2,
    deal: ".start-placement-picker .pictograph-row > *",
  },
  // Opens like a book: every panel leaves at once, each to its own side, and
  // the grid's shapes ripple in as it lands.
  "shape-engine": {
    pieces:
      ".shape-app > .topbar, .shape-app .workspace-source > .panel-group > .panel-wrapper",
    order: () => 0,
    spread: 0,
    signature: shapeRipple,
  },
  // Two paths, then the fusion.
  fuse: {
    pieces:
      ".fuse-workspace > .fuse-header-region, .fuse-workspace > .source-card, .fuse-workspace > .preview-stage",
    order: beatAfter(".preview-stage"),
    spread: DURATION.instant,
  },
  // The cast first, then the stage.
  tunnel: {
    pieces:
      ".tunnel-workspace > .workspace-header, .tunnel-workspace > .source-column, .tunnel-workspace > .preview-stage",
    order: beatAfter(".preview-stage"),
    spread: DURATION.instant,
  },
  // The grid and dock leave together; the rings pop out of the grid's middle
  // as it lands, and the hint comes in with them.
  assemble: {
    pieces: ".assemble-tool-panel .stage-slot, .assemble-tool-panel .dock",
    order: ({ piece }) => (piece ? 0 : 1),
    spread: CREATE_ENTRY_FLIGHT_MS * SIGNATURE_AT,
    signature: assembleRings,
  },
};

function settle(animations: Animation[]): Promise<unknown> {
  return Promise.allSettled(animations.map((animation) => animation.finished));
}

/**
 * The arriving set reduced to its innermost, visible members, leaving out the
 * pieces (the split brings those in) and anything around or inside them. The
 * phone's level card sits in Generate's grid without being one of its cards,
 * so it arrives rather than splitting.
 */
function arrivingLeaves(
  layer: Element,
  selector: string,
  pieces: readonly Element[]
): Element[] {
  const found = [...layer.querySelectorAll(selector)].filter(
    (element) =>
      !pieces.some(
        (piece) => piece.contains(element) || element.contains(piece)
      ) && element.getBoundingClientRect().width > 0
  );
  return found.filter(
    (element) =>
      !found.some((other) => other !== element && element.contains(other))
  );
}

/**
 * Everything on show in the layer beside the pieces: walking up from each
 * piece to the layer, the children of each holder that neither are a piece nor
 * hold one. With the pieces and their holders, that is the whole layer.
 */
function besidePieces(
  layer: Element,
  pieces: readonly Element[],
  tray: Element
): Element[] {
  const holders = new Set<Element>();
  for (const piece of pieces) {
    for (
      let element = piece.parentElement;
      element && layer.contains(element);
      element = element.parentElement
    ) {
      holders.add(element);
    }
  }
  const layerBox = layer.getBoundingClientRect();
  const beside: Element[] = [];
  for (const holder of holders) {
    for (const child of holder.children) {
      if (child === tray || holders.has(child) || pieces.includes(child)) {
        continue;
      }
      const box = child.getBoundingClientRect();
      if (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > layerBox.top &&
        box.top < layerBox.bottom
      ) {
        beside.push(child);
      }
    }
  }
  return beside;
}

/** The box around all of them. */
function unionOf(boxes: readonly EmanateRect[]): EmanateRect {
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** The innermost element holding every piece. */
function commonAncestor(pieces: readonly Element[]): Element | null {
  let ancestor: Element | null = pieces[0]?.parentElement ?? null;
  while (ancestor && !pieces.every((piece) => ancestor!.contains(piece))) {
    ancestor = ancestor.parentElement;
  }
  return ancestor;
}

/**
 * Whether a piece can fly by transform without anything inside it jumping. A
 * transform makes the piece the containing block of everything absolute or
 * fixed inside it, so one placed against a box outside the piece would sit in
 * the wrong spot for the flight and jump at the end. Such a piece fades in
 * where it is instead.
 */
function movesSafely(piece: Element): boolean {
  for (const element of piece.querySelectorAll("*")) {
    // Shapes inside a drawing are placed by the drawing, not by CSS.
    if (element instanceof SVGElement && element.ownerSVGElement) continue;
    const { position } = getComputedStyle(element);
    if (position === "fixed") return false;
    if (position !== "absolute") continue;
    // Not drawn (it or a holder is `display: none`): nothing to jump.
    if (element.getClientRects().length === 0) continue;
    if (!piece.contains(placedAgainst(element))) return false;
  }
  return true;
}

/**
 * The box an absolute element is placed against. A drawing has no
 * `offsetParent`, so its nearest positioned ancestor stands in.
 */
function placedAgainst(element: Element): Element | null {
  if (element instanceof HTMLElement) return element.offsetParent;
  for (
    let around = element.parentElement;
    around;
    around = around.parentElement
  ) {
    if (getComputedStyle(around).position !== "static") return around;
  }
  return null;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function intersect(a: Box, b: Box): Box {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

/**
 * The part of the screen where the grid's cards can be seen: every box between
 * the grid and the crossfade's own source that clips what it holds.
 */
function visibleBoxOf(grid: Element, layer: Element): Box {
  let box: Box = {
    left: -Infinity,
    top: -Infinity,
    right: Infinity,
    bottom: Infinity,
  };
  const last = layer.parentElement ?? layer;
  for (
    let element = grid.parentElement;
    element;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    if (
      style.overflowX !== "visible" ||
      style.overflowY !== "visible" ||
      /paint|strict|content/.test(style.contain)
    ) {
      box = intersect(box, element.getBoundingClientRect());
    }
    if (element === last) break;
  }
  return box;
}

/**
 * Stops an element's CSS transitions until the returned function runs. A WAAPI
 * animation on a property that also has a running CSS transition cannot run on
 * the compositor.
 */
export function suspendTransitions(element: HTMLElement): () => void {
  const previous = element.style.transition;
  element.style.transition = "none";
  return () => {
    element.style.transition = previous;
  };
}

/**
 * The pieces fly at full strength: the workspace's fade-in would leave them
 * see-through for the first half of the split. Everything else in the layer is
 * held by its own arrival. Held at full strength, a dark backing behind the
 * pieces would land at once and leave a hard edge, so each fades in as the
 * workspace would have (CreateModule's crossfade runs `DURATION.emphasis`).
 */
function holdSurface(
  layer: HTMLElement,
  pieces: readonly Element[],
  forMs: number
): Animation[] {
  const surface = layer.parentElement;
  const shown = surface
    ? [
        surface.animate([{ opacity: 1 }, { opacity: 1 }], {
          duration: forMs,
        }),
      ]
    : [];
  const backed = new Set<Element>();
  for (const element of pieces) {
    for (
      let around = element.parentElement;
      around && around !== surface;
      around = around.parentElement
    ) {
      backed.add(around);
    }
  }
  const backings: Animation[] = [];
  for (const element of backed) {
    const color = getComputedStyle(element).backgroundColor;
    if (/^rgba\(.*,\s*0\)$/.test(color) || color === "transparent") {
      continue;
    }
    backings.push(
      element.animate(
        [{ backgroundColor: "transparent" }, { backgroundColor: color }],
        { duration: DURATION.emphasis, easing: EASE_STANDARD }
      )
    );
  }
  return [...shown, ...backings];
}

export function createEntryChoreography(
  report: (beat: EntryChoreographyBeat) => void = () => {}
) {
  let method: string | null = null;
  let card: HTMLElement | null = null;
  let departure: Animation[] = [];
  /** The drawers' nods. Not part of the board, so the entry's end keeps them. */
  let pulses: Animation[] = [];
  let hideCard: Animation[] = [];
  let arrival: Animation[] = [];
  let flight: EntryFlightPlayer | null = null;
  let tray: HTMLElement | null = null;
  let flew = false;
  /** The card preview's button lifted off at the tap (`Landing.source`). */
  let lifted = false;
  let releaseHold: () => void = () => {};
  let releaseTransition: () => void = () => {};
  /** Outlives the entry: it ends when the mouse moves (`quietHoverUntilMoved`). */
  let endHoverQuiet: () => void = () => {};
  let run = 0;

  function cleanUp(): void {
    run += 1;
    for (const animation of [...departure, ...hideCard, ...arrival]) {
      animation.cancel();
    }
    departure = [];
    hideCard = [];
    arrival = [];
    flight?.clear();
    flight = null;
    tray?.remove();
    tray = null;
    flew = false;
    lifted = false;
    card = null;
    method = null;
    releaseHold();
    releaseHold = () => {};
    releaseTransition();
    releaseTransition = () => {};
    releaseBackground(ENTRY_BACKDROP_KEY);
  }

  /**
   * The lifted button grows into the real one, and the other pieces spring
   * out of it nearest first; what arrives around them comes in at its turn,
   * as it does out of a miniature. With no real button on the stage, the copy
   * fades where it is and the crossfade brings the workspace in.
   */
  function landFromSource(
    layer: HTMLElement,
    player: EntryFlightPlayer,
    landing: Landing,
    source: NonNullable<Landing["source"]>
  ): void {
    const layerBox = layer.getBoundingClientRect();
    const onStage = (box: EmanateRect) =>
      box.width > 0 &&
      box.height > 0 &&
      box.left + box.width > layerBox.left &&
      box.left < layerBox.right &&
      box.top + box.height > layerBox.top &&
      box.top < layerBox.bottom;
    const real = layer.querySelector<HTMLElement>(source.real);
    const realBox = real?.getBoundingClientRect();
    if (!real || !realBox || !onStage(realBox) || !player.morph) {
      player.dismiss();
      return;
    }

    // Every box is read before anything moves.
    const all = [...layer.querySelectorAll<HTMLElement>(landing.pieces)];
    const pieces = all
      .filter((element) => !element.contains(real))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => onStage(box));
    const flies = pieces.map(({ element }) => movesSafely(element));
    const cast = (
      landing.arriving ? arrivingLeaves(layer, landing.arriving, all) : []
    )
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => onStage(box));
    const whole = unionOf([
      realBox,
      ...pieces.map(({ box }) => box),
      ...cast.map(({ box }) => box),
    ]);

    const morphing = player.morph({
      to: real,
      duration: CREATE_ENTRY_FLIGHT_MS,
    });
    if (morphing.length === 0) {
      player.dismiss();
      return;
    }
    flew = true;
    flight = player;
    const current = run;

    // The workspace is up. From here on nothing else shares these frames.
    const releaseClearing = releaseHold;
    releaseHold = holdDeferredWorkForMotion();
    releaseClearing();
    report("flight");

    const from = centre(realBox);
    const reach = Math.max(
      0,
      ...pieces.map(({ box }) => {
        const at = centre(box);
        return Math.hypot(at.x - from.x, at.y - from.y);
      })
    );
    const spread = landing.spread ?? splitSpreadFor(pieces.length);
    const lead = CREATE_ENTRY_FLIGHT_MS * SPRING_AT;
    const scene: WaveScene = { whole, origin: realBox, reach };

    const springs = pieces.map(({ element, box }, i) => {
      const delay = lead + nearestFirst(box, realBox, reach) * spread;
      if (!flies[i]) {
        return element.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: DURATION.emphasis,
          delay,
          easing: EASE_STANDARD,
          fill: "backwards",
        });
      }
      // Small and centered on the button, about its own top left corner.
      const at = centre(box);
      const dx = from.x - box.left - SPRING_FROM * (at.x - box.left);
      const dy = from.y - box.top - SPRING_FROM * (at.y - box.top);
      return element.animate(
        [
          {
            transformOrigin: "0 0",
            transform: `translate(${dx}px, ${dy}px) scale(${SPRING_FROM})`,
            opacity: 0,
          },
          { opacity: 1, offset: 0.3 },
          { transformOrigin: "0 0", transform: "none", opacity: 1 },
        ],
        {
          duration: CREATE_ENTRY_FLIGHT_MS,
          delay,
          easing: EASE_STANDARD_OUT,
          fill: "backwards",
        }
      );
    });

    const arriving = cast.map(({ element, box }) => {
      const turn = Math.min(
        1,
        Math.max(0, landing.order?.({ element, box, piece: false }, scene) ?? 1)
      );
      const delay = lead + turn * spread;
      const { dx, dy } = emanateTiming({
        card: box,
        origin: whole,
        bounds: layerBox,
        stacked: false,
      });
      return movesSafely(element)
        ? playEmanate(element, { delay, dx, dy })
        : element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: DURATION.emphasis,
            delay,
            easing: EASE_STANDARD,
            fill: "backwards",
          });
    });

    const lastLandMs = lead + spread + CREATE_ENTRY_FLIGHT_MS;
    const held = holdSurface(
      layer,
      [real, ...pieces.map(({ element }) => element)],
      Math.max(CREATE_ENTRY_FLIGHT_MS, lastLandMs)
    );
    arrival = [...held, ...springs, ...arriving];

    void settle([...morphing, ...springs]).then(() => {
      if (current === run) report("landed");
    });
    void settle([...morphing, ...arrival]).then(() => {
      if (current !== run) return;
      report("arrived");
      cleanUp();
    });
  }

  return {
    get active(): boolean {
      return method !== null;
    },
    get method(): string | null {
      return method;
    },
    /**
     * The entry's button is riding in, so the board may wait for the
     * workspace up to `SOURCE_HOLD_CAP_MS` instead of the usual cap.
     */
    get holdsLong(): boolean {
      return lifted;
    },

    /**
     * True when the method's pieces are laid out on the stage: the gate may
     * open (`create-method-entry-gate.ts`). A method with no landing, or an
     * entry with nothing to land, never holds it.
     */
    piecesShown(layer: Element): boolean {
      const landing = method ? LANDINGS[method] : undefined;
      if (!landing) return true;
      return [...layer.querySelectorAll(landing.pieces)].some((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
    },

    /**
     * Starts the board clearing: the other cards file into their drawers, the
     * tapped card's name files into its own, and the card starts shrinking.
     * False under reduced motion; the caller then enters as it always has.
     * True means `moving` runs once all of it is on the compositor, a few
     * frames on: the caller mounts the workspace there, so the thread going
     * busy never holds these animations still.
     *
     * It goes out in two frames. The first carries only what the eye is on,
     * the tapped card starting to shrink and its face fading, so it shows
     * under the finger as soon as the press lets go. The other cards' filing
     * and the name's flight follow a frame later: set up in the same frame,
     * they made it about 250 ms later at 4x CPU slowdown.
     */
    depart(
      methodId: string,
      tapped: HTMLElement,
      player: EntryFlightPlayer | null = null,
      moving: () => void = () => {}
    ): boolean {
      cleanUp();
      for (const pulse of pulses) pulse.cancel();
      pulses = [];
      endHoverQuiet();
      if (reducedMotion()) return false;
      const board = tapped.closest(".front-door");
      if (!board) return false;

      method = methodId;
      card = tapped;
      flight = player;

      // Everything this measures is read before anything moves. A read after
      // an animation has started forces a fresh layout; interleaved, those
      // cost ~80 ms of the press at 4x CPU slowdown.
      const boardBox = board.getBoundingClientRect();
      const cardBox = tapped.getBoundingClientRect();
      // Every other card files into its drawer, so the eye learns where the
      // methods went: the sidebar icon on a desktop, the bottom pill elsewhere.
      const items = [...board.querySelectorAll(".method-item")]
        .filter((element) => !element.contains(tapped))
        .map((element) => {
          const drawer = drawerFor(element);
          return {
            element,
            box: element.getBoundingClientRect(),
            drawer,
            drawerBox: drawer?.getBoundingClientRect() ?? null,
          };
        });
      const tile = tapped.closest(".method-item");
      const name = tapped.querySelector<HTMLElement>(".method-name");
      const ownDrawer = tile ? drawerFor(tile) : null;
      const ownDrawerBox = ownDrawer?.getBoundingClientRect() ?? null;
      const drawerWidths = new Map<HTMLElement, number>();
      for (const { drawer, drawerBox } of items) {
        if (drawer && drawerBox) drawerWidths.set(drawer, drawerBox.width);
      }
      if (ownDrawer && ownDrawerBox) {
        drawerWidths.set(ownDrawer, ownDrawerBox.width);
      }
      const pressed = getComputedStyle(tapped).transform;
      const dipped = pressed && pressed !== "none" ? pressed : "none";
      const dippedTo =
        dipped !== "none" && typeof DOMMatrixReadOnly === "function"
          ? new DOMMatrixReadOnly(dipped).a
          : 1;

      // A method whose workspace has the preview's button for real: the
      // button lifts off now, before anything moves, and rides the wait out.
      const source = LANDINGS[methodId]?.source;
      const previewButton = source
        ? tapped.querySelector<HTMLElement>(source.preview)
        : null;
      lifted = Boolean(
        previewButton &&
          player?.lift?.({
            button: previewButton,
            toward: centre(boardBox),
            holdMs: SOURCE_HOLD_CAP_MS,
          })
      );

      // The rest goes out a frame later, as `depart` says. Every box it needs was
      // read before anything moved, and none of them moves for the card's
      // dip and shrink, which are transforms.
      const files = Boolean(player && name && ownDrawerBox);
      const thisRun = run;
      const fileTheBoard = (): void => {
        if (run !== thisRun) return;
        // The tapped card's icon and name file into its own drawer, just
        // behind the others, so the tap also shows where this method lives.
        // With no drawer on screen the name fades with the rest of the
        // card's face.
        const filed =
          player && name && ownDrawerBox
            ? player.file({
                card: tapped,
                name,
                drawer: ownDrawerBox,
                delay: NAME_FILING_DELAY_MS,
                duration: FILING_MS,
                fadeFrom: FILING_FADE_FROM,
              })
            : [];

        const trips = items.flatMap(({ box, drawerBox }) =>
          drawerBox ? [filingDistance(box, drawerBox)] : []
        );
        const nearest = Math.min(...trips);
        const farthest = Math.max(...trips);
        const landings = new Map<HTMLElement, number>();

        for (const { element, box, drawer, drawerBox } of items) {
          if (!drawer || !drawerBox) {
            // No drawer on screen: the card clears away from the tapped one.
            const { delay, dx, dy } = departureTiming(box, cardBox, boardBox);
            departure.push(
              element.animate(
                [
                  { opacity: 1, transform: "none" },
                  {
                    opacity: 0,
                    transform: `translate(${dx}px, ${dy}px) scale(0.96)`,
                  },
                ],
                {
                  duration: DURATION.normal,
                  delay,
                  easing: EASE_STANDARD_IN,
                  fill: "both",
                }
              )
            );
            continue;
          }
          const filing = filingTiming({
            element: box,
            drawer: drawerBox,
            nearest,
            farthest,
          });
          const { delay, dx, dy, scale } = filing;
          const end = `translate(${dx}px, ${dy}px) scale(${scale})`;
          // A card whose way runs under the tapped one fades as it slips
          // beneath, or its words would show through the tapped card's colors.
          // The transform runs straight between its ends, so a keyframe's
          // offset is that far along the way.
          const under = underTappedSpan({
            element: box,
            filing,
            tapped: cardBox,
          });
          const frames: Keyframe[] = under
            ? [
                { opacity: 1, transform: "none", offset: 0 },
                { opacity: 1, offset: under.from },
                {
                  opacity: 0,
                  offset: Math.min(1, Math.max(under.to, under.from + 0.05)),
                },
                { opacity: 0, transform: end, offset: 1 },
              ]
            : [
                { opacity: 1, transform: "none", offset: 0 },
                { opacity: 1, offset: FILING_FADE_FROM },
                { opacity: 0, transform: end, offset: 1 },
              ];
          departure.push(
            element.animate(frames, {
              duration: FILING_MS,
              delay,
              // Off at once, so its heading reads in the first frames.
              easing: EASE_STANDARD,
              fill: "both",
            })
          );
          landings.set(
            drawer,
            Math.max(
              landings.get(drawer) ?? 0,
              delay + FILING_MS * FILING_IN_AT
            )
          );
        }

        if (filed.length > 0 && ownDrawer) {
          landings.set(
            ownDrawer,
            Math.max(
              landings.get(ownDrawer) ?? 0,
              NAME_FILING_DELAY_MS + FILING_MS * FILING_IN_AT
            )
          );
        }

        // Each drawer nods as the last of its cards lands in it. These are on
        // the navigation, outside the board, so they outlive the entry.
        for (const [drawer, landsAt] of landings) {
          // A sidebar icon's glyph swells well past its box; the wide pill
          // only a little, or it would crowd the bar.
          const nodding =
            drawer.querySelector<HTMLElement>(".section-icon") ?? drawer;
          const width = drawerWidths.get(drawer) ?? 0;
          const swell = 1 + Math.min(0.3, 14 / width);
          pulses.push(
            nodding.animate(
              [
                { transform: "none" },
                { transform: `scale(${swell})`, offset: 0.4 },
                { transform: "none" },
              ],
              {
                duration: DRAWER_PULSE_MS,
                // At its fullest as the card goes in.
                delay: Math.max(0, landsAt - DRAWER_PULSE_MS * 0.4),
                easing: EASE_STANDARD,
              }
            )
          );
        }
        // One frame for these to reach the compositor before the mount.
        requestAnimationFrame(() => {
          if (run === thisRun) moving();
        });
      };
      requestAnimationFrame(() => requestAnimationFrame(fileTheBoard));

      endHoverQuiet = quietHoverUntilMoved();
      // The workspace is loading behind this, so what it needs goes through.
      releaseHold = holdDeferredWorkForMotion({ neededWorkRuns: true });
      holdBackgroundFor(ENTRY_BACKDROP_KEY, ENTRY_BACKDROP_CAP_MS);

      // The heading has nowhere to go; it just goes.
      const heading = board.querySelector(".front-door-header h1");
      if (heading) {
        departure.push(
          heading.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: DURATION.fast,
            easing: EASE_STANDARD_IN,
            fill: "both",
          })
        );
      }

      // The rest of the card's face goes, leaving its colors to condense.
      const face = [
        ...tapped.querySelectorAll(
          ".method-stage, .method-description, .last-used-badge"
        ),
        ...(!files && name ? [name] : []),
      ];
      for (const part of face) {
        departure.push(
          part.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: DURATION.fast,
            easing: EASE_STANDARD_IN,
            fill: "both",
          })
        );
      }

      // With its button riding, the card itself fades where it is, its
      // shrink still going: the button is the one being followed.
      if (lifted) {
        departure.push(
          (tile ?? tapped).animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: DURATION.normal,
            easing: EASE_STANDARD_IN,
            fill: "both",
          })
        );
      }

      // The cards filing past go under it: it is the one being followed.
      if (tile) {
        departure.push(
          tile.animate([{ zIndex: 1 }, { zIndex: 1 }], {
            duration: TAPPED_HOLD_MS,
            fill: "both",
          })
        );
      }

      // It starts shrinking toward its miniature at once and keeps going,
      // slower and slower, until the plate picks it up from wherever it has
      // got to (`tappedHoldFrames`), so it is never still however long the
      // workspace takes. It starts from the press's dip, wherever that has
      // got to (`dipped`, read above), so the card never springs back up
      // before it shrinks. The press's own CSS transition on transform keeps the shrink off the
      // compositor, so it froze while the workspace mounted. The card is
      // leaving; it gets its transitions back when the entry ends.
      releaseTransition = suspendTransitions(tapped);
      departure.push(
        tapped.animate(
          tappedHoldFrames(dippedTo).map(({ scale, offset }, i) => ({
            transform: i === 0 ? dipped : `scale(${scale})`,
            offset,
          })),
          { duration: TAPPED_HOLD_MS, fill: "both" }
        )
      );

      report("departure");
      return true;
    },

    /**
     * The gate opened: the workspace layer is starting to fade in. The card
     * splits into the workspace's own pieces, and everything leaves the
     * miniature in one wave.
     */
    land(layer: HTMLElement, player: EntryFlightPlayer): void {
      const landing = method ? LANDINGS[method] : undefined;
      if (!card || flew || !landing) return;
      if (lifted && landing.source) {
        landFromSource(layer, player, landing, landing.source);
        return;
      }
      const layerBox = layer.getBoundingClientRect();
      // The pieces on the stage. One running past it is fine (a phone): the
      // stage clips it.
      const pieces = [...layer.querySelectorAll<HTMLElement>(landing.pieces)]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(
          ({ box }) =>
            box.width > 0 &&
            box.height > 0 &&
            box.bottom > layerBox.top &&
            box.top < layerBox.bottom &&
            box.right > layerBox.left &&
            box.left < layerBox.right
        );
      // Nothing to land on: the board fades away with the card still on it, and
      // `settled` tidies up after that fade.
      if (pieces.length === 0) return;
      const holder = commonAncestor(pieces.map(({ element }) => element));
      if (!holder || !layer.contains(holder)) return;
      const whole = unionOf(pieces.map(({ box }) => box));
      const flies = pieces.map(({ element }) => movesSafely(element));

      // The miniature sits in the part of the card the pieces can be seen in.
      const cardBox = card.getBoundingClientRect();
      let seen = intersect(cardBox, layerBox);
      for (const { element } of pieces) {
        seen = intersect(seen, visibleBoxOf(element, layer));
      }
      const roomBox = {
        left: seen.left,
        top: seen.top,
        width: seen.right - seen.left,
        height: seen.bottom - seen.top,
      };
      if (roomBox.width <= 0 || roomBox.height < cardBox.height * LEAST_ROOM) {
        return;
      }
      const miniature = miniatureOf(whole, roomBox);

      flew = true;
      flight = player;
      const current = run;

      // The workspace is up. From here on nothing else shares these frames.
      const releaseClearing = releaseHold;
      releaseHold = holdDeferredWorkForMotion();
      releaseClearing();

      // The miniature's tray: the card's own colors under the small pieces.
      // The plate condenses onto it over the stage and lets go, so the pieces
      // come into view on the card itself rather than through a tint over
      // them. It goes first in the pieces' holder so every moving piece paints
      // over it, and is placed by measuring where it first lands.
      const cardStyle = getComputedStyle(card);
      const base = document.createElement("div");
      tray = base;
      base.setAttribute("aria-hidden", "true");
      Object.assign(base.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${miniature.width}px`,
        height: `${miniature.height}px`,
        margin: "0",
        background: cardStyle.background,
        borderRadius: cardStyle.borderTopLeftRadius,
        pointerEvents: "none",
      });
      holder.prepend(base);
      const placed = base.getBoundingClientRect();
      base.style.left = `${miniature.left - placed.left}px`;
      base.style.top = `${miniature.top - placed.top}px`;

      const flying = player.fly({ card, miniature });
      // The whole tile goes, its glow too: the plate is the card from here.
      const tile = card.closest<HTMLElement>(".method-item") ?? card;
      hideCard = [
        tile.animate([{ opacity: 0 }, { opacity: 0 }], {
          duration: 0,
          fill: "forwards",
        }),
      ];
      report("flight");

      // Everyone in the wave: the pieces, and what arrives around them, each
      // at its turn in the method's order.
      // Something parked off screen (a closed drawer, a slide-over) rests
      // where nobody sees it: sent from the card, it would cross the screen
      // on its way out of view.
      const stage = layer.getBoundingClientRect();
      const onStage = (element: Element) => {
        const at = element.getBoundingClientRect();
        return (
          at.width > 0 &&
          at.height > 0 &&
          at.right > stage.left &&
          at.left < stage.right &&
          at.bottom > stage.top &&
          at.top < stage.bottom
        );
      };
      const cast = (
        landing.arriving
          ? arrivingLeaves(
              layer,
              landing.arriving,
              pieces.map(({ element }) => element)
            )
          : besidePieces(
              layer,
              pieces.map(({ element }) => element),
              base
            )
      ).filter(onStage);
      const players: WavePlayer[] = [
        ...pieces.map(({ element, box }) => ({ element, box, piece: true })),
        ...cast.map((element) => ({
          element,
          box: element.getBoundingClientRect(),
          piece: false,
        })),
      ];
      const from = centre(cardBox);
      const scene: WaveScene = {
        whole: unionOf(players.map(({ box }) => box)),
        origin: cardBox,
        reach: Math.max(
          ...players.map(({ box }) => {
            const at = centre(box);
            return Math.hypot(at.x - from.x, at.y - from.y);
          })
        ),
      };
      const order =
        landing.order ??
        ((actor: WavePlayer, { origin, reach }: WaveScene) =>
          nearestFirst(actor.box, origin, reach));
      const spread = landing.spread ?? splitSpreadFor(pieces.length);
      const turns = players.map((actor) => order(actor, scene));
      // A dealt landing flies every piece together and shows its order in the
      // pieces' own size instead.
      const dealt = pieces.map(
        ({ element }) => !!landing.deal && element.matches(landing.deal)
      );
      const timings = pieces.map(({ box }, i) =>
        splitTiming({
          card: box,
          grid: whole,
          miniature,
          fraction: landing.deal ? 0 : turns[i]!,
          spread,
        })
      );

      const lastLandMs =
        SPLIT_LEAD_MS + Math.max(0, ...turns) * spread + CREATE_ENTRY_FLIGHT_MS;
      const held = holdSurface(
        layer,
        pieces.map(({ element }) => element),
        lastLandMs
      );

      const split: Animation[] = [];
      const revealed: Animation[] = [];
      pieces.forEach(({ element }, i) => {
        const { delay, dx, dy } = timings[i]!;
        if (!flies[i]) {
          // Something inside is placed against a box outside it, so a
          // transform would move it wrongly: it fades in where it is.
          split.push(
            element.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: DURATION.emphasis,
              delay,
              easing: EASE_STANDARD,
              fill: "backwards",
            })
          );
          return;
        }
        split.push(
          element.animate(
            [
              {
                transformOrigin: "0 0",
                transform: `translate(${dx}px, ${dy}px) scale(${miniature.scale})`,
              },
              { transformOrigin: "0 0", transform: "none" },
            ],
            {
              duration: CREATE_ENTRY_FLIGHT_MS,
              delay,
              // Out of the miniature at speed, settling into place: an ease
              // that starts slowly reads as the pieces hanging on the plate.
              easing: EASE_STANDARD_OUT,
              fill: "backwards",
            }
          )
        );
        if (dealt[i]) {
          // Its turn in the deal: a little small about its own middle, inside
          // the flight, up to size at its turn. Smaller than its place, it
          // never reaches a neighbour. It runs on the piece's own card, so the
          // flight and the size each keep a plain transform the compositor
          // can run; added onto the flight (`composite: "add"`), both ran on
          // the main thread and stalled with it.
          const inner = element.firstElementChild;
          const target =
            inner instanceof HTMLElement && movesSafely(inner)
              ? inner
              : element;
          const turn = Math.min(1, Math.max(0, turns[i]!));
          // Its laid-out size: the flight already scales what the screen shows.
          const width = target.offsetWidth;
          const height = target.offsetHeight;
          const about = (scale: number) =>
            `translate(${width / 2}px, ${height / 2}px) scale(${scale}) translate(${-width / 2}px, ${-height / 2}px)`;
          split.push(
            target.animate(
              [
                { transformOrigin: "0 0", transform: about(DEAL_FROM) },
                { transformOrigin: "0 0", transform: about(1) },
              ],
              {
                duration: CREATE_ENTRY_FLIGHT_MS,
                delay: SPLIT_LEAD_MS + turn * spread,
                easing: EASE_STANDARD_OUT,
                fill: "backwards",
                ...(target === element ? { composite: "add" as const } : {}),
              }
            )
          );
        }
        // The small pieces come into view while the plate condenses.
        revealed.push(
          element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: SPLIT_REVEAL_MS,
            delay: SPLIT_REVEAL_AT_MS,
            easing: EASE_STANDARD,
            fill: "backwards",
          })
        );
      });
      // The tray comes in as the plate lets go, and clears as the pieces
      // leave it.
      const trayIn = SPLIT_REVEAL_AT_MS + SPLIT_REVEAL_MS;
      const trayMs = trayIn + DURATION.normal;
      const trayClears = base.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: SPLIT_REVEAL_AT_MS / trayMs },
          { opacity: 1, offset: trayIn / trayMs, easing: EASE_STANDARD_OUT },
          { opacity: 0, offset: 1 },
        ],
        { duration: trayMs, fill: "both" }
      );
      void settle(split).then(() => {
        if (current === run) report("landed");
      });

      // The supporting cast leaves in the same wave, at its own turn, rather
      // than after the pieces.
      const arriving = cast.map((element, i) => {
        const turn = Math.min(1, Math.max(0, turns[pieces.length + i] ?? 0));
        const delay = SPLIT_LEAD_MS + turn * spread;
        const { dx, dy } = emanateTiming({
          card: players[pieces.length + i]!.box,
          origin: whole,
          bounds: layerBox,
          stacked: false,
        });
        return movesSafely(element)
          ? playEmanate(element, { delay, dx, dy })
          : element.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: DURATION.emphasis,
              delay,
              easing: EASE_STANDARD,
              fill: "backwards",
            });
      });

      // The method's own touch as its pieces come to rest.
      const signature =
        landing.signature?.({
          layer,
          at: SPLIT_LEAD_MS + CREATE_ENTRY_FLIGHT_MS * SIGNATURE_AT,
        }) ?? [];

      arrival = [
        ...held,
        ...split,
        ...revealed,
        trayClears,
        ...arriving,
        ...signature,
      ];

      void settle([...flying, ...arrival]).then(() => {
        if (current !== run) return;
        report("arrived");
        cleanUp();
      });
    },

    /**
     * The workspace's fade finished. A split has its own ending; an entry that
     * had nothing to land on ends here.
     */
    settled(): void {
      if (method && !flew) cleanUp();
    },

    /**
     * The entry was abandoned before it landed. A board still clearing comes
     * back from where it is on screen; a split fades where it is while the
     * crossfade brings the board back.
     */
    abort(): void {
      if (!method) return;
      const returning = flew ? [] : departure;
      if (!flew) departure = [];
      const player = flight;
      flight = null;
      player?.dismiss();
      for (const animation of returning) animation.reverse();
      for (const pulse of pulses) pulse.cancel();
      pulses = [];
      endHoverQuiet();
      cleanUp();
      void settle(returning).then(() => {
        for (const animation of returning) animation.cancel();
      });
    },

    /** Stops everything now, with nothing left behind. */
    dispose(): void {
      for (const pulse of pulses) pulse.cancel();
      pulses = [];
      endHoverQuiet();
      cleanUp();
    },
  };
}
