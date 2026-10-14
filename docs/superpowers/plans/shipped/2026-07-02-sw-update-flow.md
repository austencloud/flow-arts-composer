# Service Worker Update Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a new deploy is ready, show the user a persistent toast with a Reload button instead of letting the new service worker silently take over an open tab (which serves new content-hashed chunks to old in-memory code → 404 on lazy chunks).

**Architecture:** Three seams. (1) `static/sw.js` stops auto-`skipWaiting()` on install and instead skips only on a `SKIP_WAITING` message. (2) A new isolated, unit-tested `sw-update-manager.ts` detects a waiting worker, prompts via an injected callback, and reloads once on `controllerchange`. (3) The shared toast primitive gains an optional action button; `hooks.client.ts` wires the manager to a Reload toast.

**Tech Stack:** Vanilla service worker (no Workbox), Svelte 5 runes, Vitest (jsdom), the existing `sw-harness.ts` (evaluates the real `sw.js` in a controlled scope).

**Spec:** `docs/superpowers/specs/active/2026-07-02-sw-update-flow-design.md`

**Standing constraints:** Work on `main` (worktrees banned). Commit each task with an **explicit pathspec** (`git commit -m "…" -- <paths>`) — the tree has other agents' in-flight work; never stage or commit files you didn't touch. Never run full `npm run check`/`npm run build` in the inner loop; use targeted `npx vitest run <file>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `static/sw.js` | Drop install `skipWaiting()`; add a `message`→`skipWaiting` listener. |
| `tests/helpers/sw-harness.ts` | Add a `dispatchMessage(data)` driver so tests can fire the SW's `message` listener. |
| `tests/unit/sw-offline-behavior.test.ts` | Flip the install-skipWaiting assertion; add an update-flow describe block. |
| `src/lib/shared/offline/services/sw-update-manager.ts` | NEW. Waiting-update detection, apply-on-request, reload-once. UI-agnostic. |
| `src/lib/shared/offline/services/sw-update-manager.test.ts` | NEW. Unit-tests the manager against fake registration/container/worker. |
| `src/lib/shared/toast/state/toast-state.svelte.ts` | Add optional `action` to `Toast` + `ShowToastOptions`. |
| `src/lib/shared/toast/state/toast-state.test.ts` | NEW. Assert `action` passes through `showToast` onto the queued toast. |
| `src/lib/shared/toast/components/ToastContainer.svelte` | Render a real Reload button when `toast.action` is present. |
| `src/hooks.client.ts` | Wire `createSwUpdateManager` into the prod registration; show the Reload toast. |

---

## Task 1: `sw.js` — wait instead of hijack

**Files:**
- Modify: `tests/helpers/sw-harness.ts` (add `dispatchMessage`)
- Modify: `tests/unit/sw-offline-behavior.test.ts:56` + new describe block
- Modify: `static/sw.js:13-24` (install handler)

- [ ] **Step 1: Add a `message` driver to the harness**

In `tests/helpers/sw-harness.ts`, inside `createSwHarness`, add this function next to `dispatchFetch` (before the `return {` block):

```ts
  /** Fires the SW's `message` listeners with a { data } event (postMessage). */
  function dispatchMessage(data: unknown): void {
    const event = { data };
    for (const fn of listeners.get("message") ?? []) fn(event);
  }
```

Then add it to the returned object (after `dispatchFetch: ...,`):

```ts
    dispatchMessage,
```

- [ ] **Step 2: Flip the install assertion + add the update-flow tests (they fail against current sw.js)**

In `tests/unit/sw-offline-behavior.test.ts`, change the assertion at the end of the "precaches the SVG manifest set alongside the /app shell" test. Replace:

```ts
    expect(h.self.skipWaiting).toHaveBeenCalled();
```

with:

```ts
    // install no longer force-activates: it must NOT skipWaiting, so an open
    // tab keeps running old code until the user opts into the update.
    expect(h.self.skipWaiting).not.toHaveBeenCalled();
```

Then append a new describe block at the end of the file:

```ts
describe("sw.js update flow", () => {
  // Fix: silent auto-update — install used to skipWaiting(), so a new deploy
  // took over an open tab and served new immutable chunks to old in-memory
  // code (→ 404 on the next lazy chunk). Install must now WAIT.
  it("does not skipWaiting on install", async () => {
    const h = createSwHarness();
    h.route("/app", respondWith("<html></html>", { contentType: "text/html" }));
    await h.dispatchInstall();
    expect(h.self.skipWaiting).not.toHaveBeenCalled();
  });

  // Fix: skipWaiting fires ONLY when the client posts SKIP_WAITING (the user
  // clicked Reload), and ignores any other message type.
  it("skipWaiting fires only on a SKIP_WAITING message", async () => {
    const h = createSwHarness();
    h.route("/app", respondWith("<html></html>", { contentType: "text/html" }));
    await h.dispatchInstall();

    h.dispatchMessage({ type: "SOMETHING_ELSE" });
    expect(h.self.skipWaiting).not.toHaveBeenCalled();

    h.dispatchMessage({ type: "SKIP_WAITING" });
    expect(h.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/sw-offline-behavior.test.ts`
Expected: FAIL — current `sw.js` calls `skipWaiting()` on install, so the flipped assertion and "does not skipWaiting on install" fail; "fires only on a SKIP_WAITING message" fails because there is no `message` listener yet.

- [ ] **Step 4: Edit `sw.js` — remove install skipWaiting, add the message handler**

In `static/sw.js`, the install handler currently ends with `self.skipWaiting();` at line 23. Change the block so install no longer skips, and add a message listener immediately after the install handler. Replace lines 13–24:

```js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // cache: "reload" bypasses the browser HTTP cache so a new SW never
      // precaches stale bytes it happens to have lying around.
      await cache.addAll(APP_SHELL_URLS.map((url) => new Request(url, { cache: "reload" })));
      await precacheBootChunks(cache);
      await precacheSvgAssets(cache);
    })
  );
  self.skipWaiting();
});
```

with:

```js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // cache: "reload" bypasses the browser HTTP cache so a new SW never
      // precaches stale bytes it happens to have lying around.
      await cache.addAll(APP_SHELL_URLS.map((url) => new Request(url, { cache: "reload" })));
      await precacheBootChunks(cache);
      await precacheSvgAssets(cache);
    })
  );
  // NOTE: no self.skipWaiting() here. Auto-skipWaiting made a new deploy take
  // over an already-open tab, serving new content-hashed chunks to old code
  // still in memory → 404 on the next lazy chunk. Instead the new SW WAITS;
  // the page posts SKIP_WAITING below only when the user clicks Reload. First
  // install has no controller to wait behind, so it activates immediately
  // anyway (no reload prompt shown — see sw-update-manager.ts).
});

