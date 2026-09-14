import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: appRoot,
  publicDir: false,
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
  resolve: {
    alias: [
      {
        find: /^(?:.*\/)?poi-image-library(?:\.ts)?$/,
        replacement: `${appRoot}src/local-poi-images.ts`,
      },
      {
        find: /^(?:.*\/)?global-adjustment-singleton(?:\.ts)?$/,
        replacement: `${appRoot}src/bundled-arrow-adjustments.ts`,
      },
      {
        find: /^(?:.*\/)?app-state\.svelte(?:\.ts)?$/,
        replacement: `${appRoot}src/native-settings.svelte.ts`,
      },
      {
        find: /^(?:.*\/)?settings-state\.svelte(?:\.ts)?$/,
        replacement: `${appRoot}src/native-settings.svelte.ts`,
      },
      {
        find: "$lib/shared/create/get-sequence-repository",
        replacement: `${appRoot}src/local-sequences.ts`,
      },
      {
        find: "$lib/shared/keyboard/keyboard-shortcut-analytics",
        replacement: `${appRoot}src/keyboard-analytics.ts`,
      },
      {
        find: "$lib/shared/hmr-helper",
        replacement: `${appRoot}src/bundled-import.ts`,
      },
      {
        find: /^(?:.*\/)?BentoPropGrid\.svelte$/,
        replacement: `${appRoot}src/ShapeEnginePropGrid.svelte`,
      },
      { find: "$lib", replacement: `${repoRoot}src/lib` },
      { find: "$app/environment", replacement: `${appRoot}src/environment.ts` },
    ],
    dedupe: ["svelte"],
  },
  build: { outDir: "dist", target: "es2022", sourcemap: false },
});
