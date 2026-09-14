import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerFont } from "@napi-rs/canvas/node-canvas.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const isCompiled = currentDirectory.split(/[\\/]/).includes("dist");
const projectRoot = isCompiled
  ? resolve(currentDirectory, "../../../..")
  : resolve(currentDirectory, "../../..");
const fontDirectory = resolve(projectRoot, "static/fonts/gelasio");

const faces = [
  { file: "gelasio-latin-400-normal.woff2", weight: "normal" },
  { file: "gelasio-latin-700-normal.woff2", weight: "bold" },
] as const;

let registrationAttempted = false;

/**
 * Register the app's bundled Gelasio files before the shared card renderer
 * measures or draws text. The Skia backend accepts the browser's WOFF2 files
 * directly, so both renderers use the exact same font outlines.
 */
export function ensureGelasioRegistered(): void {
  if (registrationAttempted) return;

  for (const face of faces) {
    const fontPath = resolve(fontDirectory, face.file);
    if (!existsSync(fontPath)) {
      throw new Error(`Missing bundled Gelasio font: ${fontPath}`);
    }
    registerFont(fontPath, { family: "Gelasio", weight: face.weight });
  }
  registrationAttempted = true;
}
