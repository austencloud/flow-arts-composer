/**
 * Attract Ghost — the shared motor + lifecycle layer for the composer-wings
 * attract acts (spec: docs/superpowers/specs/2026-07-19-construct-attract-demo-design.md,
 * §Generate wing).
 *
 * Extracted from construct-attract-act.svelte.ts when the Generate wing needed
 * the same ghost: everything section-AGNOSTIC lives here — the human motor
 * model (rAF-driven curved glides, distance-scaled durations, off-center
 * landings), the press gate (elementFromPoint fingertip hit-test — the ghost
 * can never click what it isn't visibly touching), hover mirroring, jittered
 * dwells with micro-drift, browse-before-pick, the hidden-tab-proof frame
 * loop, and the pause/park/resume lifecycle (takeover glides the ghost to the
 * band's corner where it becomes the clickable "watch it again" button).
 *
 * A section's act is a thin SCRIPT on top: its selectors + a cycle() of
 * personality beats, passed to start(). See construct-attract-act.svelte.ts
 * and generate-attract-act.svelte.ts.
 */

import { transitionGhostHover } from "./ghost-hover";

export interface GhostState {
  x: number;
  y: number;
  pressed: boolean;
  visible: boolean;
  /** Takeover pose: parked in a corner as the clickable "watch again" button. */
  parked: boolean;
  /**
   * How fast the ghost is travelling right now, normalised 0..1 against a brisk
   * glide. The body renders a trailing wisp from this: at fifteen feet a bare
   * dot jumping between positions reads as a rendering glitch, and a tail that
   * grows with speed reads as a thing that MOVED. Purely cosmetic — nothing in
   * the motor or the mind branches on it.
   */
  speed: number;
  /** Direction of travel in radians, for the same trail. Stale when speed is 0. */
  heading: number;
  /**
   * The ghost has deliberately stepped back to let the app be looked at (see
   * `savor`). The body shrinks and dims; the caption clears. Distinct from
   * `parked`, which means the VISITOR has the wheel.
   */
  dimmed: boolean;
  /**
   * On target, not yet committed — the beat where a person's hand arrives and
   * hovers before they actually press. The body leans in slightly. This is the
   * single largest "it's alive" tell and it costs one boolean.
   */
  considering: boolean;
}

/** The lifecycle surface a section wires to (GhostPointer + takeover). */
export interface AttractActHandle {
  ghost: GhostState;
  /** Begin the attract loop (idempotent; no-op after kill). */
  start: () => void;
  /** Viewport gate — the loop idles between actions while not visible. */
  setVisible: (visible: boolean) => void;
  /** Takeover: abort the current beat and park the ghost as a resume button. */
  pause: () => void;
  /** Un-park: the parked ghost was clicked — demonstrate again. */
  resume: () => void;
  /** Unmount-only stop. Ghost fades out via `visible`. */
  kill: () => void;
  /** True once kill() has run. */
  readonly dead: boolean;
  /** True while paused/parked (visitor has the wheel). */
  readonly paused: boolean;
}

/** The motor + personality primitives an act script composes its cycle from. */
export interface AttractGhost extends AttractActHandle {
  /** Abort predicate for everything inside a cycle. */
  halted: () => boolean;
  /** Sleep that dies fast on abort and idles (without advancing) offscreen. */
  sleep: (ms: number, abort?: () => boolean) => Promise<void>;
  /** Dwell with occasional micro-drift — a resting hand isn't frozen. */
  dwell: (ms: number) => Promise<void>;
  /** Glide to a band-relative point (bowed path, eased, distance-scaled). */
  glideTo: (tx: number, ty: number) => Promise<void>;
  /** Glide onto an element and hover it for a beat (no press). */
  hoverOn: (el: HTMLElement, dwellMs: number) => Promise<void>;
  /** Hover, commit, press — gated on the fingertip hit-test. `action` replaces
   *  el.click() when the target's real interaction is pointer-based. */
  moveAndPress: (el: HTMLElement, action?: () => void) => Promise<void>;
  /** Hover 0–2 alternatives, then press the chosen one. */
  browseAndPick: (cands: HTMLElement[]) => Promise<void>;
  /**
   * The same browse-before-deciding beat, but for a target the caller ALREADY
   * chose — so an intention can name the thing it is about to press and still
   * look like it considered the alternatives.
   */
  browseThenPress: (
    chosen: HTMLElement,
    alternatives?: HTMLElement[]
  ) => Promise<void>;
  /** Rest just inside an element's bottom-right corner, hover cleared. */
  restBeside: (el: HTMLElement) => Promise<void>;
  /**
   * Step aside, shrink and dim for `ms` so the app can be looked at without a
   * ghost on top of it. Only for beats with a real payoff — see the note on the
   * implementation about the bug this would otherwise recreate.
   */
  savor: (ms: number) => Promise<void>;
  /** Mark/unmark the element the ghost is "hovering" (.ghost-hover mirror). */
  setHover: (el: HTMLElement | null) => void;
  /** Poll the live DOM for visible, actually-hittable targets. */
  waitFor: (selector: string, timeoutMs?: number) => Promise<HTMLElement[]>;
  pick: <T>(arr: T[]) => T;
  jitter: (base: number, spread: number) => number;
}

