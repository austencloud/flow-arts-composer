/**
 * The one way a homepage tile opens into its page.
 *
 * A tile is a doorway, not a box, so nothing expands out of it. Pressing one arms
 * a flight, and the navigation it leads to is a depth push: home sinks back and
 * softens while the page comes forward from just behind the glass, and Back is
 * the mirror. Each page content is its own view-transition picture, named
 * `page-leaving` or `page-arriving`, because sharing a name would morph one box
 * into the other.
 *
 * A flight starts only from a press. The header's link to the same URL gets the
 * ordinary page fade, and Back pushes only when the trip out was a flight. The
 * styles are in view-transitions.css under TILE FLIGHT.
 */
import { waitForPageReady } from "@austencloud/motion";

/** Pages whose main hero borrows the resident player. /about renders /composer's body. */
export const RESIDENT_HOST_PATHS: readonly string[] = Object.freeze([
  "/",
  "/composer",
  "/about",
]);

const HOME_PATH = "/";
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

interface ActiveFlight {
  kind: SiteFlightKind;
  /** The tile's page, at the far end of a push; null in a glide. */
  to: string | null;
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
  // Where the pressed tile leads.
  let armed: string | null = null;
  let active = $state.raw<ActiveFlight | null>(null);
  // The page the visitor flew to, kept for the trip back.
  let flown: string | null = null;
  let expiry: unknown = null;

  function disarm(): void {
    armed = null;
    if (expiry !== null) clearTimer(expiry);
    expiry = null;
  }

  function decide(from: string, to: string): TileFlightDirection | null {
    if (armed && from === HOME_PATH && to === armed) return "open";
    if (flown && to === HOME_PATH && from === flown) return "close";
    return null;
  }

  return {
    /** A plain press on a tile or one of its chips. */
    arm(href: string): void {
      disarm();
      const to = pathOf(href);
      if (to === HOME_PATH) return;
      armed = to;
      expiry = setTimer(disarm, armMs);
    },
    disarm,
    decide,
    /** A navigation is starting; one headed elsewhere replaces the press. */
    navigationStarting(to: string | null | undefined): void {
      if (armed && to !== armed) disarm();
    },
    /** A navigation landed. Decides what the next trip home may do. */
    navigationSettled(from: string | null | undefined, to: string): void {
      if (armed && from === HOME_PATH && to === armed) flown = armed;
      else if (from !== to) flown = null;
      disarm();
    },
    begin(kind: SiteFlightKind): void {
      const to = kind === "open" ? armed : kind === "close" ? flown : null;
      active = { kind, to };
    },
    end(): void {
      active = null;
    },
    get kind(): SiteFlightKind | null {
      return active?.kind ?? null;
    },
    /** What the keyed page content calls itself as it arrives. */
    arrivingContentName(path: string): string | undefined {
      const arriving =
        (active?.kind === "open" && active.to === path) ||
        (active?.kind === "close" && path === HOME_PATH);
      return arriving ? PAGE_ARRIVING_NAME : undefined;
    },
    /**
     * Whether the arriving page does its own short fade. A tile flight animates
     * both pictures itself, so only a glide between hosts, which has just the
     * player to carry the change, fades the page.
     */
    get contentFades(): boolean {
      return active?.kind === "resident";
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
  /** The content on its way out, measured before the old capture. */
  leaving: FlightBox;
  /** The content on its way in, measured once the transition is ready. */
  arriving: FlightBox;
  viewport: { width: number; height: number };
}

/** The middle of a box's on-screen part, from that box's own corner. */
function screenCentreWithin(
  box: FlightBox,
  viewport: { width: number; height: number }
): { x: number; y: number } {
  const left = Math.max(box.x, 0);
  const top = Math.max(box.y, 0);
  const right = Math.min(box.x + box.width, viewport.width);
  const bottom = Math.min(box.y + box.height, viewport.height);
  return {
    x: left + Math.max(right - left, 0) / 2 - box.x,
    y: top + Math.max(bottom - top, 0) / 2 - box.y,
  };
}

/**
 * The point each picture scales about, as custom properties for the TILE FLIGHT
 * styles. A page may be thousands of pixels tall and sit above the screen when
 * scrolled, so scaling about its own centre would slide what is on screen.
 */
export function flightGeometry({
  leaving,
  arriving,
  viewport,
}: FlightGeometryInput): Record<string, string> {
  const leavingCentre = screenCentreWithin(leaving, viewport);
  const arrivingCentre = screenCentreWithin(arriving, viewport);
  return {
    "--tile-flight-leaving-x": `${leavingCentre.x}px`,
    "--tile-flight-leaving-y": `${leavingCentre.y}px`,
    "--tile-flight-arriving-x": `${arrivingCentre.x}px`,
    "--tile-flight-arriving-y": `${arrivingCentre.y}px`,
  };
}

function boxOf(element: Element | null): FlightBox | null {
  if (!element) return null;
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

const CONTENT_SELECTOR = ".mkt-content";

function flightKindFor(from: string, to: string): SiteFlightKind | null {
  const direction = tileFlight.decide(from, to);
  if (direction) return direction;
  return RESIDENT_HOST_PATHS.includes(from) && RESIDENT_HOST_PATHS.includes(to)
    ? "resident"
    : null;
}

/**
 * The route motion package only honours holdPageReady on its fade path, so a
 * flight honours it here: everything stays frozen on the home page until the
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
  const from = navigation.from?.url?.pathname;
  const to = navigation.to?.url.pathname;
  if (!from || !to) return;
  const kind = flightKindFor(from, to);
  if (!kind) return;

  tileFlight.begin(kind);
  const root = document.documentElement;
  const classes = ["site-flight"];
  if (kind !== "resident") classes.push(`tile-flight-${kind}`);
  root.classList.add(...classes);

  const leavingContent = document.querySelector<HTMLElement>(CONTENT_SELECTOR);
  if (leavingContent) {
    leavingContent.style.viewTransitionName = PAGE_LEAVING_NAME;
  }

  let vars: string[] = [];
  if (kind !== "resident") {
    // The old page is measured now, before its capture. The new one does not
    // exist until the transition is ready.
    const leaving = boxOf(leavingContent);

    void transition.ready
      .then((): Promise<void> | undefined => {
        const arriving = boxOf(document.querySelector(CONTENT_SELECTOR));
        if (leaving && arriving) {
          const geometry = flightGeometry({
            leaving,
            arriving,
            viewport: { width: root.clientWidth, height: innerHeight },
          });
          vars = Object.keys(geometry);
          for (const name of vars)
            root.style.setProperty(name, geometry[name]!);
        }
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
