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
    alias: [
      { find: "#lib", replacement: resolve(root, "src/lib") },
      { find: /^\$app\/env$/, replacement: resolve(root, "unreal/FlowFest/Tools/native-capture-app-env.js") },
      { find: /^\$app\/env\/public$/, replacement: resolve(root, "unreal/FlowFest/Tools/native-capture-public-env.js") },
      { find: /^\$app\/navigation$/, replacement: resolve(root, "unreal/FlowFest/Tools/native-capture-navigation.js") },
      { find: /^\$app\/state$/, replacement: resolve(root, "unreal/FlowFest/Tools/native-capture-state.js") },
    ],
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
