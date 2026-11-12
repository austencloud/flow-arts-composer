/**
 * Timeout-guarded, lightly-retrying fetch for STATIC assets (letter SVGs, prop
 * SVGs, grid SVGs, placement JSON).
 *
 * WHY THIS EXISTS — the dev-server "stuck on Loading…" freeze:
 *
 * Heavy routes fire many asset fetches. Each loader previously called raw fetch()
 * with NO timeout. When a socket stalls (server busy compiling under multi-agent
 * churn, or a request queued behind Chrome's 6-connection HTTP/1.1 ceiling) a
 * timeout-less fetch holds that socket OPEN INDEFINITELY. Once enough sockets are
 * wedged the whole tab hangs on "Loading…" forever; refresh reuses the same dead
 * keep-alive pool, so only a brand-new tab recovers.
 *
 * The fix that actually matters is the TIMEOUT: a stalled request aborts after
 * TIMEOUT_MS, freeing its socket, so the browser's own request queue drains and
 * the page self-heals. Chrome already caps concurrency at 6 per origin — a
 * smaller app-side cap only STARVES legitimate parallel work (e.g. the gallery's
 * thumbnail render queue, whose renders then blow past their own 15s budget), and
 * a cap ≥6 is a no-op. So there is deliberately NO concurrency gate here.
 *
 * Retry policy: one retry on a genuine network error ("Failed to fetch" — the
 * transient that a mid-flight HMR reload produces). A TIMEOUT is NOT retried —
 * under a saturated dev server, retrying a timed-out request only adds load and
 * makes the saturation worse. A timed-out asset fails fast; the loader falls back
 * (returns null / loads on demand later).
 */

// Under the 15s render-queue budget, so a stuck asset fails before it can time
// out a whole thumbnail render. Prod (HTTP/2, multiplexed) can afford longer.
const TIMEOUT_MS = import.meta.env.DEV ? 10_000 : 30_000;

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

// A full-page navigation (the /composer "Open the app" link reloads into
// /create) cancels every fetch still in flight. Firefox rejects each one with
// "TypeError: NetworkError when attempting to fetch resource.", Chrome with
// "Failed to fetch", and PostHog filed every one that reached console.error
// as an exception. Nothing failed: the page was leaving. `beforeunload` fires
// before the old document's fetches are cancelled; `pagehide` covers paths
// that skip it. `pageshow` clears the flag when a back-forward-cache restore
// brings the page back, and a press or key clears it after a `beforeunload`
// whose navigation was cancelled (an unsaved-work prompt the visitor declined):
// someone still using the page means it is not leaving.
//
// iPhone Safari never fires `beforeunload`, and it cancels the old page's
// fetches ("TypeError: Load failed") as soon as a link starts loading, a
// second before `pagehide` (a visitor report, 2026-11-11: five Load failed
// errors 0.2 s after the tap, pagehide 1.2 s after it). So a link click the
// browser itself will follow counts as leaving too. The window listener runs
// after SvelteKit's, so a link the router handles in place is already
// defaultPrevented and does not count.
let pageLeaving = false;

/** Whether this click makes the browser load a new document in this tab. */
export function isDocumentNavigationClick(
  event: Pick<
    MouseEvent,
    | "defaultPrevented"
    | "button"
    | "metaKey"
    | "ctrlKey"
    | "shiftKey"
    | "altKey"
    | "target"
  >,
  here: Pick<Location, "href">
): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const target = event.target as Element | null;
  const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || link.hasAttribute("download")) return false;
  const frame = link.getAttribute("target");
  if (frame && frame !== "_self") return false;
  let destination: URL;
  try {
    destination = new URL(link.href, here.href);
  } catch {
    return false;
  }
  if (destination.protocol !== "http:" && destination.protocol !== "https:") {
    return false;
  }
  const current = new URL(here.href);
  // Same page apart from the #fragment: the browser scrolls, it does not load.
  const samePage =
    destination.origin === current.origin &&
    destination.pathname === current.pathname &&
    destination.search === current.search;
  return !(samePage && destination.hash !== "");
}
if (typeof window !== "undefined") {
  const options = { capture: true, passive: true };
  const leave = (): void => {
    pageLeaving = true;
  };
  const stay = (): void => {
    pageLeaving = false;
  };
  window.addEventListener("beforeunload", leave, options);
  window.addEventListener("pagehide", leave, options);
  window.addEventListener("pageshow", stay, options);
  window.addEventListener("pointerdown", stay, options);
  window.addEventListener("keydown", stay, options);
  window.addEventListener(
    "click",
    (event) => {
      if (isDocumentNavigationClick(event, window.location)) leave();
    },
    { passive: true }
  );
}

/** True once the document has started to unload. */
export function isPageLeaving(): boolean {
  return pageLeaving;
}

/** Test seam: set the unload flag without dispatching window events. */
export function setPageLeavingForTests(value: boolean): void {
  pageLeaving = value;
}

/**
 * A failure that says nothing about the asset or the network: the request was
 * cancelled on purpose (AbortError), or it died because the page is unloading.
 * Callers drop these silently. A TimeoutError is NOT one of them: a request
 * that ran out its whole budget is a real network problem worth one report.
 */
export function isCancelledAssetFailure(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return pageLeaving && err instanceof TypeError;
}

/**
 * Fetch a static asset with a timeout + single network-error retry. Drop-in for
 * the loaders that use `response.ok` / `.text()` / `.json()`.
 *
 * `timeoutMs` overrides the default budget. Background asset loads want the
 * generous default; a caller on a user-blocking critical path (resolving a
 * scanned card while someone holds a phone over it) needs a tighter one.
 */
export async function assetFetch(
  url: string,
  init?: RequestInit,
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      // AbortSignal.timeout aborts with a clean TimeoutError after the budget,
      // freeing the socket (the load-bearing freeze fix). The signal covers the
      // whole exchange including the body stream, so a download that stalls
      // mid-body aborts too rather than hanging forever.
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Don't retry timeouts (amplifies load on a saturated server) or after the
      // first retry. Only a transient network error gets one more shot.
      // An unloading page cancels the retry too, so it would only fail twice.
      if (isTimeout(err) || attempt >= 1 || pageLeaving) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}
