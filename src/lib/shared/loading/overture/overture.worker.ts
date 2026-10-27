/**
 * The boot worker: traces the Overture mandala on an OffscreenCanvas while
 * the page's main thread is busy booting the app.
 *
 * Its progress is a steady pace (overture-pace.ts) aimed at how long this
 * machine's boots usually take, nudged by the milestones the inline boot
 * script relays, on the page's clock (a worker's performance.now() starts at
 * the worker's own creation). It owns the canvas, the frame loop, the TKA
 * font and the finish choreography, and can never hold or delay the boot:
 * the page lets the screen go on its own schedule and this only draws. At
 * the finish it reports the boot's length so the next boot's pace learns it.
 *
 * On a weak device it draws the low tier (overture-budget.ts), and it fetches
 * the pool and the font at low priority and late, so the boot is ready no
 * later than without it.
 *
 * Kept small on purpose (≤ 30 KB gzipped, see overture-worker-size.test.ts):
 * the pace, the trace math and this glue. No calculator, no runes, no
 * `$app/*`.
 *
 * Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
 */
import type { SelfTimingProfile } from "../self-timing-bar";
import {
  backingRatio,
  chooseScene,
  createTierWatch,
  deviceTier,
  fontDue,
  frameDue,
  lowPriority,
  lowTierState,
  type OvertureTier,
  type OvertureTierSetting,
} from "./overture-budget";
import {
  addBootSample,
  createOverturePacer,
  expectedBootMs,
  medianBootMs,
  type OverturePacer,
} from "./overture-pace";
import {
  composeFrame,
  createFrameState,
  isOvertureScene,
  overtureLayout,
  prepareScene,
  type FrameState,
  type OvertureContext,
  type OvertureScene,
  type OvertureSurface,
  type PreparedScene,
} from "./overture-trace";

export interface OvertureInit {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  surface: OvertureSurface;
  reduced: boolean;
  profile: SelfTimingProfile | null;
  /** Milestones that arrived before the worker was made, ms on the page's clock. */
  milestones: { name: string; t: number }[];
  /** The page's performance.timeOrigin, moved to when the boot started (the lab's fake boot starts late). */
  origin: number;
  /** The raw `tka-overture` snapshot, or null. */
  snapshot: string | null;
  pool: string;
  font: string;
  /** The `tka-overture-boots` counter, rotating the pool. */
  boots: number;
  flyScale: number;
  /** The raw `tka-overture-pace` boot lengths, or null. */
  pace: string | null;
  /** The page started hidden: this boot's length says nothing about the machine. */
  hidden: boolean;
  /** The lab forces a tier; the boot leaves it to the device (auto). */
  tier?: OvertureTierSetting;
}

export type OvertureMessage =
  | OvertureInit
  | { type: "milestone"; name: string; at: number }
  | { type: "finish"; at: number }
  | { type: "hidden" }
  | { type: "visible" }
  | { type: "resize"; width: number; height: number; dpr: number };

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<OvertureMessage>) => void) | null;
  requestAnimationFrame?: (callback: () => void) => number;
  fonts?: { add(face: unknown): void };
  performance: Performance;
  navigator?: { hardwareConcurrency?: number; deviceMemory?: number };
}

const scope = self as unknown as WorkerScope;
const FONT_FAMILY = "TKA Overture";
const FLY_MS = 420;
/** The boot's safety net dismisses at 15 s; a boot that long measured nothing. */
const MAX_SAMPLE_MS = 14500;
const STILL_FADE_MS = 400;

let init: OvertureInit | null = null;
let ctx: OvertureContext | null = null;
let pacer: OverturePacer | null = null;
let prepared: PreparedScene | null = null;
let state: FrameState | null = null;
let fontFamily: string | null = null;
let offset = 0; // worker clock → page clock
let traced = 0;
let finishAt: number | null = null;
let finishFrom = 0;
let finishMs = 0;
let wasHidden = false;
let firstAt: number | null = null;
let paused = false;
let stopped = false;
let scheduled = false;
let slowFrames = 0;
let announced = false;
let tier: OvertureTier = "full";
let tierWatch = createTierWatch("auto");
let pixelRatio = 1; // the page's devicePixelRatio, before the tier's cap
let lastDrawn: number | null = null;
let fontRequested = false;
let drawn = 0; // frames drawn while tracing, for the fps report
let drawMs = 0; // their total drawing time, for the report
const trail: number[] = []; // [ms, traced × 1000] every 250 ms, for the report

