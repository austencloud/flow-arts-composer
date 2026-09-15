/**
 * Line numbers of `<Component` tags that are not inside a `{#if browser}`
 * block. The production SSR build stubs every `.svelte` file under
 * `shared/animation-engine/`, `shared/3d/`, and every non-core feature
 * (see `SSR_STUBBED_SHARED_RENDER_PATHS` and `FEATURES` in
 * src/config/feature-flags.ts) to `export default null`. A prerendered public
 * route that renders one of those components outside a browser guard calls
 * `null` as a component and fails the whole build with "Error: 500 /route".
 * The dev server never shows this because the gate only runs for `vite build`.
 */
export function unguardedRenders(source: string, component: string): number[] {
  const unguarded: number[] = [];
  // Each `{#if …}` pushes whether it is a browser guard; `{/if}` pops.
  const guardStack: boolean[] = [];
  const tokens = source.matchAll(
    new RegExp(String.raw`\{#if\s+([^}]*)\}|\{/if\}|<${component}\b`, "g")
  );
  for (const token of tokens) {
    const [text, condition] = token;
    if (text === "{/if}") {
      guardStack.pop();
    } else if (text.startsWith("{#if")) {
      guardStack.push(isBrowserGuard(condition!));
    } else if (!guardStack.includes(true)) {
      unguarded.push(source.slice(0, token.index).split("\n").length);
    }
  }
  return unguarded;
}

/**
 * `browser` alone, or `browser` as one term of an `&&` chain, is false on the
 * server no matter what the other terms are. Anything with `||` or a ternary
 * can still be true there, so it does not count as a guard.
 */
function isBrowserGuard(condition: string): boolean {
  if (/\|\||\?/.test(condition)) return false;
  return condition.split("&&").some((term) => term.trim() === "browser");
}
