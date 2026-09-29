/**
 * The lab's state IS its URL.
 *
 * Every axis a person can change here — the character, the prop, the prop
 * length, the sequence, where in that sequence we are, whether it is running,
 * which cameras are up, which inspector is open — lives in the query string.
 * Copying the address bar and pasting it somewhere else reproduces the exact
 * moment, which is the only way a cross-body / cross-prop finding can be
 * handed to another person without a paragraph of setup instructions.
 *
 * One direction of flow: the URL is read into derived values, and every
 * setter writes the URL. Nothing keeps a private copy of an axis, so the two
 * can never disagree. `phase` is the single exception and it is explained on
 * its own accessor.
 */
import { untrack } from "svelte";

import { browser } from "$app/environment";
import { page } from "$app/state";

import { writeUrl } from "$lib/shared/navigation/services/url-state";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { CharacterId } from "$lib/shared/3d/domain/character-model";

import {
  LAB_FRAME_STEP,
  clampLabPhase,
  formatLabPhase,
  snapLabPhase,
} from "../_lab-kit/phase-transport";

import {
  DEFAULT_LAB_CHARACTER_ID,
  DEFAULT_LAB_PROP,
  DEFAULT_LAB_SEQUENCE_ID,
  isLabCharacterId,
  isLabPropType,
} from "./lab-catalog";
import { INSPECTION_VIEWS } from "./inspection-framing";

export const LAB_PARAM = {
  character: "character",
  prop: "prop",
  length: "length",
  sequence: "seq",
  phase: "phase",
  playing: "play",
  view: "view",
  panel: "panel",
  labels: "labels",
  // Not `grid`: the root layout strips `grid` from every URL outside the
  // atlas (url-parameter-policy.ts), which dropped the style on each reload.
  gridStyle: "hands",
  bodyClearance: "clear",
} as const;

/** Camera layout: the four-pane rig, or one pane on its own. */
export type LabView = "quad" | (typeof INSPECTION_VIEWS)[number]["id"];

const VIEW_IDS: readonly string[] = [
  "quad",
  ...INSPECTION_VIEWS.map((view) => view.id),
];

/** Which inspector the console rail is showing. */
export const LAB_PANELS = ["fit", "grip", "turn", "matrix"] as const;
export type LabPanel = (typeof LAB_PANELS)[number];

/**
 * `body` asks the renderer for the length this body can actually hold inside
 * its own hug; a number pins the prop at that many centimetres regardless of
 * who is holding it. Both are needed: the first is the product's behaviour,
 * the second is how you hold one variable still while sweeping the other.
 */
export type LabPropLength = "body" | number;

/**
 * Where the hands sit. `fixed` keeps the performer's 0.52 m. `isolation`
 * puts each hand half the staff from the grid center, so a staff pointing in
 * ends on the center point. Extension waits on its reach rule
 * (docs/architecture/performer-grid-styles.md, step 4).
 */
export const LAB_GRID_STYLES = ["fixed", "isolation"] as const;
export type LabGridStyle = (typeof LAB_GRID_STYLES)[number];

/**
 * Whether the body moves off the point its staffs isolate around, and how
 * (docs/architecture/performer-grid-styles.md, step 5). `off` is today's
 * performer; `shift` moves the hips with the feet planted; `step` carries the
 * feet along.
 */
export const LAB_BODY_CLEARANCES = ["off", "shift", "step"] as const;
export type LabBodyClearance = (typeof LAB_BODY_CLEARANCES)[number];

export const DEFAULT_LAB_PHASE = 7.99;

/**
 * One frame: the finest moment this lab can name.
 *
 * Re-exported so every caller that already names it here keeps working. The
 * definition — and the reasoning behind 0.01 — lives with the shared
 * transport in `../_lab-kit/phase-transport`, because the scrub, the URL
 * format and the clamp have to agree on one grid across every lab that
 * scrubs a phase.
 */
export { LAB_FRAME_STEP };

/** Supported prop length band, matching the hug fit's own bounds. */
export const LAB_LENGTH_MIN_CM = 61;
export const LAB_LENGTH_MAX_CM = 152;

/**
 * The phase grid, from the shared owner. These were this lab's own three
 * functions until a second lab needed the same addressing; the local names
 * stay so the class below reads exactly as it did.
 */
const clampPhase = clampLabPhase;
const formatPhase = formatLabPhase;
const snapPhase = snapLabPhase;

