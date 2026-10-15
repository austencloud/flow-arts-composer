import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Vite already owns the project's esbuild dependency. Bundle the same TypeScript
// source that the web game uses, with its browser build-time DEV flag defined.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite"));
const { build } = viteRequire("esbuild");
const project = resolve(process.cwd(), "unreal/MuseumGame");
const saved = resolve(project, "Saved");
await mkdir(saved, { recursive: true });
const outfile = resolve(saved, "export-museum.mjs");
await build({
  entryPoints: [resolve(project, "Tools/export-museum.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  define: { "import.meta.env.DEV": "false" },
});
await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
