import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteOptions } from "../../../src/config/svelte-options.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export default defineConfig({
  root,
  publicDir: false,
  resolve: {
    alias: { "#lib": resolve(root, "src/lib") },
    conditions: ["svelte", "browser", "module"],
  },
  plugins: [svelte(svelteOptions)],
  build: {
    outDir: resolve(root, "unreal/FlowFest/Intermediate/native-capture-static"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, "unreal/FlowFest/Tools/native-capture.html"),
    },
  },
});