// Activate the waiting worker on demand (user clicked "Reload" in the update
// toast). Mirrors static/legacy-sw.js:431.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/sw-offline-behavior.test.ts`
Expected: PASS — all install/precache/activate/SWR/navigation/timeout tests plus the new "sw.js update flow" block are green.

- [ ] **Step 6: Commit**

```bash
git add static/sw.js tests/helpers/sw-harness.ts tests/unit/sw-offline-behavior.test.ts
git commit -m "feat(sw): wait for update instead of silently skipWaiting

Install no longer force-activates over an open tab. skipWaiting now fires
only on a SKIP_WAITING message (user clicked Reload). Harness gains a
dispatchMessage driver; the install-skipWaiting assertion is flipped and
an update-flow describe added.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- static/sw.js tests/helpers/sw-harness.ts tests/unit/sw-offline-behavior.test.ts
```

---

## Task 2: `sw-update-manager.ts` — isolated, testable update detection

**Files:**
- Create: `src/lib/shared/offline/services/sw-update-manager.ts`
- Test: `src/lib/shared/offline/services/sw-update-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/offline/services/sw-update-manager.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createSwUpdateManager } from "./sw-update-manager";

class FakeWorker extends EventTarget {
  state: string = "installing";
  postMessage = vi.fn();
  setState(s: string) {
    this.state = s;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
  triggerUpdateFound(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeContainer extends EventTarget {
  controller: unknown = null;
  triggerControllerChange() {
    this.dispatchEvent(new Event("controllerchange"));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (x: unknown) => x as any;

describe("createSwUpdateManager", () => {
  it("fires onUpdateReady when a worker installs over an existing controller", () => {
    const container = new FakeContainer();
    container.controller = {}; // a SW already controls the page → this is an update
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const worker = new FakeWorker();
    registration.triggerUpdateFound(worker);
    worker.setState("installed");

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onUpdateReady on first install (no controller)", () => {
    const container = new FakeContainer(); // controller stays null
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const worker = new FakeWorker();
    registration.triggerUpdateFound(worker);
    worker.setState("installed");

    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("fires immediately when a worker is already waiting at construction", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("apply() posts SKIP_WAITING to the waiting worker", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    let applyFn: (() => void) | null = null;

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: (apply) => {
        applyFn = apply;
      },
      reload: vi.fn(),
    });

    applyFn!();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("reloads exactly once on controllerchange", () => {
    const container = new FakeContainer();
    const registration = new FakeRegistration();
    const reload = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: vi.fn(),
      reload,
    });

    container.triggerControllerChange();
    container.triggerControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/shared/offline/services/sw-update-manager.test.ts`