/** Now on the page's clock. */
function clock(): number {
  return scope.performance.now() + offset;
}

/** The stored boot lengths; anything unreadable counts as none. */
function paceSamples(raw: string | null): unknown {
  try {
    const stored = raw
      ? (JSON.parse(raw) as { v?: number; ms?: unknown })
      : null;
    return stored && stored.v === 1 ? stored.ms : null;
  } catch {
    return null;
  }
}

function dayOfYear(): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
}

function loadScene(config: OvertureInit): Promise<OvertureScene | null> {
  return chooseScene({
    snapshot: config.snapshot,
    pool: config.pool,
    rotation: dayOfYear() + Math.max(0, config.boots | 0),
    valid: isOvertureScene,
    fetch: (url, options) => fetch(url, options),
  });
}

async function loadFont(url: string): Promise<void> {
  if (fontRequested) return;
  fontRequested = true;
  const FontFaceCtor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (!scope.fonts || !FontFaceCtor) return;
  const abort =
    typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => abort?.abort(), 1500);
  try {
    const response = await fetch(url, lowPriority(abort?.signal));
    if (!response.ok) return;
    const face = new FontFaceCtor(FONT_FAMILY, await response.arrayBuffer());
    await face.load();
    scope.fonts.add(face);
    fontFamily = `"${FONT_FAMILY}"`;
  } catch {
    /* No font: the mandala stands alone. */
  } finally {
    clearTimeout(timer);
  }
}

function resize(width: number, height: number, dpr: number): void {
  if (!init) return;
  init.width = width;
  init.height = height;
  pixelRatio = dpr || 1;
  init.dpr = backingRatio(
    tier,
    pixelRatio,
    overtureLayout(width, height).size
  );
  init.canvas.width = Math.max(1, Math.round(width * init.dpr));
  init.canvas.height = Math.max(1, Math.round(height * init.dpr));
}

function schedule(): void {
  if (scheduled || stopped || paused) return;
  scheduled = true;
  if (typeof scope.requestAnimationFrame === "function") {
    scope.requestAnimationFrame(frame);
  } else {
    setTimeout(frame, 16);
  }
}

/** Drop to the low tier: smaller backing, 30 fps, no glow, half the sparks. */
function goLow(): void {
  if (tier === "low" || !init) return;
  tier = "low";
  if (state) lowTierState(state);
  resize(init.width, init.height, pixelRatio);
}

function stop(): void {
  stopped = true;
  if (ctx && init) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, init.canvas.width, init.canvas.height);
  }
}

function frame(): void {
  scheduled = false;
  if (stopped || paused || !init || !ctx || !prepared || !state) return;
  const now = clock();
  if (!frameDue(tier, now, lastDrawn)) {
    schedule();
    return;
  }
  lastDrawn = now;
  const started = scope.performance.now();
  if (firstAt === null) firstAt = now;
  const layout = overtureLayout(init.width, init.height);
  const view = {
    width: init.width,
    height: init.height,
    dpr: init.dpr,
    surface: init.surface,
    layout,
    alpha: 1,
    zoom: 1,
    rotation: 0,
    flare: 0,
    sparks: true,
    fontFamily,
    lettersStill: false,
  };
  let p: number;
  let done = false;

  if (init.reduced) {
    // The finished mandala, faded in once, no motion.
    p = 1;
    const fade = Math.min(1, (now - firstAt) / STILL_FADE_MS);
    view.alpha = 0.6 * fade;
    view.sparks = false;
    view.lettersStill = true;
    done = fade >= 1;
  } else if (finishAt !== null) {
    const t = now - finishAt;
    // The rest at about the speed the trace was already running.
    p = finishFrom + (1 - finishFrom) * Math.min(1, t / finishMs);
    view.flare =
      t < finishMs ? t / finishMs : Math.max(0, 1 - (t - finishMs) / 200);
    const f = Math.min(1, t / FLY_MS);
    const ease = f * f * f;
    view.zoom = 1 + (init.flyScale - 1) * ease;
    view.alpha = 1 - f * f;
    view.rotation = 0.35;
    view.sparks = false;
    if (t >= FLY_MS) {
      stop();
      scope.postMessage({ type: "done" });
      return;
    }
  } else {
    traced = pacer ? pacer.at(now) : traced;
    p = traced;
    drawn++;
    if (trail.length === 0 || now - trail[trail.length - 2]! >= 250)
      trail.push(Math.round(now), Math.round(traced * 1000));
    // The font, once its first letter is about to light.
    if (!fontRequested && fontDue(traced, prepared.scene.beats, false))
      void loadFont(init.font);
    view.zoom = 1 + 0.018 * Math.sin(now / 900);
    view.rotation = p * p * 0.35;
  }

  composeFrame(ctx, prepared, p, now, view, state);
  if (!announced) {
    announced = true;
    scope.postMessage({ type: "drawing", at: now });
  }

  const spent = scope.performance.now() - started;
  drawMs += spent;
  // Slow first frames on auto: this device draws the low tier.
  if (tierWatch.frame(spent)) goLow();
  // Over budget three frames running: halve the sparks, then drop the glow.
  if (spent > 12) {
    if (++slowFrames >= 3) {
      slowFrames = 0;
      if (state.maxSparks >= 12)
        state.maxSparks = Math.floor(state.maxSparks / 2);
      else state.glow = false;
    }
  } else {
    slowFrames = 0;
  }

  if (done) return; // reduced motion: drawn once, nothing moves
  schedule();
}

