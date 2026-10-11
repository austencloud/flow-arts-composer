/**
 * Renders an LED preset tile through the real LED renderer.
 *
 * Every other effect's thumbnail runs that effect's own domain math in 2D — the
 * Coal tile runs the spark physics, the Bloom tile runs the bloom curve. LED
 * cannot: its picture is the product of a flux budget, a per-emitter Gaussian
 * splat, a motion-streak integral, a leaky shutter, a bloom pyramid and an AgX
 * tone map, all of which live in GLSL. Porting them to canvas would be a second
 * implementation of the effect, free to drift from the first — which is exactly
 * what happened before. LED's previous bespoke tile was hand-drawn from
 * constants invented to make it look plausible, shared no code with the
 * renderer, and so went on reading as convincing LEDs for weeks while the actual
 * effect on stage was a formless blob.
 *
 * So the tile runs the renderer. `WebGLLedRenderer.initializeHeadless` puts it
 * on an OffscreenCanvas, the sweep below feeds it frames, and the composited
 * result is copied out. A tile produced this way cannot be wrong about its own
 * effect: if the look changes, the tile changes with it, because it is the same
 * code.
 *
 * The only synthetic part is geometry, and it has to be — a tile has no
 * sequence. Colors come from the same `materializeGeneratorPattern` +
 * `patternFrameIndex` path `led-sampler.ts` uses on stage, so what each LED is
 * showing at a given instant is shared exactly.
 */

import { WebGLLedRenderer } from "./web-gl-led-renderer";
import { materializeGeneratorPattern } from "./led-pattern-materializer";
import { patternFrameIndex } from "../led-sampler";
import { getPixel } from "#lib/shared/poi/domain/strip-pattern.js";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type {
  LedSample,
  LedSimulatorConfig,
} from "../../domain/types/led-types";
import { shutterCutoffSeconds } from "../../domain/led-photometry";

/** Viewbox width the renderer's coordinates are expressed in, as on stage. */
const VIEW_W = 950;

/**
 * Two props, each spinning about its own center while that center drifts
 * sideways — a spinning staff carried along a hand path, which is what the prop
 * does on stage, and which coils the spin into a ribbon instead of a disc.
 *
 * The spin is timed off the LOOK, not fixed, and that is the trick the tile
 * turns on. A staff spun about its center sweeps a solid disc, so how the tile
 * reads comes down to how many times the strip repaints that disc inside the
 * window the shutter can still see. Fixed spins were tried twice and failed the
 * same way: at 1.2s and again at 0.9s, Rainbow POV's 2.5s exposure laid its
 * disc down two and three times over, every hue fell on every other hue, and
 * the one preset whose entire point is a visible spectrum clipped to a white
 * blob. Two revolutions per visible window, with the drift separating them,
 * fixes it structurally rather than by quietly dimming the preset.
 *
 * The drift is a straight line, not an orbit. An ellipse was tried and left the
 * props wherever their phase happened to land — one high right, one low left,
 * a different composition per preset because each look has its own window. A
 * line centred on the station is the same picture every time.
 */
const STATION_X = [0.25, 0.75];
/**
 * Revolutions per visible window, by how much of the prop is lit.
 *
 * A capsule lights two tips, so its trace is two thin curves and it needs
 * several revolutions before there is a picture. A pixel staff running its full
 * length lights the whole shaft, so half a revolution already paints the entire
 * swept disc — every revolution after that is a second coat on a finished wall,
 * and on a long exposure a second coat is what takes the color out. Rainbow POV
 * at 2.6 revolutions was a pastel slab; the hues only survive when each part of
 * the disc is written about once.
 *
 * Which of the two a strip is depends on the pattern as much as the device, so
 * `litFraction` decides rather than the LED count alone.
 *
 * Neither count is a whole number, because at exactly 2 the shutter cut in and
 * cut out on the same staff angle — and that angle was horizontal, so a box
 * shutter ruled its hard cut-in edge straight across the middle of the frame.
 * A fraction lands the first and last frames on different diagonals, where the
 * ribbon's own curve hides them.
 */
const SPARSE_SPIN_PER_WINDOW = 2.6;
const DENSE_SPIN_PER_WINDOW = 1.3;
/** Below this many LEDs the strip is points however many of them are lit. */
const DENSE_STRIP_LEDS = 8;
/** And below this much of it alight, it is a moving point on a dark shaft. */
const DENSE_LIT_FRACTION = 0.5;
/** Channel value, of 255, at which an LED counts as on rather than as tail. */
const LIT_CHANNEL_THRESHOLD = 12;