export interface StaffLabStateOptions {
  /** Steps in the loaded sequence, so phase can clamp to it. */
  stepCount: () => number;
}

export class StaffLabState {
  readonly #stepCount: () => number;

  /**
   * The URL this lab reads, mirrored reactively.
   *
   * It cannot be `page.url`. Every write here goes through SvelteKit shallow
   * routing, and `pushState`/`replaceState` deliberately update only
   * `page.state` — `page.url` keeps naming the last real navigation
   * (`@sveltejs/kit` 2.61.1, `client.js`: `page.state = state` with no url
   * assignment). Deriving the axes from `page.url` therefore produced a lab
   * whose address bar moved while the page ignored it: the link was right and
   * the instrument was a frame behind, which is the exact opposite of the
   * point. This mirror is written by `#write` before the history call and
   * re-seeded from `popstate` and from real navigations, so reads follow the
   * address bar in every direction — clicks, Back, Forward, paste, reload.
   */
  #url = $state(new URL(page.url));

  /**
   * Phase is the one axis that changes continuously, so it cannot be read
   * straight off the URL: a running clock would issue a history write every
   * frame. It is mirrored locally, written on a short coalescing timer, and
   * flushed the instant it stops moving or the window loses focus — which is
   * exactly when someone reaches for the address bar. A URL change that did
   * not come from this mirror (a reload, Back, or a pasted link) is adopted.
   */
  #phase = $state(DEFAULT_LAB_PHASE);
  #phaseWrittenParam: string | null = null;
  #phaseFlushTimer: ReturnType<typeof setTimeout> | null = null;
  #adopted = false;

  constructor(options: StaffLabStateOptions) {
    this.#stepCount = options.stepCount;
  }

  readonly character = $derived.by((): CharacterId => {
    const raw = this.#url.searchParams.get(LAB_PARAM.character);
    return raw && isLabCharacterId(raw) ? raw : DEFAULT_LAB_CHARACTER_ID;
  });

  /**
   * The LED Baton, not the plain Staff.
   *
   * `Staff3D` draws a T-bar at the thumb end: a crossbar 22.8% of the shaft's
   * length with a dark cap on each tip, carried over from the 2D pictograph
   * where it marks which end the thumb reads. It is notation. No staff anyone
   * spins has it, and on a body it reads as a spike coming off the prop —
   * which is the first thing anyone looking at this lab has to explain away
   * before they can look at the grip. The Baton is the same Double Staff
   * family, a real prop, and the smaller of the two model-backed builds
   * (86.36 cm against the Fire Staff's 90).
   *
   * It is a catalog build like any other, so the picker still owns the
   * choice and `?prop=staff` still reaches the procedural staff.
   */
  readonly prop = $derived.by((): PropType => {
    const raw = this.#url.searchParams.get(LAB_PARAM.prop);
    return raw && isLabPropType(raw) ? raw : DEFAULT_LAB_PROP;
  });

  readonly propLength = $derived.by((): LabPropLength => {
    const raw = this.#url.searchParams.get(LAB_PARAM.length);
    if (!raw || raw === "body") return "body";
    const cm = Number(raw);
    if (!Number.isFinite(cm)) return "body";
    return Math.min(LAB_LENGTH_MAX_CM, Math.max(LAB_LENGTH_MIN_CM, cm));
  });

  readonly gridStyle = $derived.by(
    (): LabGridStyle =>
      this.#url.searchParams.get(LAB_PARAM.gridStyle) === "isolation"
        ? "isolation"
        : "fixed"
  );

  readonly bodyClearance = $derived.by((): LabBodyClearance => {
    const raw = this.#url.searchParams.get(LAB_PARAM.bodyClearance);
    return raw === "shift" || raw === "step" ? raw : "off";
  });

  readonly sequenceId = $derived(
    this.#url.searchParams.get(LAB_PARAM.sequence) ?? DEFAULT_LAB_SEQUENCE_ID
  );

  readonly playing = $derived(
    this.#url.searchParams.get(LAB_PARAM.playing) === "1"
  );

  readonly view = $derived.by((): LabView => {
    const raw = this.#url.searchParams.get(LAB_PARAM.view);
    return raw && VIEW_IDS.includes(raw) ? (raw as LabView) : "quad";
  });

  readonly panel = $derived.by((): LabPanel => {
    const raw = this.#url.searchParams.get(LAB_PARAM.panel);
    return raw && (LAB_PANELS as readonly string[]).includes(raw)
      ? (raw as LabPanel)
      : "fit";
  });

