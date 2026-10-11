import type { NavigationBase } from "$app/navigation";
import { browser } from "$app/env";
import { goto } from "$app/navigation";
import { navigating, page } from "$app/state";

export type UrlMutationMode = "push" | "replace";

export interface UrlStateOptions {
  mode?: UrlMutationMode;
  state?: Partial<App.PageState>;
  removeState?: readonly (keyof App.PageState)[];
}

// These writes use a shallow `goto`, which SvelteKit 3 recommends in place of
// the deprecated `pushState`/`replaceState`. The two are not equivalent: a
// shallow `goto` runs the navigation callbacks and takes over SvelteKit's
// navigation token, so a write landing while a real navigation is still
// loading would abort that navigation. Most writes here are background syncs
// (a debounced sequence URL, an overlay closing), and one that fired between a
// link click and its page load would swallow the click. So a write first waits
// for any navigation in progress to settle, then lands only if the page it was
// made for is still showing. Listeners that react to real page changes skip
// these writes with `isShallowGoto`.
//
// SvelteKit flips its internal "router started" flag only after the root
// component's effects have run, so a URL write issued from a component that
// mounts during hydration — an onMount, or afterNavigate on the initial load —
// arrives too early. In dev that rejects with "Cannot call pushState(...)
// before router is initialized", and because the failure escapes the mount
// flush the router never finishes starting: every later shallow-routing call
// on that page fails too, so one early write kills client-side navigation for
// the whole session. SvelteKit exposes no readiness signal, so an early write
// is caught and retried on the next task, by which time the router is up.
const ROUTER_NOT_READY = /before router is initialized/;
const MAX_DEFERRED_ATTEMPTS = 10;

interface UrlWrite {
  destination: string | URL;
  state: App.PageState;
  mode: UrlMutationMode;
  /** The page the write was made for, from `currentPage`. */
  page: string;
}

// SvelteKit resolves the route before it touches history, so
// `window.location` and `page.state` keep their old values for a few
// microtasks after the call. Two writes issued back to back would both start
// from that stale URL, and the second would undo the first one's change; two
// overlapping writes can also leave `page.state` from the older one. So the
// newest requested URL and state are tracked here, later writes build on them,
// and writes reach SvelteKit one at a time in the order they were made.
// A pending write only counts while its page is still showing: once a real
// navigation replaces that page, new writes start from the new address.
let pending: { href: string; state: App.PageState; page: string } | null = null;
let latestWrite = 0;
let inFlight: Promise<void> | null = null;

/**
 * The page writes are made for. `page.url` moves only on real navigations
 * (shallow writes leave it alone) and on hash changes, which stay on the page.
 */
function currentPage(): string {
  const url = new URL(page.url.href);
  url.hash = "";
  return url.href;
}

function pendingForPage() {
  return pending?.page === currentPage() ? pending : null;
}

function currentHref(): string {
  return pendingForPage()?.href ?? window.location.href;
}

function mergePageState(options: UrlStateOptions): App.PageState {
  const nextState: App.PageState = {
    ...(pendingForPage()?.state ?? page.state ?? {}),
  };

  for (const key of options.removeState ?? []) {
    delete nextState[key];
  }

  Object.assign(nextState, options.state ?? {});

  return nextState;
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Waits out any navigation in progress. Resolves false when it is leaving the
 * app: that navigation never settles, and nothing written now would survive it.
 */
async function waitForNavigation(): Promise<boolean> {
  let settled: Promise<void> | null = null;
  for (;;) {
    const complete = navigating.complete;
    if (!complete || complete === settled) return true;
    if (navigating.willUnload) return false;
    await complete.catch(() => {});
    settled = complete;
    // A navigation that cut this one short registers a moment later.
    await nextTask();
  }
}

/**
 * Resolves true once the write is settled, whether it landed or was dropped
 * because its page is gone, and false when the router isn't up yet. Any other
 * failure is a real bug.
 */
async function commitWrite(write: UrlWrite): Promise<boolean> {
  // With no navigation running, the write goes out without yielding first.
  if (navigating.complete && !(await waitForNavigation())) return true;
  if (currentPage() !== write.page) return true;

  try {
    await goto(write.destination, {
      shallow: true,
      replace: write.mode === "replace",
      state: write.state,
    });
    return true;
  } catch (error) {
    if (error instanceof Error && ROUTER_NOT_READY.test(error.message)) {
      return false;
    }
    throw error;
  }
}

async function applyWrite(write: UrlWrite, id: number): Promise<void> {
  try {
    for (let attempt = 1; ; attempt++) {
      if (await commitWrite(write)) return;

      // A write still waiting on the router describes a URL the app has
      // already moved past — the newest write wins.
      if (id !== latestWrite) return;

      if (attempt >= MAX_DEFERRED_ATTEMPTS) {
        console.warn(
          "[url-state] Router never initialized; dropped URL write to",
          String(write.destination)
        );
        return;
      }

      await nextTask();
    }
  } catch (error) {
    // Nothing awaits a URL write, so report the failure here rather than
    // leave it unhandled, and keep later writes flowing.
    console.error("[url-state] URL write failed", error);
  } finally {
    if (id === latestWrite) pending = null;
  }
}

/**
 * True for a URL write made with a shallow `goto`, including every `writeUrl`.
 * SvelteKit 3 runs navigation callbacks for those writes; the `pushState` and
 * `replaceState` they replace ran none. Listeners that react to the page
 * changing skip them, so a query parameter or overlay update does not close
 * menus, start a route morph or restart a QR hand-off.
 */
export function isShallowGoto(
  navigation: Pick<NavigationBase, "type" | "shallow">
): boolean {
  return navigation.type === "goto" && navigation.shallow;
}

export function writeUrl(
  destination: string | URL,
  options: UrlStateOptions = {}
): void {
  if (!browser) return;

  const write: UrlWrite = {
    destination,
    state: mergePageState(options),
    mode: options.mode === "push" ? "push" : "replace",
    page: currentPage(),
  };
  const id = ++latestWrite;
  pending = {
    href: new URL(destination, currentHref()).href,
    state: write.state,
    page: write.page,
  };

  // With nothing in flight the write starts now, so SvelteKit sees it in the
  // same tick it was issued; otherwise it waits for the writes ahead of it.
  const run = () => applyWrite(write, id);
  const queued = inFlight ? inFlight.then(run) : run();
  inFlight = queued;
  void queued.then(() => {
    if (inFlight === queued) inFlight = null;
  });
}

export function mutateCurrentUrl(
  mutation: (url: URL) => void,
  options: UrlStateOptions = {}
): void {
  if (!browser) return;

  const currentUrl = new URL(currentHref());
  const nextUrl = new URL(currentUrl);
  mutation(nextUrl);

  if (
    nextUrl.href === currentUrl.href &&
    options.state === undefined &&
    !options.removeState?.length
  ) {
    return;
  }

  writeUrl(nextUrl, options);
}

export function removeCurrentUrlParams(
  names: readonly string[],
  options: UrlStateOptions = {}
): void {
  mutateCurrentUrl((url) => {
    for (const name of names) {
      url.searchParams.delete(name);
    }
  }, options);
}
