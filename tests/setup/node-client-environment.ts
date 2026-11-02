import { Console } from "node:console";
import type { Environment } from "vitest/environments";

// The main suite's default environment: Node's globals, no DOM, but modules
// transformed the way jsdom files get them (Vite's `client` environment).
//
// Vitest's own "node" environment transforms through the `ssr` environment,
// which changes what a test exercises, not just which globals exist: the
// `browser` export condition in the config's `resolve.conditions` stops
// applying, `svelte` resolves to its server build (no `mount`, no `$effect`),
// and `.svelte.ts` rune modules compile with `generate: "server"`. Until
// 2026-11 every file ran under jsdom with client transforms, so this keeps the
// module graph identical and drops only the per-file jsdom boot, which was
// most of the suite's worker time. A file that needs a DOM opts back in with
// `// @vitest-environment jsdom` on line 1.
//
// `setup` mirrors Vitest 4.1's built-in node environment. It is copied rather
// than spread from `builtinEnvironments.node` because Vitest loads this file
// through Vite's module runner, which tags the `vitest/environments` import
// with a `?v=` query that Node's resolver then cannot find. A type-only import
// is erased and safe. There is no `setupVM`: the suite runs on `forks`.
export default {
  name: "node-client",
  viteEnvironment: "client",
  async setup(global) {
    global.console.Console = Console;
    return {
      teardown(global) {
        delete global.console.Console;
      },
    };
  },
} satisfies Environment;
