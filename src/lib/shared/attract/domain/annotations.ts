/**
 * The ghost's annotation vocabulary — the whole contract between the presenter
 * and 26 modules of app (spec: 2026-08-04-ghost-mind-design.md §Safety, §Sensors).
 *
 * Default-deny: the ghost may only press an element carrying
 * `data-ghost="safe"`. Everything unannotated is invisible to it, so a control
 * added next month is safe by default. A blacklist would have the opposite
 * default and would lose.
 *
 * `data-ghost-kind` is the second half: it names the ROLE a control plays, so
 * intentions query one stable vocabulary instead of 26 modules' class names.
 * When a component is refactored the attribute travels with it, which is the
 * whole reason this is an annotation rather than a selector table in a distant
 * file.
 *
 *   <button data-ghost="safe" data-ghost-kind="option">          pressable
 *   <div data-ghost-kind="step-cell" data-ghost-index="3">       readable
 *   <div data-ghost-state="playing">                             sensed
 *   <div data-ghost-linger>                                      worth watching
 */

/** Roles the intention bag knows how to act on. */
export type GhostKind =
  | "start-placement"
  | "option"
  | "option-filter"
  | "turn"
  | "step-cell"
  /**
   * The generate button — the app makes a whole sequence in one press.
   *
   * The best single demonstration TKA has, and until this kind existed the
   * generate tab carried no annotation at all: the ghost would walk in, find
   * nothing satisfiable, and bounce straight back out. A 400-decision
   * simulation put 2.7% of the session in generate and zero presses in it.
   */
  | "generate"
  /** A generator setting the ghost may change in place before generating. */
  | "generate-option"
  /**
   * Opens the Sequence Actions panel — the door to extend and the transforms.
   *
   * That whole surface (40 components) carried no annotation at all until
   * 2026-08-06, so the ghost had never once touched it in any run. It could not
   * see it.
   */
  | "sequence-actions"
  /**
   * Completes a sequence that closes on itself. The LOOP payoff, and the most
   * impressive single press in the app.
   *
   * Needs no published state attribute, which was a pleasant surprise:
   * `SequenceTransformActions` renders the button inside `{#if onExtend && canExtend}`,
   * so its EXISTENCE is already the extendable signal. The precondition is
   * therefore the app's own answer rather than an inference, which is the only
   * way it cannot lie.
   */
  | "extend"
  /** Mirror / Swap / Rotate / Reverse — changes the whole sequence at once. */
  | "transform"
  /**
   * A control inside the step editor — prop orientation, the beta swap. Editing
   * ONE step of a sequence is the most TKA-specific thing the app does, and the
   * presenter could not demonstrate it at all.
   */
  | "step-edit"
  /** Takes the last step back. Shows a stranger that the app is forgiving. */
  | "undo"
  | "clear"
  /** The confirm button of a dialog the ghost is allowed to go through with. */
  | "confirm"
  /**
   * The way past an UNSOLICITED overlay — a first-run prompt, a tip, an
   * interstitial. Distinct from `confirm`, which finishes something the ghost
   * itself started. Any overlay with a backdrop makes every other control fail
   * the press hit-test, so a blocker it cannot dismiss ends the tour.
   */
  | "dismiss"
  /**
   * Closes a surface the ghost itself opened (the viewer drawer). Distinct from
   * `dismiss`: this one must NOT be high-appeal, or the ghost would shut the
   * viewer the instant it opened it. It is the escape route, pressed only when
   * the room turns out to be a dead end — a programmatic module switch changes
   * what is UNDER an overlay and leaves the overlay covering it.
   */
  | "close-overlay"
  /**
   * Enters practice — the sequence over a live camera mirror. Austen
   * (2026-08-05): "practice should be used by the ghost and the camera should be
   * opened and I think that's part of the effect." Gated on the camera
   * permission ALREADY being granted, because the browser's permission prompt is
   * native chrome: the ghost cannot press it, cannot dismiss it, and
   * elementFromPoint cannot see it.
   */
  | "practice"
  /** The camera-mirror toggle inside the practice bar (defaults to off). */
  | "mirror"
  /** Leaves practice. Bounded on purpose — the camera does not stay on all night. */
  | "practice-stop"
  /**
   * Hands an immersive module its own autopilot. The presenter can only press
   * DOM, so it cannot steer a 3D character — before the museum had a docent
   * button the ghost walked in, said "I haven't looked at Museum yet", and stood
   * still in the one room it could not explore.
   */
  | "docent"
  // playback
  | "play"
  | "stage"
  | "tempo"
  /**
   * Transport: step forward/back, half-step, restart. Scrubbing by hand is how
   * a person inspects a moment they could not catch at speed, and it is the
   * clearest way to show that a sequence is made of discrete steps.
   */
  | "step-nav"
  /**
   * A way of LOOKING at the sequence that changes nothing about it — grid
   * overlay, motion visibility, comparison mode, the 2D/3D switcher, maximize.
   *
   * Separate from `curio` because these are reversible view state rather than
   * a destination: pressing one twice returns the screen to where it was, so
   * the ghost can explore them freely without stranding itself.
   */
  | "view-toggle"
  // dress-up
  | "effect"
  /** A parameter chip inside an effect's customize panel — the dial. */
  | "effect-param"
  | "prop"
  /** Opens the prop drawer that `prop` lives in. */
  | "prop-picker"
  // explore
  | "nav-module"
  | "nav-tab"
  | "viewer"
  | "gallery-item"
  /**
   * A filter chip in the browse library — level, length, favourites, LOOP type.
   * Opens a popover of `filter-option`s (or, for favourites, toggles outright).
   */
  | "browse-filter"
  /**
   * One choice inside an open filter popover. Selecting it applies the filter
   * AND closes the popover, so open -> choose -> closed is a complete round
   * trip and the ghost can never be left holding an open overlay.
   */
  | "filter-option"
  /** Jump to a section of the library — a level band, a month. */
  | "browse-section"
  | "curio";

