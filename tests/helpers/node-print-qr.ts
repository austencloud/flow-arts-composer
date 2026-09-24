/**
 * Real QR rendering and decoding for print tests under jsdom.
 *
 * The shared vitest setup replaces canvases with pixel-less fakes and serves
 * static files as text, which is right for most suites but hides whether a
 * printed QR actually scans. These helpers swap in node-canvas, run the
 * production QRCodeGenerator through qr-code-styling's Node mode, and load the
 * self-hosted ZXing WebAssembly decoder from static/zxing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import * as nodeCanvas from "canvas";
import { JSDOM } from "jsdom";
import QRCodeStyling from "qr-code-styling";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { QRCodeGenerator } from "$lib/shared/qr/services/qr-code-generator";
import type { TkaQrDetector } from "$lib/shared/qr/services/tka-qr-detector";

/**
 * node-canvas refuses an SVG without explicit width and height; the play
 * badge only declares a viewBox. The QR SVG itself is already sized.
 */
function loadSizedImage(src: string): Promise<nodeCanvas.Image> {
  const prefix = "data:image/svg+xml;base64,";
  if (!src.startsWith(prefix)) return nodeCanvas.loadImage(src);
  const svg = Buffer.from(src.slice(prefix.length), "base64").toString("utf8");
  const sized = /<svg[^>]*\swidth=/.test(svg)
    ? svg
    : svg.replace("<svg ", '<svg width="100" height="100" ');
  return nodeCanvas.loadImage(prefix + Buffer.from(sized).toString("base64"));
}

/**
 * Route `document.createElement("canvas")` and `new Image()` to node-canvas.
 * Returns a restore function for afterAll.
 */
export function installNodeCanvas(): () => void {
  const originalCreateElement = document.createElement;
  const patched = ((tagName: string, options?: ElementCreationOptions) =>
    tagName.toLowerCase() === "canvas"
      ? nodeCanvas.createCanvas(0, 0)
      : originalCreateElement.call(
          document,
          tagName,
          options
        )) as typeof document.createElement;
  // The shared setup defines createElement as writable but not configurable.
  document.createElement = patched;
  vi.stubGlobal("Image", nodeCanvas.Image);
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
  return nodeCanvas.createCanvas(width, height) as unknown as HTMLCanvasElement;
}

/** The production generator with a memory-only cache and Node SVG runtime. */
export function createNodeQrGenerator(): QRCodeGenerator {
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
          createCanvas: nodeCanvas.createCanvas,
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
