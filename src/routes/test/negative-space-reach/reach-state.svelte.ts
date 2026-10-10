/**
 * The reach filmstrip's state IS its URL.
 *
 * Every axis a person can change — the body, which frames are shown, which
 * route, which camera angle, whether the measurement overlay draws, whether
 * the full readouts panel is open — lives in the query string, so a finding
 * can be handed over as a link instead of a paragraph of setup instructions.
 *
 * One direction of flow: the URL is read into derived values and every
 * setter writes the URL, so the two can never drift apart. Every frame here
 * is a FROZEN pose rather than a moving clock, so — unlike the scrubbing lab
 * this page used to be — nothing needs the coalesced-write/local-mirror
 * treatment `phase` used to get. That machinery is gone with it.
 */
import { browser } from "$app/env";
import { page } from "$app/state";

import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
import { writeUrl } from "#lib/shared/navigation/services/url-state.js";

import { DEFAULT_LAB_CHARACTER_ID, isLabCharacterId } from "../_lab-kit/lab-characters";

import { formatFramesParam, parseFramesParam } from "./filmstrip-frames";
import { DEFAULT_REACH_VIEW_ID, REACH_VIEWS } from "./reach-framing";
import { REACH_ROUTES, SHORT_SWEEP_ROUTE } from "./reach-routes";

export const REACH_PARAM = {
  character: "character",
  frames: "frames",
  route: "route",
  view: "view",
  overlay: "overlay",
  readouts: "readouts",
} as const;

const VIEW_IDS: readonly string[] = REACH_VIEWS.map((view) => view.id);
const ROUTE_IDS: readonly string[] = REACH_ROUTES.map((route) => route.id);

export class ReachLabState {
  /**
   * The URL this lab reads, mirrored reactively.
   *
   * It cannot be `page.url`. Writes go through SvelteKit shallow routing, and
   * `pushState`/`replaceState` update only `page.state` — `page.url` keeps
   * naming the last real navigation. Deriving from it gives a lab whose
   * address bar moves while the page ignores it. This mirror is written
   * before the history call and re-seeded from `popstate` and real
   * navigations, so reads follow the address bar in every direction.
   */
  #url = $state(new URL(page.url.href));

  readonly character = $derived.by((): CharacterId => {
    const raw = this.#url.searchParams.get(REACH_PARAM.character);
    return raw && isLabCharacterId(raw) ? raw : DEFAULT_LAB_CHARACTER_ID;
  });

  /** Frame percents through the reach, ascending, always at least two. */
  readonly frames = $derived.by((): number[] =>
    parseFramesParam(this.#url.searchParams.get(REACH_PARAM.frames))
  );

  /** Which of the two prop paths is on screen. Defaults to the anti route. */
  readonly routeId = $derived.by((): string => {
    const raw = this.#url.searchParams.get(REACH_PARAM.route);
    return raw && ROUTE_IDS.includes(raw) ? raw : SHORT_SWEEP_ROUTE.id;
  });

  readonly viewId = $derived.by((): string => {
    const raw = this.#url.searchParams.get(REACH_PARAM.view);
    return raw && VIEW_IDS.includes(raw) ? raw : DEFAULT_REACH_VIEW_ID;
  });

  /** The measured skeleton drawn over each render. Off is opt-in. */
  readonly overlay = $derived(
    this.#url.searchParams.get(REACH_PARAM.overlay) !== "0"
  );

  /**
   * The full per-frame readouts panel. Collapsed by default — a filmstrip is
   * meant to be looked at, and a page of measurement prose under every pane
   * was the thing Austen said he could not read.
   */
  readonly readoutsOpen = $derived(
    this.#url.searchParams.get(REACH_PARAM.readouts) === "1"
  );

  setCharacter(id: CharacterId): void {
    this.#write((params) => params.set(REACH_PARAM.character, id), "push");
  }

  setFrames(next: readonly number[]): void {
    this.#write(
      (params) => params.set(REACH_PARAM.frames, formatFramesParam(next)),
      "push"
    );
  }

  setRoute(id: string): void {
    this.#write((params) => params.set(REACH_PARAM.route, id), "push");
  }

  setView(id: string): void {
    this.#write((params) => params.set(REACH_PARAM.view, id), "push");
  }

  setOverlay(enabled: boolean): void {
    this.#write(
      (params) => params.set(REACH_PARAM.overlay, enabled ? "1" : "0"),
      "replace"
    );
  }

  setReadoutsOpen(open: boolean): void {
    this.#write(
      (params) => params.set(REACH_PARAM.readouts, open ? "1" : "0"),
      "replace"
    );
  }

  toggleReadouts(): void {
    this.setReadoutsOpen(!this.readoutsOpen);
  }

  /**
   * Every axis written explicitly, defaults included. A link that omits
   * defaults still restores correctly, but one that names them survives a
   * change of default — which matters when the point is pasting a finding
   * into a conversation.
   */
  fullyQualifiedHref(): string {
    const url = new URL(this.#url);
    const params = url.searchParams;
    params.set(REACH_PARAM.character, this.character);
    params.set(REACH_PARAM.frames, formatFramesParam(this.frames));
    params.set(REACH_PARAM.route, this.routeId);
    params.set(REACH_PARAM.view, this.viewId);
    params.set(REACH_PARAM.overlay, this.overlay ? "1" : "0");
    params.set(REACH_PARAM.readouts, this.readoutsOpen ? "1" : "0");
    return url.href;
  }

  /**
   * Re-read the address bar after a change this owner did not make. Back and
   * Forward move `window.location` without telling the app.
   */
  attachUrlSync(): () => void {
    if (!browser) return () => {};
    const sync = () => this.#adoptLocation();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }

  /**
   * Adopt a real navigation. `page.url` still tracks those, so arriving here
   * with different params re-seeds the mirror instead of being ignored.
   */
  syncFromNavigation(): void {
    this.#adoptLocation();
  }

  #write(
    mutate: (params: URLSearchParams) => void,
    mode: "push" | "replace"
  ): void {
    if (!browser) return;
    // Built from `window.location` rather than the mirror, so a write can
    // never resurrect an axis some other writer has since changed.
    const next = new URL(window.location.href);
    mutate(next.searchParams);
    if (next.href === window.location.href) return;
    // The mirror moves first: a control's re-render must not wait on the
    // history call, which the shared owner may defer while the router
    // starts.
    this.#url = next;
    writeUrl(next, { mode });
  }

  /**
   * `window.location` is the only honest source. `page.url` names the last
   * real navigation and never moves for shallow routing, so re-seeding from
   * it would undo a Back the moment SvelteKit reassigns its page object.
   */
  #adoptLocation(): void {
    if (!browser) return;
    const href = window.location.href;
    if (this.#url.href === href) return;
    this.#url = new URL(href);
  }
}