Expected: FAIL — `createSwUpdateManager` is not defined (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/lib/shared/offline/services/sw-update-manager.ts`:

```ts
/**
 * Service-worker update manager.
 *
 * Detects when a new SW has installed and is WAITING (a new deploy), prompts
 * the caller via an injected callback, applies the update on request, and
 * reloads the page exactly once when the new worker takes control.
 *
 * UI-agnostic by design: the prompt is a callback, so this is unit-testable
 * against a fake ServiceWorkerRegistration and never imports a component.
 * Wired in src/hooks.client.ts (production registration only).
 */

export interface SwUpdateManagerDeps {
  /** The registration returned by navigator.serviceWorker.register(). */
  registration: ServiceWorkerRegistration;
  /** Defaults to navigator.serviceWorker. Injectable for tests. */
  serviceWorker?: ServiceWorkerContainer;
  /**
   * Called once when an update is ready. Receives `apply`, which activates the
   * waiting worker (posts SKIP_WAITING). The caller shows UI and calls `apply`
   * when the user opts in.
   */
  onUpdateReady: (apply: () => void) => void;
  /** Defaults to a full-page reload. Injectable for tests. */
  reload?: () => void;
}

/**
 * Wire update detection for a registration. Returns a disposer that removes
 * all listeners (rarely needed — the app lives for the tab's lifetime).
 */
export function createSwUpdateManager(deps: SwUpdateManagerDeps): () => void {
  const { registration, onUpdateReady } = deps;
  const container = deps.serviceWorker ?? navigator.serviceWorker;
  const reload = deps.reload ?? (() => location.reload());

  let notified = false;
  let refreshing = false;

  const apply = () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  };

  const notify = () => {
    if (notified) return;
    notified = true;
    onUpdateReady(apply);
  };

  // Case A: a worker is already waiting when we wire up (installed on a prior
  // page view). A waiting worker only exists when one already controls the
  // page, so this is always a genuine update.
  if (registration.waiting && container.controller) {
    notify();
  }

  // Case B: a new worker begins installing now. Fire only once it reaches
  // "installed" AND a controller already exists — otherwise it is the very
  // first install, which should activate silently with no reload prompt.
  const onUpdateFound = () => {
    const installing = registration.installing;
    if (!installing) return;
    const onStateChange = () => {
      if (installing.state === "installed" && container.controller) {
        notify();
      }
    };
    installing.addEventListener("statechange", onStateChange);
  };
  registration.addEventListener("updatefound", onUpdateFound);

  // The new worker took control (after SKIP_WAITING) → reload once so the page
  // comes back on fresh code + fresh caches. Guard against a double-fire.
  const onControllerChange = () => {
    if (refreshing) return;
    refreshing = true;
    reload();
  };
  container.addEventListener("controllerchange", onControllerChange);

  // A long-lived tab discovers a new deploy when it regains focus. Cheap, no
  // timer to leak. update() rejections are non-fatal (offline, etc.).
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      registration.update().catch(() => {});
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  return () => {
    registration.removeEventListener("updatefound", onUpdateFound);
    container.removeEventListener("controllerchange", onControllerChange);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/shared/offline/services/sw-update-manager.test.ts`
Expected: PASS — all five cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/offline/services/sw-update-manager.ts src/lib/shared/offline/services/sw-update-manager.test.ts
git commit -m "feat(sw): isolated update manager (detect waiting worker, reload once)

Detects an installed-and-waiting SW over an existing controller, prompts
via an injected callback, applies via SKIP_WAITING, reloads once on
controllerchange. First install is silent. UI-agnostic + unit-tested.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/shared/offline/services/sw-update-manager.ts src/lib/shared/offline/services/sw-update-manager.test.ts
```

---

## Task 3: Toast primitive — optional action button

**Files:**
- Modify: `src/lib/shared/toast/state/toast-state.svelte.ts`
- Test: `src/lib/shared/toast/state/toast-state.test.ts` (new)
- Modify: `src/lib/shared/toast/components/ToastContainer.svelte`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/toast/state/toast-state.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { showToast, toastQueue, clearToasts } from "./toast-state.svelte";

afterEach(() => clearToasts());

describe("toast action passthrough", () => {
  it("attaches an action to the queued toast and runs its onClick", () => {
    const onClick = vi.fn();
    showToast({
      message: "New version available",
      type: "info",
      duration: 0,
      action: { label: "Reload", onClick },
    });

    const toast = toastQueue[toastQueue.length - 1];
    expect(toast.action?.label).toBe("Reload");

    toast.action?.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("leaves action undefined for a plain string toast", () => {
    showToast("hello");
    const toast = toastQueue[toastQueue.length - 1];
    expect(toast.action).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/shared/toast/state/toast-state.test.ts`
Expected: FAIL — `Toast.action` does not exist; `toast.action?.label` is undefined.

- [ ] **Step 3: Extend `toast-state.svelte.ts`**

In `src/lib/shared/toast/state/toast-state.svelte.ts`, add the `ToastAction` type and the optional `action` field. After the `ToastType` line (line 7), add:

```ts
export interface ToastAction {
  /** Button label, e.g. "Reload". */
  label: string;
  /** Runs when the action button is clicked. The toast is dismissed after. */
  onClick: () => void;
}
```

In the `Toast` interface, add after `imageUrl?: string;`:

```ts
  /** Optional action button (e.g. a Reload prompt). */
  action?: ToastAction;
```

In the `ShowToastOptions` interface, add after `imageUrl?: string;`:

```ts
  action?: ToastAction;
```

In `showToast`, add `action` to the built toast object. The `toast` literal currently ends with `imageUrl: options.imageUrl,`; add below it:

```ts
    action: options.action,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/shared/toast/state/toast-state.test.ts`
Expected: PASS — both cases green.

- [ ] **Step 5: Render the action button in `ToastContainer.svelte`**

In `src/lib/shared/toast/components/ToastContainer.svelte`, add the button inside `.toast-header`, between the message span and the close button. The current markup is:

```svelte
            <span class="toast-message">{toast.message}</span>
            <button
              class="toast-close accessible-touch-target"
              onclick={() => removeToast(toast.id)}
              aria-label="Dismiss"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
```

Insert the action button between the message and the close button:

```svelte
            <span class="toast-message">{toast.message}</span>
            {#if toast.action}
              <button
                class="toast-action accessible-touch-target"
                onclick={() => {
                  toast.action?.onClick();
                  removeToast(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            {/if}
            <button
              class="toast-close accessible-touch-target"
              onclick={() => removeToast(toast.id)}
              aria-label="Dismiss"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
```

Then add the `.toast-action` style inside the `<style>` block, after the `.toast-close:hover` rule (before the mobile `@media` block):

```css
  .toast-action {
    flex-shrink: 0;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1.5px solid var(--toast-color);
    background: color-mix(in srgb, var(--toast-color) 22%, transparent);
    color: var(--toast-text, var(--theme-text, white));
    font-size: var(--font-size-sm);
    font-weight: 700;
    cursor: pointer;
    transition: background var(--duration-fast);
    white-space: nowrap;
  }

  .toast-action:hover {
    background: color-mix(in srgb, var(--toast-color) 40%, transparent);
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/toast/state/toast-state.svelte.ts src/lib/shared/toast/state/toast-state.test.ts src/lib/shared/toast/components/ToastContainer.svelte
git commit -m "feat(toast): optional action button

Toast/ShowToastOptions gain an optional { label, onClick } action.
ToastContainer renders a real button (button affordance, 44px target)
that runs the action then dismisses. Powers the SW update Reload prompt.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/lib/shared/toast/state/toast-state.svelte.ts src/lib/shared/toast/state/toast-state.test.ts src/lib/shared/toast/components/ToastContainer.svelte
```

---

## Task 4: Wire the manager + Reload toast into `hooks.client.ts`

**Files:**
- Modify: `src/hooks.client.ts` (imports + prod registration block at `:195-213`)

No new test: this is pure wiring, covered by the manager's unit tests (Task 2) and the typecheck. Verified end-to-end at the Task 5 gate.

- [ ] **Step 1: Add the imports**

At the top of `src/hooks.client.ts`, alongside the existing imports, add:

```ts
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import { createSwUpdateManager } from "$lib/shared/offline/services/sw-update-manager";
```

- [ ] **Step 2: Wire the manager into the registration `.then`**

Replace the registration call (currently `:200-204`):

```ts
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .catch((err) => {
      console.error("[SW] Registration failed:", err);
    });
```

with:

```ts
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((registration) => {
      // Prompt to reload when a new deploy is waiting, rather than letting the
      // new SW silently take over this tab. See sw-update-manager.ts.
      createSwUpdateManager({
        registration,
        onUpdateReady: (apply) => {
          showToast({
            message: "A new version is available.",
            type: "info",
            duration: 0, // persistent — the user dismisses or reloads
            action: { label: "Reload", onClick: apply },
          });
        },
      });
    })
    .catch((err) => {
      console.error("[SW] Registration failed:", err);
    });
```

- [ ] **Step 3: Typecheck the touched file path (targeted)**

Run: `npx vitest run src/lib/shared/offline/services/sw-update-manager.test.ts src/lib/shared/toast/state/toast-state.test.ts`
Expected: PASS (sanity that imports resolve; full typecheck runs at Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/hooks.client.ts
git commit -m "feat(sw): show Reload toast when a new version is waiting

Wires createSwUpdateManager into the production SW registration; a waiting
update surfaces as a persistent info toast with a Reload button.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/hooks.client.ts
```

---

## Task 5: Verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run check`
Expected: no NEW errors in the files this plan touched (`sw-update-manager.ts`, `toast-state.svelte.ts`, `ToastContainer.svelte`, `hooks.client.ts`). Pre-existing errors in unrelated untracked files (e.g. `src/routes/test/effects-mobile/`) are not ours — do not fix them. If a NEW error is in our files, fix and re-run.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run tests/unit/sw-offline-behavior.test.ts src/lib/shared/offline/services/sw-update-manager.test.ts src/lib/shared/toast/state/toast-state.test.ts`
Expected: PASS — all three files green.

- [ ] **Step 3: Offline kit not regressed**

Run: `npm run build:fast && npm run verify:offline`
Expected: `OFFLINE KIT: INTACT` (all checks). The SW change must not break the precache/shell/manifest guarantees.

- [ ] **Step 4: Report the evidence**

Paste the check result (new-error count for our files), the vitest pass line, and the `verify:offline` summary. Do not claim "done" without these three outputs in the message.

---

## Self-Review

**Spec coverage:**
- Seam 1 (sw.js drop skipWaiting + message handler) → Task 1. ✅
- Seam 2 (sw-update-manager: waiting detection, first-install silence, apply, reload-once, visibility update) → Task 2. ✅
- Seam 3 (toast action extension + button render) → Task 3. ✅
- hooks.client wiring + Reload toast copy → Task 4. ✅
- Testing (flip install assertion, message test, manager unit tests) → Tasks 1 + 2. ✅
- SvelteKit `updated` interaction → resolved in the spec (polling off, store unused); no task needed. ✅
- Non-goal (offline write queue) → nothing built. ✅
- Verification (check, tests, verify:offline) → Task 5. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step carries full code. ✅

**Type consistency:** `createSwUpdateManager(SwUpdateManagerDeps)` signature identical across Task 2 def, Task 2 tests, Task 4 call. `ToastAction { label, onClick }` identical across Task 3 type, test, container, Task 4 call. `apply: () => void` consistent. `dispatchMessage(data)` matches its harness definition and test use. ✅

**Deviation note:** The spec said "flip `sw-offline-behavior.test.ts:56`." The plan does exactly that (assertion inverted to `.not.toHaveBeenCalled()`) AND adds a dedicated `sw.js update flow` describe for the message path — stronger coverage, same guarantee. Intentional.
