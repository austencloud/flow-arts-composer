/**
 * The one way a homepage tile opens into its page.
 *
 * Pressing a tile arms a flight. While armed, the tile carries the name
 * `tile-window` and the next page's content takes the same name, so the browser
 * captures both. The pressed tile's glass then becomes a real panel that travels
 * from the tile to the screen, and Back flies it home again. Nothing is clipped:
 * the tile's picture and the page's picture stay pinned where they sit on screen
 * and only fade, while the old page recedes from the pressed tile's centre. The
 * glass clears once the page has resolved on it.
 *
 * A flight starts only from a press. The header's link to the same URL gets the
 * ordinary page fade, and Back flies into a tile only when the trip out was a
 * flight. The styles are in view-transitions.css under TILE FLIGHT.
 */
import { waitForPageReady } from "@austencloud/motion";

/** Pages whose main hero borrows the resident player. /about renders /composer's body. */
export const RESIDENT_HOST_PATHS: readonly string[] = Object.freeze([
  "/",
  "/composer",
  "/about",
]);

const HOME_PATH = "/";
export const TILE_WINDOW_NAME = "tile-window";
const PAGE_LEAVING_NAME = "page-leaving";
const PAGE_ARRIVING_NAME = "page-arriving";

/**
 * A press whose navigation never starts (a page guard cancelled it) has nothing
 * to tell us so. After this long the tile lets go, and a very slow navigation
 * just gets the ordinary fade.
 */
export const ARM_EXPIRY_MS = 8_000;

export type TileFlightDirection = "open" | "close";

/** "resident" is the player gliding between its pages with no tile involved. */
export type SiteFlightKind = TileFlightDirection | "resident";

interface FlightRoute {
  tileId: string;
  to: string;
}

interface ActiveFlight {
  kind: SiteFlightKind;
  route: FlightRoute | null;
}

