import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import sharp from "sharp";

/** Only platform primitives are adapted; preparation and drawing stay in app code. */
export function installQrBakeNodeRuntime(canvas, staticRoot) {
  const diagnostics = new AsyncLocalStorage();
  for (const level of ["warn", "error"]) {
    const original = console[level];
    console[level] = (...args) => {
      const active = diagnostics.getStore();
      if (active) active.push(args.map(String).join(" "));
      else original(...args);
    };
  }
  const originalFetch = globalThis.fetch;
  const root = path.resolve(staticRoot);
  globalThis.fetch = async (input, init) => {
    if (typeof input !== "string" || !input.startsWith("/"))
      return originalFetch(input, init);
    const file = path.resolve(
      root,
      `.${decodeURIComponent(input.split("?")[0])}`
    );
    if (!file.startsWith(`${root}${path.sep}`))
      throw new Error("Static asset escaped root");
    try {
      const bytes = await fs.readFile(file);
      const mime = file.endsWith(".svg")
        ? "image/svg+xml"
        : file.endsWith(".json")
          ? "application/json"
          : "text/plain";
      return new Response(bytes, { headers: { "content-type": mime } });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      diagnostics.getStore()?.push(`Missing static asset: ${input}`);
      return new Response("Missing static asset", { status: 404 });
    }
  };
  globalThis.OffscreenCanvas = canvas.Canvas;
  canvas.Canvas.prototype.convertToBlob = async function ({
    type = "image/png",
    quality = 0.9,
  } = {}) {
    const format = type === "image/webp" ? "webp" : "png";
    return new Blob([await this.encode(format, Math.round(quality * 100))], {
      type,
    });
  };
  globalThis.createImageBitmap = async (blob) => {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer());
      // librsvg handles nested clipping in artwork that the Canvas SVG decoder
      // does not support. Canvas still owns all placement and composition.
      const image = await canvas.loadImage(
        blob.type.includes("svg") ? await sharp(bytes).png().toBuffer() : bytes
      );
      image.close = () => {};
      return image;
    } catch (error) {
      // UI drawing may swallow a decode error. Publication must reject every
      // affected cell, even when the UI suppresses repeated warnings.
      diagnostics.getStore()?.push(`Image decode failed: ${error.message}`);
      throw error;
    }
  };
  return async (render) => {
    const messages = [];
    const result = await diagnostics.run(messages, render);
    if (messages.length)
      throw new Error(
        `Incomplete render: ${messages.join("; ").slice(0, 1000)}`
      );
    return result;
  };
}