/**
 * Kinds supplied by something other than a TKA annotation, so the coverage test
 * cannot look for them in `src/`. Both come from @austencloud/sidebar's own
 * markup (see NAV_MODULE_SEL / NAV_TAB_SEL below).
 */
export const EXTERNALLY_PROVIDED_KINDS: readonly GhostKind[] = [
  "nav-module",
  "nav-tab",
];

/**
 * What the presenter is deliberately NOT given, and why (2026-08-06).
 *
 * The ghost runs unattended for hours on a laptop in a park, so the line is not
 * "could a user press this" — a user can press all of it — but "is this safe
 * for something with no judgement to press a hundred times while nobody is
 * watching". Everything below stays unannotated ON PURPOSE. Adding an
 * annotation to one of these is a decision to be argued, not an oversight to be
 * fixed:
 *
 *   Writes data      Save / Save to library / Save scene, Favorite, Fork,
 *                    Remix. A jam would end with a library full of a robot's
 *                    half-finished sequences.
 *   Destroys data    Delete sequence, Delete video.
 *   Produces files   Download image / Download Card, video and card export,
 *                    Copy to clipboard. Hundreds of files, and a hijacked
 *                    clipboard on a machine someone else is about to use.
 *   Leaves the app   Share externally (an OS share sheet is not DOM — the
 *                    ghost can neither see nor dismiss it, so the tour dead
 *                    stops), Open TKA, Explore TKA.
 *   Costs money      Uploads, and anything that writes to storage.
 *
 * `clear` is the deliberate exception among destructive controls: it is scoped
 * to the ghost's OWN unsaved work, which is the whole point of a demo that
 * starts over.
 */

/** A pressable element of this kind, visible to the allowlist. */
export const safe = (kind: GhostKind): string =>
  `[data-ghost="safe"][data-ghost-kind="${kind}"]`;

/** A readable element of this kind (not necessarily pressable). */
export const readable = (kind: GhostKind): string =>
  `[data-ghost-kind="${kind}"]`;

/** Something the ghost is invited to just sit and watch. */
export const LINGER_SEL = "[data-ghost-linger]";

/** State the DOM could not otherwise answer, published by the component. */
export const stateSel = (state: string): string =>
  `[data-ghost-state~="${state}"]`;

/** The simplified sequence word, published by whichever surface owns it. */
export const WORD_SEL = "[data-ghost-word]";

/** Sidebar module buttons already carry this from @austencloud/sidebar. */
export const NAV_SIDEBAR_SEL = ".ghost-hover-boundary";
export const NAV_MODULE_SEL = ".module-button[data-tour-module]";
export const NAV_MODULE_ID_ATTR = "data-tour-module";
export const NAV_MODULE_LABEL_SEL = ".module-label";
export const NAV_TAB_SEL = ".section-button";
export const NAV_TAB_LABEL_SEL = ".section-label";

/**
 * Layer 2 of safety: routes the ghost hard-refuses to enter regardless of any
 * annotation it finds. Checked against the module id AND the pathname.
 */
export const DENIED_MODULES: readonly string[] = [
  "admin",
  "settings",
  "feedback",
  "shop",
  "premium",
];

export const DENIED_PATH_FRAGMENTS: readonly string[] = [
  "/admin",
  "/settings",
  "/feedback",
  "/shop",
  "/premium",
  "/checkout",
  "/profile",
];

export function isDeniedModule(moduleId: string | null | undefined): boolean {
  return !!moduleId && DENIED_MODULES.includes(moduleId);
}

export function isDeniedPath(pathname: string): boolean {
  return DENIED_PATH_FRAGMENTS.some(
    (fragment) => pathname === fragment || pathname.startsWith(`${fragment}/`)
  );
}