async function start(config: OvertureInit): Promise<void> {
  init = config;
  offset = scope.performance.timeOrigin - config.origin;
  tier = deviceTier(config.tier, {
    cores: scope.navigator?.hardwareConcurrency,
    memoryGb: scope.navigator?.deviceMemory,
  });
  tierWatch = createTierWatch(config.tier);
  resize(config.width, config.height, config.dpr);
  ctx = config.canvas.getContext("2d") as unknown as OvertureContext | null;
  if (!ctx) {
    scope.postMessage({ type: "unavailable" });
    return;
  }
  wasHidden = config.hidden;
  pacer = createOverturePacer({
    start: clock(),
    expected: expectedBootMs(
      medianBootMs(paceSamples(config.pace)),
      config.profile
    ),
    profile: config.profile,
  });
  for (const entry of config.milestones) pacer.milestone(entry.name, entry.t);
  // Reduced motion draws the letters at once, so it waits for the font;
  // the trace asks for it when its first letter is near.
  const [scene] = await Promise.all([
    loadScene(config),
    config.reduced ? loadFont(config.font) : null,
  ]);
  if (!scene || stopped) {
    if (!scene) scope.postMessage({ type: "unavailable" });
    return;
  }
  prepared = prepareScene(scene, config.surface);
  state = createFrameState({
    phone: overtureLayout(config.width, config.height).phone,
  });
  if (tier === "low") lowTierState(state);
  schedule();
}

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      if (!init) void start(message);
      break;
    case "milestone":
      pacer?.milestone(message.name, message.at);
      break;
    case "finish":
      if (finishAt === null) {
        finishAt = message.at;
        finishFrom = traced;
        finishMs = pacer ? pacer.finishMs(traced) : 120;
        if (firstAt !== null && message.at > firstAt) {
          // What this device drew, for the boot's diagnostics.
          scope.postMessage({
            type: "stats",
            tier,
            fps: Math.round((drawn * 1000) / (message.at - firstAt)),
            drawMs: drawn ? +(drawMs / drawn).toFixed(2) : null,
            trail,
          });
        }
        if (init && !wasHidden && message.at < MAX_SAMPLE_MS) {
          // The page stores it; the next boot paces by the median.
          scope.postMessage({
            type: "pace",
            value: JSON.stringify({
              v: 1,
              ms: addBootSample(paceSamples(init.pace), message.at),
            }),
          });
        }
        if (init?.reduced) {
          // Reduced motion: no flight; the screen leaves without a fade.
          stop();
          scope.postMessage({ type: "done" });
        }
      }
      break;
    case "hidden":
      paused = true;
      wasHidden = true;
      break;
    case "visible":
      paused = false;
      schedule();
      break;
    case "resize":
      resize(message.width, message.height, message.dpr);
      if (init?.reduced && !stopped) schedule();
      break;
  }
};
