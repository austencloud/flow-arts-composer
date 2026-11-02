/**
 * The IIFE build: dist/shape-engine.iife.js and dist/shape-engine.css.
 *
 * The engine runs outside SvelteKit the same way the native Shape Engine app
 * (apps/shape-engine) runs it, so this build takes that app's aliases: its
 * client-only `$app/env`, bundled arrow adjustments and poi images, local
 * settings and sequences in place of the Composer's Firebase-backed ones.
 * One list of shims, kept where the first host outside SvelteKit put it.
 */
import { defineConfig, type Alias } from "vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import nativeApp from "../../apps/shape-engine/vite.config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const nativeAliases = (nativeApp.resolve?.alias ?? []) as Alias[];

export default defineConfig({
  root: here,
  publicDir: false,
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
  resolve: {
    alias: [
      ...nativeAliases,
      // The rest of SvelteKit the native app's build does not alias: no
      // public environment (analytics stays off), and the page and its
      // navigation are the host's.
      {
        find: /^\$app\/env\/public$/,
        replacement: resolve(here, "src/shims/app-env-public.ts"),
      },
      {
        find: /^\$app\/state$/,
        replacement: resolve(here, "src/shims/app-state.ts"),
      },
      {
        find: /^\$app\/navigation$/,
        replacement: resolve(here, "src/shims/app-navigation.ts"),
      },
    ],
    dedupe: ["svelte"],
  },
  define: {
    // Library mode leaves process.env alone; a script tag has no process.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(here, "src/iife-entry.ts"),
      name: "TkaShapeEngine",
      formats: ["iife"],
      fileName: () => "shape-engine.iife.js",
      cssFileName: "shape-engine",
    },
    rollupOptions: {
      output: { assetFileNames: "shape-engine.[ext]" },
    },
  },
});