/**
 * Mean fraction of the strip that is alight across the loop.
 *
 * Counting LEDs is not enough to know how a strip will read. Comet runs on the
 * same 200-LED staff as Rainbow POV and behaves like the opposite kind of
 * emitter: a head plus tail is about a seventh of the shaft, so what spins is a
 * bright point travelling along a dark stick, and it paints an arc where the
 * rainbow paints a disc. Asking what is actually on separates the two.
 */
function litFraction(pattern: StripPattern): number {
  let lit = 0;
  for (let f = 0; f < pattern.frameCount; f++) {
    for (let led = 0; led < pattern.ledCount; led++) {
      const c = getPixel(pattern, f, led);
      if (Math.max(c.r, c.g, c.b) >= LIT_CHANNEL_THRESHOLD) lit++;
    }
  }
  return lit / Math.max(1, pattern.frameCount * pattern.ledCount);
}

/**
 * Staff half-length as a fraction of tile HEIGHT, and the drift as a fraction
 * of tile WIDTH either side of the station.
 *
 * The drift is horizontal because the tile is a letterbox and the light has to
 * go somewhere: it reaches the outer thirds a centred disc leaves black, and
 * spreading is what keeps a long exposure off the clip point — the same flux
 * over a quarter of the area is four times the value per pixel. Its size is
 * bounded by the gap between the two stations, so the ribbons never collide.
 */
const STAFF_HALF_LENGTH_FRAME_FRACTION = 0.24;
const DRIFT_HALF_FRAME_FRACTION = 0.14;

/**
 * Pixels per viewbox unit the tile renders at, matched to the sequence viewer's
 * own stage (about a 1000px canvas over the 950-unit viewbox).
 *
 * Photometry is per pixel: emitter sigma comes from LED pitch measured in
 * pixels, so the same prop drawn into a smaller canvas puts the same flux
 * through fewer, tighter splats and reads far hotter. Rendering a 720px-wide
 * tile at its own size made Rainbow POV clip to white and show the bloom
 * pyramid's mip squares. Rendering at stage density and letting the browser
 * downscale gives the tile the stage's exposure instead of its own.
 */
const RENDER_PIXELS_PER_VIEW_UNIT = 1.06;

const DT = 1 / 60;

const SETTLE_MAX_SECONDS = 6;

/**
 * The stretch of time the shutter can still see: five time constants of eye
 * persistence, or the whole exposure of a camera. Everything the tile shows was
 * drawn inside this window, so it is what the geometry is timed against.
 */
function visibleWindow(config: LedSimulatorConfig): number {
  return shutterCutoffSeconds(config.look.shutter);
}

/**
 * How long to spin before reading the frame: two windows.
 *
 * One to charge the shutter — an eye kernel needs its five time constants and a
 * box shutter needs its staggered accumulators seeded — and one more so the
 * revolution that charge captured is a complete one. Capped so a 4s exposure
 * cannot cost twelve seconds of simulation.
 */
function settleSeconds(config: LedSimulatorConfig): number {
  return Math.min(SETTLE_MAX_SECONDS, visibleWindow(config) * 2);
}

/** One headless renderer for every tile — a WebGL context per tile would
 *  exhaust the browser's pool, and tiles render one at a time anyway. */
let shared: WebGLLedRenderer | null = null;
let sharedKey = "";
/** Serializes requests: the renderer holds accumulation state, so two
 *  overlapping sweeps would paint into each other. */
let queue: Promise<unknown> = Promise.resolve();

function acquire(width: number, height: number): WebGLLedRenderer | null {
  const key = `${width}x${height}`;
  if (shared && sharedKey === key) return shared;
  shared?.dispose();
  shared = null;
  const renderer = new WebGLLedRenderer();
  if (!renderer.initializeHeadless(width, height)) {
    renderer.dispose();
    return null;
  }
  shared = renderer;
  sharedKey = key;
  return shared;
}

