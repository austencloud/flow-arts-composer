/**
 * Real QR rendering and decoding for print tests under jsdom.
 *
 * The shared vitest setup replaces canvases with pixel-less fakes and serves
 * static files as text, which is right for most suites but hides whether a
 * printed QR actually scans. These helpers swap in node-canvas, run the
 * production QRCodeGenerator through qr-code-styling's Node mode, and load the
 * self-hosted ZXing WebAssembly decoder from static/zxing.
 *
 * node-canvas is a native addon. CI installs its prebuilt binding, but a
 * machine where `prebuild-install` found nothing and `node-gyp` had no
 * toolchain keeps the package without `build/Release/canvas.node`, and
 * importing it throws. The module is loaded lazily here, and suites that need
 * real pixels gate themselves with `describe.runIf(nodeCanvasAvailable())` so
 * such a machine skips them with one warning instead of failing on import.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { vi } from "vitest";
import type * as NodeCanvas from "canvas";
import { JSDOM } from "jsdom";
import QRCodeStyling from "qr-code-styling";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { QRCodeGenerator } from "#lib/shared/qr/services/qr-code-generator.js";
import type { TkaQrDetector } from "#lib/shared/qr/services/tka-qr-detector.js";

type NodeCanvasModule = typeof NodeCanvas;

const nodeRequire = createRequire(import.meta.url);

let loadAttempt:
  | { module: NodeCanvasModule; reason: null }
  | { module: null; reason: string }
  | undefined;

/** Load node-canvas once per test file, remembering why it failed when it does. */
function loadNodeCanvas(): NodeCanvasModule | null {
  if (!loadAttempt) {
    try {
      loadAttempt = {
        module: nodeRequire("canvas") as NodeCanvasModule,
        reason: null,
      };
    } catch (error) {
      // The first line names the missing binding; the rest is the require stack.
      const message = error instanceof Error ? error.message : String(error);
      loadAttempt = { module: null, reason: message.split("\n")[0] ?? message };
    }
  }
  return loadAttempt.module;
}

let warnedUnavailable = false;

/**
 * Whether node-canvas's native binding loads on this machine. Wrap suites that
 * render real pixels in `describe.runIf(nodeCanvasAvailable())`. The first
 * negative answer per test file warns, so a missing binding shows up in the
 * run instead of passing as a quiet skip forever.
 */
export function nodeCanvasAvailable(): boolean {
  if (loadNodeCanvas()) return true;
  if (!warnedUnavailable) {
    warnedUnavailable = true;
    console.warn(
      `[node-print-qr] Skipping node-canvas suites: the "canvas" package's native binding did not load (${loadAttempt?.reason}). ` +
        "CI runs them; to run them here, rebuild the binding in the primary checkout (pnpm rebuild canvas)."
    );
  }
  return false;
}

/** node-canvas for the helpers below. Callers are gated, so this should not throw. */
function requireNodeCanvas(): NodeCanvasModule {
  const module = loadNodeCanvas();
  if (!module) {
    throw new Error(
      `node-canvas is unavailable here (${loadAttempt?.reason}); gate this suite with describe.runIf(nodeCanvasAvailable()).`
    );
  }
  return module;
}

/**
 * node-canvas refuses an SVG without explicit width and height; the play
 * badge only declares a viewBox. The QR SVG itself is already sized.
 */
function loadSizedImage(src: string): Promise<NodeCanvas.Image> {
  const { loadImage } = requireNodeCanvas();
  const prefix = "data:image/svg+xml;base64,";
  if (!src.startsWith(prefix)) return loadImage(src);
  const svg = Buffer.from(src.slice(prefix.length), "base64").toString("utf8");
  const sized = /<svg[^>]*\swidth=/.test(svg)
    ? svg
    : svg.replace("<svg ", '<svg width="100" height="100" ');
  return loadImage(prefix + Buffer.from(sized).toString("base64"));
}

/**
 * Route `document.createElement("canvas")` and `new Image()` to node-canvas.
 * Returns a restore function for afterAll.
 */
export function installNodeCanvas(): () => void {
  const { createCanvas, Image } = requireNodeCanvas();
  const originalCreateElement = document.createElement;
  const patched = ((tagName: string, options?: ElementCreationOptions) =>
    tagName.toLowerCase() === "canvas"
      ? createCanvas(0, 0)
      : originalCreateElement.call(
          document,
          tagName,
          options
        )) as typeof document.createElement;
  // The shared setup defines createElement as writable but not configurable.
  document.createElement = patched;
  vi.stubGlobal("Image", Image);
  return () => {
    document.createElement = originalCreateElement;
    vi.unstubAllGlobals();
  };
}

/** A card-sized node canvas cast to the DOM type the print code expects. */
export function createNodeCanvas(
  width: number,
  height: number
): HTMLCanvasElement {
  return requireNodeCanvas().createCanvas(
    width,
    height
  ) as unknown as HTMLCanvasElement;
}

/** The production generator with a memory-only cache and Node SVG runtime. */
export function createNodeQrGenerator(): QRCodeGenerator {
  const { createCanvas } = requireNodeCanvas();
  return new QRCodeGenerator(
    undefined,
    { get: async () => null, set: async () => {} } as never,
    undefined,
    undefined,
    (options) =>
      new QRCodeStyling({
        ...options,
        jsdom: JSDOM,
        nodeCanvas: {
          createCanvas,
          loadImage: loadSizedImage,
        },
      } as never)
  );
}

let zxingPrepared = false;

/** ZXing decoder with the same result shape as createTkaQrDetector. */
export function createNodeQrDetector(): TkaQrDetector {
  if (!zxingPrepared) {
    zxingPrepared = true;
    const wasm = readFileSync(
      path.resolve(process.cwd(), "static/zxing/zxing_reader.wasm")
    );
    prepareZXingModule({
      overrides: {
        wasmBinary: wasm.buffer.slice(
          wasm.byteOffset,
          wasm.byteOffset + wasm.byteLength
        ) as ArrayBuffer,
      },
      fireImmediately: true,
    });
  }
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  return {
    async detect(source) {
      const results = await detector.detect(source);
      return results.map((result) => ({
        rawValue: result.rawValue,
        boundingBox: {
          x: result.boundingBox.x,
          y: result.boundingBox.y,
          width: result.boundingBox.width,
          height: result.boundingBox.height,
        },
      }));
    },
  };
}
