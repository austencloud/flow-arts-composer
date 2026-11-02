/**
 * SvelteKit's `$app/navigation` for the script-tag build. The engine calls
 * `goto` only from Composer paths a mirror host hides (Open in the drill, the
 * teaser's link), so a plain page load is enough for whatever is left.
 */
export function goto(url: string | URL): Promise<void> {
  window.location.assign(url);
  return Promise.resolve();
}

export function pushState(): void {}

export function replaceState(): void {}
