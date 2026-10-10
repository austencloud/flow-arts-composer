import type { NavigationBase } from "@sveltejs/kit";
import { browser } from "$app/env";
import { pushState, replaceState } from "$app/navigation";
import { page } from "$app/state";

export type UrlMutationMode = "push" | "replace";

export interface UrlStateOptions {
  mode?: UrlMutationMode;
  state?: Partial<App.PageState>;
  removeState?: readonly (keyof App.PageState)[];
}

// These writes use SvelteKit's `pushState`/`replaceState`, which SvelteKit 3
// deprecates in favour of `goto(url, { shallow: true })`. The replacement is
// not equivalent: a shallow `goto` runs the navigation callbacks and takes
// over SvelteKit's navigation token, so a write landing while a real
// navigation is still loading aborts that navigation. Most writes here are
// background syncs (a debounced sequence URL, an overlay closing), and one that
// fired between a link click and its page load would swallow the click. The
// deprecated pair still runs no callbacks and leaves navigation alone.
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
}

// SvelteKit resolves the route before it touches history, so
// `window.location` and `page.state` keep their old values for a few
// microtasks after the call. Two writes issued back to back would both start
// from that stale URL, and the second would undo the first one's change; two
// overlapping writes can also leave `page.state` from the older one. So the
// newest requested URL and state are tracked here, later writes build on them,
// and writes reach SvelteKit one at a time in the order they were made.
let pending: { href: string; state: App.PageState } | null = null;
let latestWrite = 0;
let inFlight: Promise<void> | null = null;

function currentHref(): string {
  return pending?.href ?? window.location.href;
}

function mergePageState(options: UrlStateOptions): App.PageState {
  const nextState: App.PageState = { ...(pending?.state ?? page.state ?? {}) };

  for (const key of options.removeState ?? []) {
    delete nextState[key];
  }

  Object.assign(nextState, options.state ?? {});

  return nextState;
}

/** Resolves false when the router isn't up yet. Any other failure is a real bug. */
async function commitWrite(write: UrlWrite): Promise<boolean> {
  try {
    const historyWrite = write.mode === "replace" ? replaceState : pushState;
    await historyWrite(write.destination, write.state);
    return true;
  } catch (error) {
    if (error instanceof Error && ROUTER_NOT_READY.test(error.message)) {
      return false;
    }
    throw error;
  }
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
 * True for a URL write made with a shallow `goto`. SvelteKit 3 runs
 * navigation callbacks for those writes; the `pushState` and `replaceState`
 * they replace ran none. Listeners that react to the page changing skip them,
 * so a query parameter or overlay update does not close menus, start a route
 * morph or restart a QR hand-off. (`writeUrl` itself runs no callbacks.)
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
  };
  const id = ++latestWrite;
  pending = {
    href: new URL(destination, currentHref()).href,
    state: write.state,
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
