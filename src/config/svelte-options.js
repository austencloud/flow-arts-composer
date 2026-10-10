import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Svelte preprocess and compiler options, shared by the sveltekit() plugin in
// vite.config.ts and by scripts/svelte-compile-gate.mjs, which compiles
// changed components the way the build does. Before SvelteKit 3 both read
// them from svelte.config.js.
/** @type {Pick<import("@sveltejs/kit").Config, "preprocess" | "compilerOptions">} */
export const svelteOptions = {
  preprocess: vitePreprocess({ script: true }),

  // Suppresses state_referenced_locally in builds and svelte-check alike.
  // Those are either fixed with $derived/$effect or are genuinely intentional
  // one-time prop captures (let x = $state(initialProp)).
  compilerOptions: {
    warningFilter: (warning) => warning.code !== "state_referenced_locally",
  },
};