function samplesAt(
  seconds: number,
  config: LedSimulatorConfig,
  pattern: StripPattern,
  viewHeight: number,
  totalSeconds: number,
  spins: number,
  out: LedSample[]
): LedSample[] {
  out.length = 0;
  const ledCount = Math.max(1, Math.round(config.device.ledCount));
  const frame = patternFrameIndex(
    seconds * 1000,
    config.cycleDuration,
    pattern.frameCount
  );
  const halfLength = viewHeight * STAFF_HALF_LENGTH_FRAME_FRACTION;
  const driftHalf = VIEW_W * DRIFT_HALF_FRAME_FRACTION;
  const stationY = viewHeight / 2;
  const window = visibleWindow(config);
  const spinAngle = ((seconds * spins) / window) * Math.PI * 2;
  // -1 at the moment the shutter starts seeing, +1 at the final frame, so the
  // ribbon the tile shows is centred on the station whatever the window is.
  const drift = (2 * (seconds - (totalSeconds - window))) / window - 1;

  for (let prop = 0; prop < STATION_X.length; prop++) {
    // Mirrored, not merely offset: opposed spin and opposed drift read as a
    // matched pair of hands rather than one stamp printed twice.
    const sign = prop === 0 ? 1 : -1;
    const angle = spinAngle * sign;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = VIEW_W * STATION_X[prop]! + drift * driftHalf * sign;
    const cy = stationY;

    for (let led = 0; led < ledCount; led++) {
      // -1 at one shaft end, +1 at the other, so LED 0 and LED N-1 land on the
      // tracked endpoints exactly as the sampler places them.
      //
      // Flipped on the mirrored prop, and that flip is what actually makes the
      // pair a reflection. Reversing the spin alone reverses the shaft's path
      // but not which end of the shaft each LED sits on, so a pattern with a
      // localized bright point — a comet head, a chase block — travels WITH the
      // rotation on one prop and AGAINST it on the other, and the two props
      // draw two unrelated figures. Negating the axis too makes prop 1 exactly
      // prop 0 reflected in x: offset (cos, sin) becomes (-cos, sin).
      const raw = ledCount > 1 ? (led / (ledCount - 1)) * 2 - 1 : 0;
      const along = raw * sign;
      const offset = along * halfLength;
      const color = getPixel(pattern, frame, led % pattern.ledCount);
      out.push({
        x: cx + offset * cos,
        y: cy + offset * sin,
        propIndex: prop,
        ledIndex: led,
        endpointIndex: along < 0 ? 0 : 1,
        brightness: 1,
        // Pattern bytes to [0,1]. Look brightness is a flux term the renderer
        // applies once; scaling it here too would square it.
        r: color.r / 255,
        g: color.g / 255,
        b: color.b / 255,
      });
    }
  }
  return out;
}

/**
 * Frames submitted between yields.
 *
 * A settled sweep is up to 360 frames of splat, streak, bloom pyramid and tone
 * map. Submitting them in one synchronous run would hold the main thread for
 * the whole sweep and stall the panel that is trying to show the tile.
 */
const FRAMES_PER_SLICE = 30;

const nextTask = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A still frame of `config`, drawn into a fresh canvas of the requested size.
 *
 * Null when WebGL2 or float framebuffers are unavailable, so the caller can
 * fall back rather than showing an empty box.
 */
export function renderLedThumbnail(
  config: LedSimulatorConfig,
  width: number,
  height: number
): Promise<HTMLCanvasElement | null> {
  const run = queue.then(() => paint(config, width, height));
  // The queue must survive a failed render, or one broken tile stalls the rest.
  queue = run.catch(() => null);
  return run;
}

async function paint(
  config: LedSimulatorConfig,
  width: number,
  height: number
): Promise<HTMLCanvasElement | null> {
  if (typeof document === "undefined") return null;
  if (config.pattern.source !== "generator") return null;

  const viewHeight = (VIEW_W * height) / width;
  const renderWidth = Math.round(VIEW_W * RENDER_PIXELS_PER_VIEW_UNIT);
  const renderHeight = Math.round(viewHeight * RENDER_PIXELS_PER_VIEW_UNIT);

  const renderer = acquire(renderWidth, renderHeight);
  if (!renderer) return null;

  const ledCount = Math.max(1, Math.round(config.device.ledCount));
  const pattern = materializeGeneratorPattern(
    config.pattern.generatorId,
    config.pattern.params,
    ledCount
  );

  const overlayConfig = { ...config, enabled: true };
  const total = settleSeconds(config);
  const samples: LedSample[] = [];
  const spins =
    ledCount > DENSE_STRIP_LEDS && litFraction(pattern) > DENSE_LIT_FRACTION
      ? DENSE_SPIN_PER_WINDOW
      : SPARSE_SPIN_PER_WINDOW;

  renderer.resetExportState();
  let sinceYield = 0;
  for (let t = 0; t <= total; t += DT) {
    renderer.renderLeds(
      {
        leds: samplesAt(t, config, pattern, viewHeight, total, spins, samples),
        currentTime: t * 1000,
        canvasWidth: VIEW_W,
        canvasHeight: viewHeight,
      },
      overlayConfig
    );
    if (++sinceYield >= FRAMES_PER_SLICE) {
      sinceYield = 0;
      await nextTask();
    }
  }

  const source = renderer.getCanvas();
  if (!source) return null;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return out;
}
