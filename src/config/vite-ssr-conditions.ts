// Package export conditions for Vite's server-side environment. `svelte` lets
// the Threlte packages resolve to their Svelte source; `node` and `module`
// come ahead of it so server code gets Node builds.
//
// `import`, `require` and `default` must never be listed here. Vite already
// applies them according to how each module is loaded. Vitest also passes this
// list to its test processes as Node `--conditions` flags whenever it runs from
// the root Vite config (a bare `npx vitest run`, or a workspace package with no
// config of its own). A literal `import` then makes every CommonJS `require()`
// take a package's ES module entry: protobufjs receives long's module namespace
// instead of the Long class, and any test that loads Firestore crashes with
// "util.Long.fromNumber is not a function".
export const SSR_RESOLVE_CONDITIONS = [
  "svelte",
  "node",
  "module",
  "development|production",
];
