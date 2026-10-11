import { mount, unmount } from "svelte";
import TunnelDetailPreview from "../components/TunnelDetailPreview.svelte";
import {
  capturePosterFromContainer,
  compositeContainerLayers,
  DISCOVERY_POSTER_SIZE,
  DISCOVERY_RENDER_SIZE,
  POSTER_MAX_BYTES,
  POSTER_SIZE,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-poster.js";
import { tunnelForPoster } from "../domain/tunnel-poster-look";
import type { CollectedTunnel } from "../domain/tunnel-collection-types";

/**
 * Renders a saved tunnel offscreen and composites its canvas layers down into a
 * poster.
 *
 * The picture is the tunnel's COMPLETE traced figure, not a frame of it, and it
 * is the same picture every time — see `domain/tunnel-poster-look.ts` for what
 * that changes and why. This module owns the other half: mounting the real
 * renderer, waiting for the figure to finish drawing itself, and encoding it.
 *
 * Two sizes come out of the same pipeline. The in-document `tunnel.poster` is a
 * 200px thumbnail — right for the collection grid, where every tunnel's poster
 * rides inside its own Firestore document. Explore puts artwork on a plinth
 * that reaches ~950 CSS px on a 4K canvas, so it gets its own 1024px image in
 * Storage; re-using the thumbnail there is what made published tunnels read as
 * blocks.
 *
 * Rendering rather than upscaling also means the poster is resolution- and
 * machine-independent: it does not inherit whatever size the owner's screen
 * happened to give the preview when they pressed Share.
 */

/**
 * Hidden host: laid out (canvases need real boxes) and on-screen, but invisible.
 *
 * `left: -99999px` looks like the tidier choice and is the wrong one — Chrome
 * throttles rAF for content parked outside the viewport, and this render is
 * paid for in frames. A/B on the same tunnel, three captures each: parked
 * offscreen it took 9.8-10.0s and covered 10-14% of the frame; at zero opacity
 * behind the page, 3.6-4.6s and 15-19%. Zero opacity keeps the renderer at full
 * rate while showing the user nothing.
 */
function createHost(size: number): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${size}px`,
    height: `${size}px`,
    overflow: "hidden",
    opacity: "0",
    zIndex: "-1",
    pointerEvents: "none",
    // TunnelDetailPreview's .preview-stage sizes itself with 100cqw/100cqh, so
    // the host has to be a size container exactly like .detail-preview is.
    containerType: "size",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(host);
  return host;
}

/** Edge length of the scratch composite the stage is measured through. Tiny on
 *  purpose: this runs on a timer, and the GPU readback is the cost. */
const PROBE_SIZE = 64;
/** Channel sum above which a probe pixel counts as drawn art rather than the
 *  stage's black ground. Low enough to catch a dim first frame. */
const INK_MIN_CHANNEL_SUM = 24;

/** Poll interval while waiting for the first pixel. The stage has a long cold
 *  start — kaleidoscope layers, pictograph preparation and prop art all land
 *  before anything is drawn — so this is measured in seconds, not frames. */
const FIRST_PAINT_POLL_MS = 120;
/** Give up waiting for first paint. Past this the renderer is stuck or the
 *  machine is overwhelmed; the caller falls back to the stored thumbnail. */
const FIRST_PAINT_TIMEOUT_MS = 15_000;

/**
 * How the capture knows the figure is finished: it watches, rather than counts.
 *
 * A clock cannot answer this. One loop of the base sequence is `steps × 60/bpm`
 * seconds, but a quarter-rate arm needs four of them, a stagger delays every
 * copy, and reduced motion damps the whole playhead to 15% — so any duration
 * derived from the snapshot is wrong for some tunnel. Ink coverage answers it
 * directly: poster trails do not decay, so coverage only ever rises, and it
 * stops rising at the moment every arm has closed its path. That plateau is the
 * frame worth keeping.
 */
const SETTLE_POLL_MS = 250;
/** Growth below this share of the probe between polls reads as "not growing".
 *  Above the noise one fresh stroke makes; below what a whole new arm adds. */
const SETTLE_GROWTH_EPSILON = 0.0015;
/** Consecutive quiet polls before the figure is called complete (~1s of calm). */
const SETTLE_QUIET_POLLS = 4;
/** Never capture sooner than this, however fast coverage plateaus — a stage that
 *  has drawn one arm brightly can look calm for a moment before the next lands. */
const SETTLE_MIN_MS = 2_000;
/** Backstop. A tunnel whose slowest arm genuinely needs longer than this gets an
 *  almost-closed figure rather than holding a publish open indefinitely. */
const SETTLE_MAX_MS = 25_000;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fraction of the probe holding drawn art, or 0 when nothing is readable.
 *
 * Measured from inside a frame: the trail overlay is a WebGL2 canvas, and
 * reading one outside its own rAF turn can hand back a cleared backbuffer.
 */
async function inkCoverage(host: HTMLElement): Promise<number> {
  await nextFrame();
  const probe = compositeContainerLayers(host, PROBE_SIZE);
  const ctx = probe?.getContext("2d");
  if (!ctx) return 0;
  const { data } = ctx.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE);
  let lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! + data[i + 1]! + data[i + 2]! > INK_MIN_CHANNEL_SUM) lit++;
  }
  return lit / (PROBE_SIZE * PROBE_SIZE);
}

/** Resolves true once the stage has drawn anything, false if it never does. */
async function waitForFirstPaint(host: HTMLElement): Promise<boolean> {
  const deadline = performance.now() + FIRST_PAINT_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if ((await inkCoverage(host)) > 0) return true;
    await delay(FIRST_PAINT_POLL_MS);
  }
  return false;
}

/** Hold until ink coverage stops climbing — the figure has closed. */
async function settleUntilFigureCloses(host: HTMLElement): Promise<void> {
  const start = performance.now();
  let peak = 0;
  let quietPolls = 0;

  while (performance.now() - start < SETTLE_MAX_MS) {
    await delay(SETTLE_POLL_MS);
    const coverage = await inkCoverage(host);
    if (coverage > peak + SETTLE_GROWTH_EPSILON) {
      quietPolls = 0;
    } else {
      quietPolls++;
    }
    peak = Math.max(peak, coverage);
    if (
      quietPolls >= SETTLE_QUIET_POLLS &&
      performance.now() - start >= SETTLE_MIN_MS
    ) {
      return;
    }
  }
}

/**
 * Returns a WebP data URL, or "" when the tunnel could not be rendered (no DOM,
 * no drawable layer, renderer threw). Callers fall back to the stored thumbnail
 * so a publish never fails on its poster.
 */
export async function renderTunnelPoster(
  tunnel: CollectedTunnel,
  { size = POSTER_SIZE }: { size?: number } = {}
): Promise<string> {
  if (typeof document === "undefined") return "";

  const host = createHost(DISCOVERY_RENDER_SIZE);
  let component: Record<string, unknown> | undefined;
  try {
    // TunnelDetailPreview captures/applies/restores the three renderer globals
    // it can't take as props. When the owner publishes from the tunnel detail
    // view, an on-screen instance of the SAME tunnel is already mounted, so the
    // values this instance captures and restores are the ones already applied —
    // the nesting is a no-op rather than a fight. The poster look rides in on
    // the snapshot it is handed, so it stays data rather than a second mode.
    component = mount(TunnelDetailPreview, {
      target: host,
      props: { tunnel: tunnelForPoster(tunnel) },
    }) as Record<string, unknown>;

    if (!(await waitForFirstPaint(host))) return "";
    await settleUntilFigureCloses(host);

    return capturePosterFromContainer(host, {
      size,
      budgetBytes: POSTER_MAX_BYTES,
    });
  } catch {
    return "";
  } finally {
    if (component) {
      try {
        void unmount(component);
      } catch {
        // Teardown failure must not strand the host in the document.
      }
    }
    host.remove();
  }
}

/** The Storage-hosted image Explore hangs on its plinth. */
export function renderTunnelDiscoveryPoster(
  tunnel: CollectedTunnel
): Promise<string> {
  return renderTunnelPoster(tunnel, { size: DISCOVERY_POSTER_SIZE });
}