export function createAttractGhost(opts: {
  /** The demo band — coordinate space for the ghost AND the query root. */
  getRoot: () => HTMLElement | null;
  /**
   * Source of randomness for CHOICES — which candidate gets pressed, how many
   * alternatives get browsed first. Cosmetic noise (glide bow, dwell jitter,
   * landing offset) deliberately stays on Math.random; it does not change what
   * happens, only how it looks.
   *
   * The presenter passes its seeded rng so `?present=<seed>` replays the same
   * tour rather than the same list of intention IDs with different cards
   * clicked — the sequence a run builds is a decision, and a divergent sequence
   * diverges every score after it. The composer attract acts omit it.
   */
  choose?: () => number;
  /**
   * Which corner of the band the ghost parks in on takeover. Bottom-right unless
   * a surface keeps real controls there: the parked dot is a button of its own
   * and sits above everything in the band, so it would cover them.
   */
  parkCorner?: "bottom-right" | "top-right";
}): {
  core: AttractGhost;
  /** Wrap a cycle script into the running loop; returns the section handle. */
  run: (cycle: () => Promise<void>) => AttractActHandle;
} {
  const PRESS_MS = 140;

  const ghost = $state<GhostState>({
    x: 0,
    y: 0,
    pressed: false,
    visible: false,
    parked: false,
    speed: 0,
    heading: 0,
    dimmed: false,
    considering: false,
  });

  let dead = false;
  let stopped = false; // takeover: cycle unwinds, ghost parks until resume
  let running = false;
  let inViewport = false;
  let parkedWake: (() => void) | null = null;
  let resumeInFlight = false;

  const halted = () => dead || stopped;

  const raw = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  // rAF with a timeout fallback: in a hidden tab requestAnimationFrame never
  // fires, which would freeze a glide mid-flight FOREVER (the visitor tabs
  // away, comes back to a dead ghost). The timeout keeps time advancing —
  // hidden-tab timers are throttled to ~1s, so a glide just completes
  // coarsely while nobody is looking.
  const frame = () =>
    new Promise<void>((r) => {
      const id = requestAnimationFrame(() => {
        clearTimeout(t);
        r();
      });
      const t = setTimeout(() => {
        cancelAnimationFrame(id);
        r();
      }, 64);
    });

  async function sleep(
    ms: number,
    abort: () => boolean = halted
  ): Promise<void> {
    const end = performance.now() + ms;
    while (!abort() && performance.now() < end) {
      await raw(Math.min(120, Math.max(16, end - performance.now())));
    }
    while (!abort() && !inViewport) await raw(200);
  }

  const choose = opts.choose ?? Math.random;
  const pick = <T>(arr: T[]): T => arr[Math.floor(choose() * arr.length)]!;
  const jitter = (base: number, spread: number) =>
    base + Math.random() * spread;

  // The element the ghost is currently "hovering". Since a fake pointer can't
  // trigger CSS :hover, the act marks its target with a .ghost-hover class and
  // the section mirrors the real hover styles onto it — so buttons scale, the
  // canvas shows its pause/play badge, and the ghost reads as a real hand.
  let hovered: HTMLElement | null = null;
  function setHover(el: HTMLElement | null): void {
    if (hovered === el) return;
    transitionGhostHover(hovered, el);
    hovered = el;
  }


  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  /** The speed a brisk glide reaches, in px/ms. `ghost.speed` is normalised
   *  against it so the body's trail has a stable meaning across screen sizes. */
  const FAST_PX_PER_MS = 1.4;

  /**
   * A short straight tween used for the small motions that bracket a glide —
   * anticipation and overshoot-settle. Deliberately NOT `glide` itself: those
   * are sub-20px moves where a bowed path and a distance-scaled duration would
   * both be wrong, and calling glide would recurse into its own anticipation.
   */
  async function segment(
    tx: number,
    ty: number,
    dur: number,
    abort: () => boolean
  ): Promise<void> {
    const sx = ghost.x;
    const sy = ghost.y;
    const t0 = performance.now();
    while (!abort()) {
      const t = (performance.now() - t0) / dur;
      if (t >= 1) break;
      const e = easeOutCubic(t);
      ghost.x = sx + (tx - sx) * e;
      ghost.y = sy + (ty - sy) * e;
      await frame();
      while (!abort() && !inViewport) await raw(200);
    }
    if (abort()) return;
    ghost.x = tx;
    ghost.y = ty;
  }

  /**
   * Glide the ghost to a point along a bowed quadratic-bezier path, rAF-driven,
   * with duration scaled to distance (short hops are quick, long hauls take
   * visibly longer — a straight fixed-speed tween is the #1 "that's a robot"
   * tell). Does not touch hover; callers own that. The abort param lets the
   * park glide run while `stopped` (everything else aborts on it).
   */
  async function glide(
    tx: number,
    ty: number,
    abort: () => boolean
  ): Promise<void> {
    if (abort()) return;
    if (!ghost.visible) {
      // First appearance: materialize a hand-width away from the target and
      // make a short approach, instead of sweeping in from the panel corner.
      ghost.x = tx + jitter(60, 60);
      ghost.y = ty + jitter(70, 50);
      ghost.visible = true;
      await sleep(240, abort);
      if (abort()) return;
    }
    const sx = ghost.x;
    const sy = ghost.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      ghost.x = tx;
      ghost.y = ty;
      return;
    }
    const dur = Math.min(
      Math.max((240 + dist * 0.9) * jitter(0.85, 0.3), 300),
      1300
    );

    // ANTICIPATION. Before a real journey, lean back against the direction of
    // travel for a beat. Every animator's first note and the cheapest possible
    // "something is about to happen" — it also gives a distant viewer a frame
    // of warning to follow the move, instead of the dot simply being elsewhere.
    // Short hops skip it: a hand does not wind up to move 40px.
    if (dist > 150) {
      const back = Math.min(dist * 0.05, 11);
      await segment(
        sx - (dx / dist) * back,
        sy - (dy / dist) * back,
        jitter(90, 60),
        abort
      );
      if (abort()) return;
    }

    // OVERSHOOT. Aim a hair past the mark on longer moves and settle back, so
    // arrival has weight instead of stopping dead on the pixel.
    const over = dist > 150 ? Math.min(dist * 0.035, 9) : 0;
    const ax = tx + (dx / dist) * over;
    const ay = ty + (dy / dist) * over;

    // Bow the path sideways — human reaches curve, they don't ride rails.
    const gx = ghost.x;
    const gy = ghost.y;
    const bow = dist * jitter(0.05, 0.15) * (Math.random() < 0.5 ? -1 : 1);
    const cx = gx + (ax - gx) / 2 + (-dy / dist) * bow;
    const cy = gy + (ay - gy) / 2 + (dx / dist) * bow;
    const t0 = performance.now();
    ghost.heading = Math.atan2(dy, dx);
    let px = gx;
    let py = gy;
    let pt = t0;
    while (!abort()) {
      const nowMs = performance.now();
      const t = (nowMs - t0) / dur;
      if (t >= 1) break;
      const e = easeInOutCubic(t);
      const u = 1 - e;
      ghost.x = u * u * gx + 2 * u * e * cx + e * e * ax;
      ghost.y = u * u * gy + 2 * u * e * cy + e * e * ay;
      // Measured, not modelled: the trail has to match what the eye sees, and
      // the eased bezier's real speed peaks mid-flight and dies at both ends.
      const dt = nowMs - pt;
      if (dt > 0) {
        const v = Math.hypot(ghost.x - px, ghost.y - py) / dt;
        ghost.speed = Math.min(1, v / FAST_PX_PER_MS);
      }
      px = ghost.x;
      py = ghost.y;
      pt = nowMs;
      await frame();
      while (!abort() && !inViewport) await raw(200);
    }
    if (abort()) return;
    if (over > 0) {
      ghost.speed = 0.25;
      await segment(tx, ty, jitter(130, 70), abort);
    }
    ghost.speed = 0;
    if (abort()) return;
    ghost.x = tx;
    ghost.y = ty;
  }

  const glideTo = (tx: number, ty: number) => glide(tx, ty, halted);

  /** A point inside an element, deliberately off exact center — landing on
   *  the mathematical centroid every time is another robot tell. Returns null
   *  if the point falls outside the band: embla-style clipped content stays in
   *  flow, so an offscreen target still has a rect — following it would walk
   *  the ghost clean off the component. */
  function aimAt(el: HTMLElement): { x: number; y: number } | null {
    const root = opts.getRoot();
    if (!root) return null;
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const ox = (Math.random() - 0.5) * Math.min(r.width * 0.35, 56);
    const oy = (Math.random() - 0.5) * Math.min(r.height * 0.35, 36);
    const x = r.left + r.width / 2 - rr.left + ox;
    const y = r.top + r.height / 2 - rr.top + oy;
    if (x < 0 || y < 0 || x > rr.width || y > rr.height) return null;
    return { x, y };
  }

  /** True only if the ghost's fingertip is REALLY over `el` right now — the
   *  press gate. elementFromPoint sees clipping, overlays and stacking the
   *  way a mouse does; a bare rect check does not (the off-component-click
   *  bug: a clipped embla card's rect said "on target" while the visible
   *  pixel there belonged to something else entirely). The ghost dot itself
   *  is pointer-events: none, so it never occludes the probe. */
  function fingertipOn(el: HTMLElement): boolean {
    const root = opts.getRoot();
    if (!root) return false;
    const rr = root.getBoundingClientRect();
    const probe = document.elementFromPoint(
      ghost.x + rr.left,
      ghost.y + rr.top
    );
    return !!probe && (probe === el || el.contains(probe));
  }

  /** Dwell with occasional micro-drift — a resting hand isn't frozen. Keeps
   *  whatever hover is active (the drift stays within a few px). */
  async function dwell(ms: number): Promise<void> {
    if (ms < 700 || Math.random() < 0.3) return sleep(ms);
    await sleep(ms * 0.4);
    if (halted()) return;
    const ang = Math.random() * Math.PI * 2;
    const r = jitter(3, 7);
    await glideTo(ghost.x + Math.cos(ang) * r, ghost.y + Math.sin(ang) * r);
    await sleep(ms * 0.6);
  }

  /** Glide onto an element and hover it for a beat (no press). */
  async function hoverOn(el: HTMLElement, dwellMs: number): Promise<void> {
    const p = aimAt(el);
    if (!p || halted()) return;
    await glideTo(p.x, p.y);
    if (halted()) return;
    setHover(el);
    await dwell(dwellMs);
  }

  /** Hover, pause to commit, then press. Default: real click on a real
   *  target — programmatic click() fires no pointerdown, so the act can never
   *  trigger the section's own takeover listener. Callers pass `action` when
   *  the target's real interaction is pointer-based (the tap-to-toggle
   *  canvas) and click() wouldn't land. */
  async function moveAndPress(
    el: HTMLElement,
    action?: () => void
  ): Promise<void> {
    await hoverOn(el, jitter(240, 420));
    if (halted()) return;
    // Press gate: the glide takes up to ~1.3s and the target can move under
    // it (embla settling, grid reflow after a turns change). Re-aim like a
    // person would — but the click NEVER fires unless the fingertip actually
    // hit-tests onto the target. A stale rect can say "on target" while the
    // element sits in a clipped embla page; el.click() would still select an
    // option while the ghost visibly pressed somewhere else. No hit, no click.
    for (let attempt = 0; attempt < 2 && !fingertipOn(el); attempt++) {
      if (el.offsetParent === null) return;
      const p = aimAt(el);
      if (!p || halted()) return;
      await glideTo(p.x, p.y);
      if (halted()) return;
      setHover(el);
      // Let a mid-settle target come to rest before the re-probe.
      await sleep(120);
      if (halted()) return;
    }
    if (!fingertipOn(el)) return;

    // HESITATION. The beat between arriving and committing — a person's hand
    // lands, settles, and only then presses. Without it the ghost arrives and
    // fires in the same instant, which is the single clearest "this is a script
    // running" tell left in the motor. The body leans in while this is true.
    ghost.considering = true;
    await sleep(jitter(160, 220));
    ghost.considering = false;
    if (halted()) return;
    // The target can still die during the hesitation; re-check rather than
    // press into a hole.
    if (!fingertipOn(el)) return;

    ghost.pressed = true;
    await sleep(PRESS_MS);
    ghost.pressed = false;
    if (halted()) return;
    if (action) action();
    else el.click();
    // RECOIL. Hold still long enough for the body's release rebound to play
    // (the dot's scale transition overshoots on the way back out). Gliding away
    // in the same frame the click lands cuts it off, and a press that snaps
    // flat back to rest reads as a state change rather than contact.
    await sleep(120);
  }

  /** Browse before deciding: hover 0–2 alternatives, then press the chosen
   *  one — the "which one do I want" moment a straight pick never has. */
  async function browseAndPick(cands: HTMLElement[]): Promise<void> {
    const pool = [...cands];
    const chosen = pool.splice(Math.floor(choose() * pool.length), 1)[0]!;
    await browseThenPress(chosen, pool);
  }

  /** Browse a couple of alternatives, then press the target the caller named. */
  async function browseThenPress(
    chosen: HTMLElement,
    alternatives: HTMLElement[] = []
  ): Promise<void> {
    const pool = alternatives.filter((el) => el !== chosen);
    const roll = choose();
    const looks = roll < 0.45 ? 0 : roll < 0.85 ? 1 : 2;
    for (let i = 0; i < looks && pool.length && !halted(); i++) {
      const alt = pool.splice(Math.floor(choose() * pool.length), 1)[0]!;
      await hoverOn(alt, jitter(450, 550));
    }
    if (halted()) return;
    await moveAndPress(chosen);
  }

  /**
   * Step back and let the app be looked at.
   *
   * Glides to the nearest quiet edge of the band, shrinks and dims, and waits.
   * The caller (the mind) clears the caption for the same window, so for a few
   * seconds there is a running sequence or a lit-up effect on screen and
   * nothing else — the show gets a peak instead of an unbroken stream of
   * clicking.
   *
   * This is movement-after-press, which was REMOVED in 3b912bbc97 because
   * watchKind() called restBeside() after every single press and Austen saw the
   * ghost "move out of the way after clicking" constantly. The distinction is
   * the entire point and it must stay: getting out of the way is right when
   * there is something to watch, and wrong when there is not. Only an intention
   * that explicitly declares `savor` reaches this.
   */
  async function savor(ms: number): Promise<void> {
    const root = opts.getRoot();
    if (!root || halted()) return;
    setHover(null);
    const rr = root.getBoundingClientRect();
    // A person watching something rests their cursor ON the thing they are
    // watching, not in the corner of the screen. The corner retreat read as
    // the ghost leaving (and parked it under the dev HUD, so it vanished).
    // Aim at the admired surface itself — the same data-ghost-linger element
    // the linger intention uses — sitting in its lower third so the pointer
    // shares the frame without covering the middle of the motion.
    // Several surfaces can be lingerable at once (a wall of playing
    // thumbnails); the one being admired is the biggest thing on screen.
    const watched = [...root.querySelectorAll<HTMLElement>("[data-ghost-linger]")]
      .filter((el) => {
        if (el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 80 && r.height >= 80;
      })
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      })[0];
    if (watched) {
      const r = watched.getBoundingClientRect();
      await glideTo(
        r.left - rr.left + r.width * (0.5 + (choose() - 0.5) * 0.4),
        r.top - rr.top + r.height * (0.68 + (choose() - 0.5) * 0.2)
      );
    }
    // No watchable surface found: stay where the hand already is. Standing
    // still while something plays is human; marching to a corner is not.
    if (halted()) return;
    ghost.dimmed = true;
    await dwell(ms);
    ghost.dimmed = false;
  }

  /** Park the ghost just inside an element's bottom-right corner (jittered) —
   *  the "hand at rest, watching" pose between actions. */
  async function restBeside(el: HTMLElement): Promise<void> {
    const root = opts.getRoot();
    if (!root || halted()) return;
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    setHover(null);
    await glideTo(
      r.right - rr.left - jitter(22, 20),
      r.bottom - rr.top - jitter(22, 20)
    );
  }

  /** Poll the live DOM for visible targets (pickers load async). Candidates
   *  are hit-tested at their center — clipped-but-in-flow content (embla
   *  pages) would otherwise let the ghost "press" a target sitting under
   *  something else and the click would land on empty air. */
  async function waitFor(
    selector: string,
    timeoutMs = 8000
  ): Promise<HTMLElement[]> {
    const t0 = performance.now();
    while (!halted()) {
      const root = opts.getRoot();
      if (root) {
        const els = [...root.querySelectorAll<HTMLElement>(selector)].filter(
          (el) => {
            if (el.offsetParent === null) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return false;
            const probe = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2
            );
            return !!probe && (el.contains(probe) || probe.contains(el));
          }
        );
        if (els.length) return els;
      }
      if (performance.now() - t0 > timeoutMs) return [];
      await raw(150);
      while (!halted() && !inViewport) await raw(200);
    }
    return [];
  }

  /** Takeover pose: glide to the band's parking corner and sit there as the
   *  clickable "watch it again" button until resume() or kill(). The glide
   *  ignores `stopped` (it IS the stopped pose) but respects kill. */
  async function parkAndWait(): Promise<void> {
    setHover(null);
    ghost.pressed = false;
    // The visitor has the wheel: drop every in-flight expression, or the parked
    // dot inherits whatever pose the aborted beat left behind (dimmed mid-savor,
    // leaning in mid-hesitation) and reads as broken rather than waiting.
    ghost.considering = false;
    ghost.dimmed = false;
    ghost.speed = 0;
    const root = opts.getRoot();
    if (root) {
      const rr = root.getBoundingClientRect();
      const parkY = opts.parkCorner === "top-right" ? 32 : rr.height - 32;
      await glide(rr.width - 32, parkY, () => dead);
    }
    ghost.visible = true;
    ghost.parked = true;
    if (!dead && stopped) {
      await new Promise<void>((resolve) => {
        parkedWake = resolve;
        if (!stopped || dead) {
          parkedWake = null;
          resolve();
        }
      });
    }
    ghost.parked = false;
    if (resumeInFlight) {
      // Let Svelte remove the focused resume button before takeover is armed
      // again. Its focus handoff belongs to the resume gesture, not the user.
      await Promise.resolve();
      resumeInFlight = false;
    }
  }

  function wakeParkedLoop(): void {
    const wake = parkedWake;
    parkedWake = null;
    wake?.();
  }

  const handle: AttractActHandle = {
    ghost,
    start: () => {}, // replaced by run() — an act without a cycle can't start
    setVisible: (visible: boolean) => {
      inViewport = visible;
    },
    pause: () => {
      if (resumeInFlight) return;
      stopped = true;
    },
    resume: () => {
      if (dead || !stopped || resumeInFlight) return;
      resumeInFlight = true;
      // Finish the button's pointer/click/focus activation while the act is
      // still paused. A trailing focusin can then never re-park the ghost.
      queueMicrotask(() => {
        if (dead) {
          resumeInFlight = false;
          return;
        }
        const unparkWillSettle = ghost.parked;
        stopped = false;
        wakeParkedLoop();
        if (!unparkWillSettle) resumeInFlight = false;
      });
    },
    kill: () => {
      dead = true;
      resumeInFlight = false;
      wakeParkedLoop();
      setHover(null);
      ghost.visible = false;
      ghost.considering = false;
      ghost.dimmed = false;
      ghost.speed = 0;
    },
    get dead() {
      return dead;
    },
    get paused() {
      return stopped;
    },
  };

  const core: AttractGhost = {
    ...handle,
    // Spread drops the getters (they evaluate once) — restore them.
    get dead() {
      return dead;
    },
    get paused() {
      return stopped;
    },
    halted,
    sleep,
    dwell,
    glideTo,
    hoverOn,
    moveAndPress,
    browseAndPick,
    browseThenPress,
    restBeside,
    savor,
    setHover,
    waitFor,
    pick,
    jitter,
  };

  function run(cycle: () => Promise<void>): AttractActHandle {
    const start = () => {
      if (running || dead) return;
      running = true;
      void (async () => {
        while (!dead) {
          if (stopped) {
            await parkAndWait();
            continue;
          }
          // A transient DOM race must never silently kill the loop — that is
          // how a ghost "just disappears". Swallow, breathe, try again.
          try {
            await cycle();
          } catch {
            await raw(800);
          }
        }
      })();
    };
    handle.start = start;
    core.start = start;
    return handle;
  }

  return { core, run };
}