  /** Grid point labels in the wide reference pane. Off is opt-in. */
  readonly gridLabels = $derived(
    this.#url.searchParams.get(LAB_PARAM.labels) !== "0"
  );

  get phase(): number {
    return this.#phase;
  }

  /**
   * The phase as a name: the exact string the `phase=` param carries.
   *
   * The readout renders this rather than formatting the number itself, so a
   * frame the lab shows and a frame the address bar names can never be two
   * different strings. That mattered: the transport used to read out a
   * 1-based `Step 8.99` beside a URL that said `phase=7.99`, which gave one
   * moment two names and made "it breaks here" unreportable.
   */
  get phaseParam(): string {
    return formatPhase(this.#phase);
  }

  /**
   * Discrete transport movement — a frame button, a step button, an arrow key.
   *
   * Distinct from `setPhase` in two ways that only matter when someone is
   * naming a moment rather than watching one: it snaps onto the addressable
   * grid, and it writes the URL immediately instead of waiting on the
   * coalescing timer. After this returns, the phase, the readout and the
   * address bar are the same value.
   */
  stepPhase(delta: number): void {
    this.#phase = clampPhase(snapPhase(this.#phase + delta), this.#stepCount());
    this.flushPhase();
  }

  /**
   * Adopt a phase this state owner did not write. Call from an effect so a
   * reload, a Back, or a pasted link lands on the frame it names.
   */
  adoptUrlPhase(): void {
    const raw = this.#url.searchParams.get(LAB_PARAM.phase);
    if (this.#adopted && raw === this.#phaseWrittenParam) return;
    this.#adopted = true;
    this.#phaseWrittenParam = raw;
    const next = raw === null ? DEFAULT_LAB_PHASE : Number(raw);
    this.#phase = clampPhase(next, this.#stepCount());
  }

  /**
   * Continuous phase movement — playback ticks and slider drags. Coalesced so
   * a running clock writes history roughly five times a second rather than
   * sixty, and always as a replace so scrubbing never fills the Back stack.
   */
  setPhase(next: number): void {
    this.#phase = clampPhase(next, this.#stepCount());
    if (this.#phaseFlushTimer !== null) return;
    this.#phaseFlushTimer = setTimeout(() => {
      this.#phaseFlushTimer = null;
      this.flushPhase();
    }, 180);
  }

  /** Write the exact current phase now. */
  flushPhase(): void {
    if (this.#phaseFlushTimer !== null) {
      clearTimeout(this.#phaseFlushTimer);
      this.#phaseFlushTimer = null;
    }
    const formatted = formatPhase(this.#phase);
    this.#phaseWrittenParam = formatted;
    this.#write((params) => params.set(LAB_PARAM.phase, formatted), "replace");
  }

  setCharacter(id: CharacterId): void {
    this.#write((params) => params.set(LAB_PARAM.character, id), "push");
  }

  setProp(prop: PropType): void {
    this.#write((params) => params.set(LAB_PARAM.prop, prop), "push");
  }

  setPropLength(length: LabPropLength): void {
    // A centimetre value arrives from a slider, so it replaces rather than
    // stacking one history entry per pixel of drag.
    this.#write(
      (params) =>
        params.set(
          LAB_PARAM.length,
          length === "body" ? "body" : length.toFixed(0)
        ),
      length === "body" ? "push" : "replace"
    );
  }

  setGridStyle(style: LabGridStyle): void {
    this.#write((params) => params.set(LAB_PARAM.gridStyle, style), "push");
  }

  setBodyClearance(clearance: LabBodyClearance): void {
    this.#write(
      (params) => params.set(LAB_PARAM.bodyClearance, clearance),
      "push"
    );
  }

  setSequence(id: string): void {
    // A different sequence has a different length, so the frame we were on no
    // longer names the same moment. Start it at the top.
    this.#phaseWrittenParam = "0.00";
    this.#phase = 0;
    this.#write((params) => {
      params.set(LAB_PARAM.sequence, id);
      params.set(LAB_PARAM.phase, "0.00");
    }, "push");
  }

  setPlaying(playing: boolean): void {
    // Pausing pins the exact frame first, so the paused URL is the frame on
    // screen rather than whatever the last coalesced write happened to catch.
    if (!playing) this.flushPhase();
    this.#write(
      (params) => params.set(LAB_PARAM.playing, playing ? "1" : "0"),
      "replace"
    );
  }

  setView(view: LabView): void {
    this.#write((params) => params.set(LAB_PARAM.view, view), "push");
  }

  setPanel(panel: LabPanel): void {
    this.#write((params) => params.set(LAB_PARAM.panel, panel), "replace");
  }

  setGridLabels(enabled: boolean): void {
    this.#write(
      (params) => params.set(LAB_PARAM.labels, enabled ? "1" : "0"),
      "replace"
    );
  }

  /**
   * Write every axis explicitly, including the ones currently sitting on
   * their default. A link that omits defaults still restores correctly, but a
   * link that names them survives a change of default — which matters when
   * the whole point is pasting a finding into a conversation.
   */
  fullyQualifiedHref(): string {
    // Built from the reactive mirror rather than `window.location`, so the
    // link is a value a template can render and a test can read, not a
    // snapshot that only exists at the moment a button was pressed.
    const url = new URL(this.#url);
    const params = url.searchParams;
    params.set(LAB_PARAM.character, this.character);
    params.set(LAB_PARAM.prop, this.prop);
    params.set(
      LAB_PARAM.length,
      this.propLength === "body" ? "body" : this.propLength.toFixed(0)
    );
    params.set(LAB_PARAM.gridStyle, this.gridStyle);
    params.set(LAB_PARAM.bodyClearance, this.bodyClearance);
    params.set(LAB_PARAM.sequence, this.sequenceId);
    params.set(LAB_PARAM.phase, formatPhase(this.#phase));
    params.set(LAB_PARAM.playing, this.playing ? "1" : "0");
    params.set(LAB_PARAM.view, this.view);
    params.set(LAB_PARAM.panel, this.panel);
    params.set(LAB_PARAM.labels, this.gridLabels ? "1" : "0");
    return url.href;
  }

  /** Flush a moving phase when the window loses focus — the copy gesture. */
  attachFlushOnBlur(): () => void {
    if (!browser) return () => {};
    const flush = () => this.flushPhase();
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }

  #write(
    mutate: (params: URLSearchParams) => void,
    mode: "push" | "replace"
  ): void {
    if (!browser) return;
    // Build the destination from `window.location` rather than the mirror, so
    // a write can never resurrect an axis some other writer has since changed.
    const next = new URL(window.location.href);
    mutate(next.searchParams);
    if (next.href === window.location.href) return;
    // The mirror moves first: a control's own re-render must not wait on the
    // history call, which the shared owner may defer while the router starts.
    this.#url = next;
    writeUrl(next, { mode });
  }

  /**
   * Re-read the address bar after a change this owner did not make. Back and
   * Forward move `window.location` without telling the app, so without this
   * the mirror — and every axis derived from it — silently stops agreeing
   * with the URL the user is looking at.
   */
  attachUrlSync(): () => void {
    if (!browser) return () => {};
    const sync = () => this.#adoptLocation();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }

  /**
   * `window.location` is the only honest source. `page.url` names the last
   * real navigation and never moves for shallow routing, so re-seeding from
   * it would undo a Back the moment SvelteKit reassigns its page object.
   */
  #adoptLocation(): void {
    if (!browser) return;
    const href = window.location.href;
    if (this.#url.href === href) {
      // First run after mount. The mirror was seeded from `page.url`, which on
      // a fresh load already equals `window.location`, so the href guard would
      // skip the one adoption a pasted `phase=` depends on and the lab would
      // open on `DEFAULT_LAB_PHASE` instead of the frame the link names.
      if (!this.#adopted) this.adoptUrlPhase();
      return;
    }
    this.#url = new URL(href);
    this.adoptUrlPhase();
  }

  /**
   * Adopt a real navigation. `page.url` still tracks those, so a `goto` into
   * this route with different params — a coverage-matrix cell, a link from
   * another page — re-seeds the mirror instead of being ignored.
   */
  syncFromNavigation(): void {
    // `page.url` is read purely as the dependency that says a real navigation
    // happened; the value adopted is always `window.location`.
    void page.url.href;
    // Untracked, because this runs inside an effect and both the mirror and
    // the phase are written here. Reading either one back as a dependency
    // would make the effect its own trigger, and Svelte kills that with
    // `effect_update_depth_exceeded` during mount — which in turn stops the
    // router from ever starting, so every later URL write is dropped.
    untrack(() => this.#adoptLocation());
  }
}
