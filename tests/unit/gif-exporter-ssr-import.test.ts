import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("GIF exporter SSR compatibility", () => {
  it("loads through native ESM without requiring browser globals", () => {
    // Resolve through the filesystem, not `new URL("./literal", import.meta.url)`.
    // That exact shape is Vite asset-URL syntax: Vite rewrites it at transform
    // time into an http URL served by the dev server, so the child node process
    // gets `http://localhost:3000/...` and dies on ERR_UNSUPPORTED_ESM_URL_SCHEME.
    // It fails under Vitest and passes when run directly, which is how it reached
    // CI in the first place.
    const exporterUrl = pathToFileURL(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../src/lib/shared/animation-engine/services/live-canvas-gif-exporter.ts"
      )
    ).href;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `const exporter = await import(${JSON.stringify(exporterUrl)}); console.log(typeof exporter.exportLiveCanvasAsGif);`,
      ],
      { encoding: "utf8" }
    );
    expect(output.trim()).toBe("function");
  });
});