export interface TileFlightOptions {
  armMs?: number;
  setTimer?: (work: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

function pathOf(href: string): string {
  return href.split(/[?#]/, 1)[0] || HOME_PATH;
}

export function createTileFlight({
  armMs = ARM_EXPIRY_MS,
  setTimer = (work, ms) => setTimeout(work, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: TileFlightOptions = {}) {
  let armed = $state.raw<FlightRoute | null>(null);
  let active = $state.raw<ActiveFlight | null>(null);
  // The tile the visitor flew out of, kept for the trip back.
  let flown: FlightRoute | null = null;
  let expiry: unknown = null;

  function disarm(): void {
    armed = null;
    if (expiry !== null) clearTimer(expiry);
    expiry = null;
  }

  function decide(from: string, to: string): TileFlightDirection | null {
    if (armed && from === HOME_PATH && to === armed.to) return "open";
    if (flown && to === HOME_PATH && from === flown.to) return "close";
    return null;
  }

  return {
    /** A plain press on a tile or one of its chips. */
    arm(tileId: string, href: string): void {
      disarm();
      const to = pathOf(href);
      if (to === HOME_PATH) return;
      armed = { tileId, to };
      expiry = setTimer(disarm, armMs);
    },
    disarm,
    decide,
    /** A navigation is starting; one headed elsewhere replaces the press. */
    navigationStarting(to: string | null | undefined): void {
      if (armed && to !== armed.to) disarm();
    },
    /** A navigation landed. Decides what the next trip home may do. */
    navigationSettled(from: string | null | undefined, to: string): void {
      if (armed && from === HOME_PATH && to === armed.to) flown = armed;
      else if (from !== to) flown = null;
      disarm();
    },
    begin(kind: SiteFlightKind): void {
      const route = kind === "open" ? armed : kind === "close" ? flown : null;
      active = { kind, route };
    },
    end(): void {
      active = null;
    },
    get kind(): SiteFlightKind | null {
      return active?.kind ?? null;
    },
    /** The tile that is, or is about to be, one end of a flight. */
    isFlying(tileId: string): boolean {
      if (armed?.tileId === tileId) return true;
      return active?.kind === "close" && active.route?.tileId === tileId;
    },
    /** What the keyed page content calls itself as it arrives. */
    arrivingContentName(path: string): string | undefined {
      if (active?.kind === "open" && active.route?.to === path) {
        return TILE_WINDOW_NAME;
      }
      if (active?.kind === "close" && path === HOME_PATH) {
        return PAGE_ARRIVING_NAME;
      }
      return undefined;
    },
    /**
     * Whether the arriving page does its own short fade. A tile flight animates
     * both pictures itself, so only a glide between hosts, which has just the
     * player to carry the change, fades the page.
     */
    get contentFades(): boolean {
      return active?.kind === "resident";
    },
    get armedRoute(): FlightRoute | null {
      return armed;
    },
    get activeRoute(): FlightRoute | null {
      return active?.route ?? null;
    },
  };
}

export const tileFlight = createTileFlight();

/** Only an unmodified primary press navigates this tab, so only it may fly. */
export function isPlainPress(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export interface FlightBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlightGeometryInput {
  direction: TileFlightDirection;
  /** The pressed tile on the way out, the arriving tile on the way back. */
  tile: FlightBox;
  /** The destination page's content: arriving on open, leaving on close. */
  page: FlightBox;
  /** The homepage's content: leaving on open, arriving on close. */
  home: FlightBox;
  viewport: { width: number; height: number };
}

function withinViewport(
  box: FlightBox,
  viewport: { width: number; height: number }
): FlightBox {
  const left = Math.max(box.x, 0);
  const top = Math.max(box.y, 0);
  const right = Math.min(box.x + box.width, viewport.width);
  const bottom = Math.min(box.y + box.height, viewport.height);
  return {
    x: left,
    y: top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
}

function boxVars(name: string, box: FlightBox): Record<string, string> {
  return {
    [`--tile-flight-${name}-x`]: `${box.x}px`,
    [`--tile-flight-${name}-y`]: `${box.y}px`,
    [`--tile-flight-${name}-w`]: `${box.width}px`,
    [`--tile-flight-${name}-h`]: `${box.height}px`,
  };
}

/**
 * The flight's boxes as custom properties for the TILE FLIGHT styles, all in
 * viewport pixels. The page box is the whole page, which may be thousands of
 * pixels tall and sit above the screen when scrolled; the panel stops at the
 * screen's edge, so it travels to and from what is actually on screen.
 */
export function flightGeometry({
  direction,
  tile,
  page,
  home,
  viewport,
}: FlightGeometryInput): Record<string, string> {
  const screen = withinViewport(page, viewport);
  const opening = direction === "open";
  return {
    ...boxVars("tile", tile),
    ...boxVars("page", page),
    ...boxVars("from", opening ? tile : screen),
    ...boxVars("to", opening ? screen : tile),
    // The point the homepage recedes into and comes forward from.
    "--tile-flight-origin-x": `${tile.x + tile.width / 2 - home.x}px`,
    "--tile-flight-origin-y": `${tile.y + tile.height / 2 - home.y}px`,
    // The page picture scales about the middle of what is on screen, not the
    // middle of a page that runs far below it.
    "--tile-flight-screen-x": `${screen.x + screen.width / 2 - page.x}px`,
    "--tile-flight-screen-y": `${screen.y + screen.height / 2 - page.y}px`,
  };
}

function boxOf(element: Element | null): FlightBox | null {
  if (!element) return null;
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

const CONTENT_SELECTOR = ".mkt-content";

function tileElement(tileId: string | undefined): HTMLElement | null {
  if (!tileId) return null;
  return document.querySelector<HTMLElement>(
    `[data-tile-id="${CSS.escape(tileId)}"]`
  );
}

/**
 * What the panel takes from the tile itself: its accent, and its corner, which
 * the launchpad's viewport tiers tighten below the token's.
 */
function tileLook(tile: HTMLElement | null): Record<string, string> {
  if (!tile) return {};
  const look: Record<string, string> = {
    "--tile-flight-tint": getComputedStyle(tile).getPropertyValue("--c").trim(),
  };
  if (tile.firstElementChild) {
    look["--tile-flight-radius"] = getComputedStyle(
      tile.firstElementChild
    ).borderTopLeftRadius;
  }
  return look;
}

function flightKindFor(from: string, to: string): SiteFlightKind | null {
  const direction = tileFlight.decide(from, to);
  if (direction) return direction;
  return RESIDENT_HOST_PATHS.includes(from) && RESIDENT_HOST_PATHS.includes(to)
    ? "resident"
    : null;
}

/**
 * The route motion package only honours holdPageReady on its fade path, so a
 * flight honours it here: everything stays frozen on the pressed tile until the
 * page's first screen is drawn, up to the package's cap.
 */
async function holdForFirstScreen(): Promise<void> {
  const frozen = document
    .getAnimations()
    .filter((animation) =>
      (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith(
        "::view-transition"
      )
    );
  for (const animation of frozen) animation.pause();
  await waitForPageReady();
  for (const animation of frozen) animation.play();
}

interface FlightNavigation {
  from: { url: { pathname: string } } | null;
  to: { url: { pathname: string } } | null;
}

/**
 * Runs from installRouteMotion's onTransition, after the transition starts and
 * before the browser captures the old page, so everything named here is in the
 * capture. Morphs that are neither a tile nor the resident player pass through.
 */
export function startSiteFlight(
  transition: ViewTransition,
  navigation: FlightNavigation
): void {
  const from = navigation.from?.url.pathname;
  const to = navigation.to?.url.pathname;
  if (!from || !to) return;
  const kind = flightKindFor(from, to);
  if (!kind) return;

  tileFlight.begin(kind);
  const route = tileFlight.activeRoute;
  const root = document.documentElement;
  const classes = ["site-flight"];
  if (kind !== "resident") classes.push(`tile-flight-${kind}`);
  root.classList.add(...classes);

  const leavingContent = document.querySelector<HTMLElement>(CONTENT_SELECTOR);
  if (leavingContent) {
    leavingContent.style.viewTransitionName =
      kind === "close" ? TILE_WINDOW_NAME : PAGE_LEAVING_NAME;
  }

  let vars: string[] = [];
  if (kind !== "resident") {
    // Whatever is on screen now is measured now, before the old capture. The
    // rest does not exist until the transition is ready.
    const leavingBox = boxOf(leavingContent);
    const pressedTile = tileElement(route?.tileId);
    const pressedBox = kind === "open" ? boxOf(pressedTile) : null;
    const pressedLook = kind === "open" ? tileLook(pressedTile) : null;

    void transition.ready
      .then((): Promise<void> | undefined => {
        const arrivingContent = boxOf(document.querySelector(CONTENT_SELECTOR));
        const arrivingTile =
          kind === "close" ? tileElement(route?.tileId) : null;
        const tile = kind === "open" ? pressedBox : boxOf(arrivingTile);
        const page = kind === "open" ? arrivingContent : leavingBox;
        const home = kind === "open" ? leavingBox : arrivingContent;
        if (!tile || !page || !home) return undefined;
        const geometry: Record<string, string> = {
          ...flightGeometry({
            direction: kind,
            tile,
            page,
            home,
            viewport: { width: root.clientWidth, height: innerHeight },
          }),
          ...(pressedLook ?? tileLook(arrivingTile)),
        };
        vars = Object.keys(geometry);
        for (const name of vars) root.style.setProperty(name, geometry[name]!);
        return kind === "open" ? holdForFirstScreen() : undefined;
      })
      // A transition skipped before it started has nothing to place.
      .catch(() => {});
  }

  const finish = (): void => {
    root.classList.remove(...classes);
    for (const name of vars) root.style.removeProperty(name);
    tileFlight.end();
  };
  void transition.finished.then(finish, finish);
}
