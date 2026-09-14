import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerFont } from "@napi-rs/canvas/node-canvas.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const isCompiled = currentDirectory.split(/[\\/]/).includes("dist");
const fontDirectory = resolve(
  currentDirectory,
  isCompiled ? "../assets/fonts/gelasio" : "../../assets/fonts/gelasio"
);

const faces = [
  { file: "gelasio-latin-400-normal.woff2", weight: "normal" },
  { file: "gelasio-latin-700-normal.woff2", weight: "bold" },
] as const;

let registrationAttempted = false;

/**
 * Register the font files packed beside this MCP before card layout measures
 * text. This keeps the published package independent of host-installed fonts.
 */
export function ensureGelasioRegistered(): void {
  if (registrationAttempted) return;

  for (const face of faces) {
    const fontPath = resolve(fontDirectory, face.file);
    if (!existsSync(fontPath)) {
      throw new Error(`Missing packaged Gelasio font: ${fontPath}`);
    }
    registerFont(fontPath, { family: "Gelasio", weight: face.weight });
  }
  registrationAttempted = true;
}
