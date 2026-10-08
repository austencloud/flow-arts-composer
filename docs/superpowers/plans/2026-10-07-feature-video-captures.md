# Feature Video Captures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command records a scripted pass through the app in the dedicated capture Chrome, encodes it to a 1080 by 1920 MP4 inside a feature video's `media/captures/` folder, and puts it in the project as a take: a new take the first time, the same take pointed at the new file on every re-record.

**Architecture:** `scripts/lib/chrome-cdp.mjs` gains a bounded event buffer (`cdp-event-buffer.mjs`) so a reader can collect `Page.screencastFrame` events. A small page port (`evaluate`, `fillByRole`, `url`, `snapshot`) lets the existing recording director run on raw CDP as well as on the Codex runtime it was written for. The director and `encode-frames.py` take a frames folder, an output size and an output file. A new `relink-take` op points an existing take at a new file and cuts its clips back when the file is shorter. Two CLI commands (`capture-info`, `link-capture`) do all server talk; the runner `capture.mjs` records, encodes and calls them.

**Tech Stack:** Node 24 (global `WebSocket`), raw Chrome DevTools Protocol, Python 3.13 and ffmpeg 8.0.1 for encoding, Zod 4.3, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-06-feature-video-pipeline-design.md`, piece 3.

**Depends on:** plans 1 and 2, both on local `main`. Base of this branch: `main` at `2f5d859e2f`.

**Where this plan departs from the spec:**

- **Capture size.** Changed after Task 8 (2026-10-07): each recording now runs in a private headless Chrome started at the script's own scale, so the spec's 432 by 768 at 2.5 gives 1080 by 1920 frames, and the 1.5 cap and the 9223 capture Chrome were dropped. The 1.5 limit described next came from the Windows display scale of a windowed Chrome, not from the screencast, and 720 by 1280 changes the app's layout. Original note: The spec says 432 by 768 CSS pixels at device scale 2.5. Chrome's screencast stops at 1.5 times the CSS viewport, so that setting delivers 648 by 1152 frames (measured 2026-10-07). A 720 by 1280 viewport at 1.5 delivers exactly 1080 by 1920. A capture script therefore declares a device scale of at most 1.5, and the runner refuses anything higher. Taking one screenshot per frame instead reached only about 3 frames a second at that size.
- **Server talk goes through two CLI commands.** `capture-info` reports the project's folder, the capture files already there and the takes. `link-capture` probes a recorded file and sends `relink-take` or `add-take`. The runner never calls the dev server itself, so the CLI stays the one place that knows the routes and the self-signed certificate.
- **The bridge guard** (`post-project-bridge-guard.ts`) stops treating a feature video take's timing as locked. The spec's test line "timing changes are still refused" now holds for every take except a feature video's own, because `relink-take` has to move its timing.
- **No Re-record button.** The spec makes it the last, optional step. This plan leaves it out, so integration uses `--nonvisual`.
- **Page port is four methods.** The spec lists six. `getAttribute` is not needed once `cell()` reads labels with `evaluate`, and `pressKey` is part of `fillByRole` (`commitKey`).

---

## Ground rules for every task

- Work only in `E:/worktrees/tka-platform/feature-video-captures` on branch `codex/feature-video-captures`. Never edit, stage or commit anything in `E:/tka-platform`.
- Never run `pnpm install` or `npm install`. Never delete, move or recreate `node_modules`: it is a junction into the primary checkout.
- Never start a dev server and never touch port 5173. Never touch port 9222 or any Chrome you did not start. Tasks 1 to 7 need no browser. The coordinator does the real recording.
- Run tests from the worktree root with `npx vitest run --config tests/config/vitest.config.ts <files>`. The config runs jsdom; do not add `@vitest-environment` comments. Tests that need ffmpeg or Python find ffmpeg through `FFMPEG_DIR`, then `C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin`, then `PATH`, and skip without it. A skipped test is a result to report, not a pass.
- Each edit to an existing file is a **Find** block and its replacement. The Find text must occur exactly once in the file, whitespace included. When it occurs zero times or more than once, stop and report it; never guess where an edit goes. Apply a task's edits in the order given.
- Commit only the paths the task names: `git add <paths>`, then `git commit -m "<message>" -- <paths>`. End every commit message with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never use `git add -A`, `git add .`, `git add -u`, `git stash`, `git reset --hard`, `git checkout --`, `git clean`, or any force flag.
- Format each touched `.ts`, `.mjs` and `.md`-free code file with `npx prettier --write <files>` before committing. Do not prettier-format this plan.
- Comments, messages and interface text use plain words: no em dashes, and none of robust, comprehensive, crucial, seamless, leverage, navigate, landscape, delve, utilize.
- When a command's output differs from the step's expected output for a reason the step does not explain, stop and report the output instead of improvising.

## Coordinator steps outside the tasks

The coordinator (the session running this plan) does these; implementers skip them.

1. Worktree: already made at `E:/worktrees/tka-platform/feature-video-captures`, `node_modules` is a junction to the primary checkout, branch `codex/feature-video-captures`, merged with `main` at `2f5d859e2f`.
2. Before Task 1, pass the resource gate in `.claude/rules/resource-budget.md` (at least 4096 MB free, no other `svelte-check` running) and record `npm run check:fast -- --no-svelte-warnings` output so the end can be compared.
3. After Task 8, run the real recording described in **Task 9**, then the Opus review, then `npm run wt:finish -- codex/feature-video-captures --nonvisual` from `E:/tka-platform`.

---

## File map

| File | What it owns |
| --- | --- |
| `scripts/lib/cdp-event-buffer.mjs` (new) | A bounded, numbered buffer of CDP events and the read that returns events after a cursor |
| `scripts/lib/chrome-cdp.mjs` | Gains `readEvents`, buffered event names on `connect` and `openTab`, and a `mobile` flag on `setViewport` |
| `scripts/feature-video/capture/cdp-page.mjs` (new) | The page port on raw CDP |
| `scripts/feature-video/capture/codex-page.mjs` (new) | The page port on the Codex Browser runtime tab |
| `scripts/demo-capture/browser-director.mjs` | The recording director, now on the page port, with a frames folder, output size and a pointer rest point that follows the viewport |
| `scripts/demo-capture/encode-frames.py` | Frames to MP4; gains `--frames-dir`, `--out-dir`, `--output`, `--size` |
| `src/lib/shared/media-composition/domain/post-project-edits.ts` | `replaceTakeMedia` gains `clamp` |
| `src/lib/shared/media-composition/domain/post-project-ops.ts` | The `relink-take` op |
| `src/lib/shared/media-composition/domain/post-project-bridge-guard.ts` | Feature video take timings may change |
| `scripts/feature-video/capture-files.mjs` (new) | Capture ids, `captures/<id>.<n>.mp4` names, finding a capture's take |
| `scripts/post-project.mjs` | `capture-info` and `link-capture` commands |
| `scripts/feature-video/capture.mjs` (new) | The runner |
| `docs/architecture/canonical-capabilities.md`, `docs/development/post-studio-manifest-bridge.md` | The new commands |

New tests live in `tests/unit/scripts/` (scripts) and `tests/unit/media-composition/` (domain and CLI).

---

### Task 1: Event buffer in the CDP client

**Files:**
- Create: `scripts/lib/cdp-event-buffer.mjs`
- Create: `tests/unit/scripts/cdp-event-buffer.test.ts`
- Modify: `scripts/lib/chrome-cdp.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/cdp-event-buffer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEventBuffer } from "../../../scripts/lib/cdp-event-buffer.mjs";

describe("createEventBuffer", () => {
  it("starts reading from now when no cursor is given", async () => {
    const buffer = createEventBuffer();
    buffer.push("Page.screencastFrame", { n: 1 });
    expect(await buffer.read({ methods: ["Page.screencastFrame"] })).toEqual({
      cursor: 1,
      events: [],
      hasMore: false,
      truncated: false,
    });
  });

  it("returns the matching events after a cursor, in order", async () => {
    const buffer = createEventBuffer();
    buffer.push("A", { n: 1 });
    buffer.push("B", { n: 2 });
    buffer.push("A", { n: 3 });
    const batch = await buffer.read({ methods: ["A"], afterSequence: 0 });
    expect(batch.events.map((event: { params: { n: number } }) => event.params.n)).toEqual([1, 3]);
    expect(batch.cursor).toBe(3);
    expect(batch.hasMore).toBe(false);
    const next = await buffer.read({ methods: ["A"], afterSequence: batch.cursor });
    expect(next.events).toEqual([]);
  });

  it("stops at the limit and moves the cursor only past what it returned", async () => {
    const buffer = createEventBuffer();
    for (let n = 1; n <= 5; n++) buffer.push("A", { n });
    const first = await buffer.read({ afterSequence: 0, limit: 2 });
    expect(first.events).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toBe(2);
    const second = await buffer.read({ afterSequence: first.cursor, limit: 10 });
    expect(second.events).toHaveLength(3);
    expect(second.hasMore).toBe(false);
    expect(second.cursor).toBe(5);
  });

  it("says so when it dropped events the reader had not read", async () => {
    const buffer = createEventBuffer({ capacity: 3 });
    for (let n = 1; n <= 6; n++) buffer.push("A", { n });
    expect((await buffer.read({ afterSequence: 0 })).truncated).toBe(true);
    expect((await buffer.read({ afterSequence: 3 })).truncated).toBe(false);
    expect((await buffer.read({ afterSequence: 6 })).truncated).toBe(false);
  });

  it("waits up to timeoutMs for an event that has not arrived", async () => {
    const buffer = createEventBuffer();
    const pending = buffer.read({ afterSequence: 0, timeoutMs: 500 });
    setTimeout(() => buffer.push("A", { n: 1 }), 20);
    expect((await pending).events).toHaveLength(1);
    const started = Date.now();
    const empty = await buffer.read({ afterSequence: 1, timeoutMs: 60 });
    expect(empty.events).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/cdp-event-buffer.test.ts`
Expected: FAIL, the import of `cdp-event-buffer.mjs` cannot be resolved.

- [ ] **Step 3: Write the buffer**

Create `scripts/lib/cdp-event-buffer.mjs`:

```js
/**
 * A bounded buffer of Chrome DevTools Protocol events, each numbered, so a
 * reader can ask for everything after the last event it saw and be told when
 * the buffer dropped events it never read.
 *
 * The chrome-cdp client drops events by default. A recording needs
 * `Page.screencastFrame`, so `connect` keeps the event names it is asked to
 * keep in one of these.
 */

export function createEventBuffer({ capacity = 300 } = {}) {
  const events = [];
  const waiters = new Set();
  let last = 0;

  function push(method, params) {
    events.push({ sequence: ++last, method, params });
    if (events.length > capacity) events.shift();
    for (const wake of [...waiters]) wake();
  }

  function collect(methods, afterSequence, limit) {
    const oldest = events.length > 0 ? events[0].sequence : last + 1;
    const matching = events.filter(
      (event) =>
        event.sequence > afterSequence &&
        (!methods || methods.includes(event.method))
    );
    const batch = matching.slice(0, limit);
    const hasMore = matching.length > batch.length;
    return {
      cursor: hasMore ? batch[batch.length - 1].sequence : last,
      events: batch,
      hasMore,
      truncated: afterSequence + 1 < oldest,
    };
  }

  /**
   * With no `afterSequence`, returns no events and a cursor at the present,
   * so the next read sees only what happens from here. With one, returns up
   * to `limit` matching events after it. When there are none and `timeoutMs`
   * is above 0, waits that long for one to arrive.
   */
  async function read({
    methods,
    afterSequence,
    limit = 100,
    timeoutMs = 0,
  } = {}) {
    if (afterSequence === undefined) {
      return { cursor: last, events: [], hasMore: false, truncated: false };
    }
    const now = collect(methods, afterSequence, limit);
    if (now.events.length > 0 || timeoutMs <= 0) return now;
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiters.delete(wake);
        resolve();
      };
      const wake = () => {
        if (collect(methods, afterSequence, 1).events.length > 0) done();
      };
      const timer = setTimeout(done, timeoutMs);
      waiters.add(wake);
    });
    return collect(methods, afterSequence, limit);
  }

  return { push, read };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/cdp-event-buffer.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the buffer into `chrome-cdp.mjs`**

Edit `scripts/lib/chrome-cdp.mjs`. Apply these six edits in order.

Find:
```js
import { writeFileSync } from "node:fs";
```
Replace with:
```js
import { writeFileSync } from "node:fs";
import { createEventBuffer } from "./cdp-event-buffer.mjs";
```

Find:
```js
export async function connect(webSocketDebuggerUrl) {
```
Replace with:
```js
export async function connect(
  webSocketDebuggerUrl,
  { bufferEvents = [], eventCapacity } = {}
) {
```

Find:
```js
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolver = pending.get(message.id);
```
Replace with:
```js
  let nextId = 1;
  const pending = new Map();
  const buffer = createEventBuffer({ capacity: eventCapacity });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined && message.method !== undefined) {
      if (bufferEvents.includes(message.method))
        buffer.push(message.method, message.params);
      return;
    }
    const resolver = pending.get(message.id);
```

Find:
```js
    close() {
      socket.close();
    },
  };
}
```
Replace with:
```js
    /**
     * Events named in `bufferEvents` when this connection opened, as
     * `{ cursor, events, hasMore, truncated }`; see cdp-event-buffer.mjs.
     */
    readEvents(options) {
      return buffer.read(options);
    },
    close() {
      socket.close();
    },
  };
}
```

Find:
```js
export async function setViewport(client, { width, height, dpr = 1 }) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: false,
  });
}
```
Replace with:
```js
export async function setViewport(
  client,
  { width, height, dpr = 1, mobile = false }
) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile,
  });
}
```

Find:
```js
export async function openTab(url, { port = DEFAULT_PORT } = {}) {
```
Replace with:
```js
export async function openTab(
  url,
  { port = DEFAULT_PORT, bufferEvents, eventCapacity } = {}
) {
```

Find:
```js
  const page = await connect(target.webSocketDebuggerUrl);
```
Replace with:
```js
  const page = await connect(target.webSocketDebuggerUrl, {
    bufferEvents,
    eventCapacity,
  });
```

- [ ] **Step 6: Check the client still loads and the importers still work**

Run: `node -e "import('./scripts/lib/chrome-cdp.mjs').then(m => console.log(Object.keys(m).sort().join(',')))"`
Expected: `capture,captureClip,connect,delay,evaluate,isDebugChromeRunning,navigate,openTab,setViewport,waitFor`

Run: `node --check scripts/capture-seraphic-vault-gate4.mjs && node --check scripts/capture-ember-atmosphere-evidence.mjs`
Expected: no output (both parse).

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write scripts/lib/cdp-event-buffer.mjs scripts/lib/chrome-cdp.mjs tests/unit/scripts/cdp-event-buffer.test.ts
git add scripts/lib/cdp-event-buffer.mjs scripts/lib/chrome-cdp.mjs tests/unit/scripts/cdp-event-buffer.test.ts
git commit -m "feat(capture): CDP client keeps a numbered event buffer for screencast frames" -- scripts/lib/cdp-event-buffer.mjs scripts/lib/chrome-cdp.mjs tests/unit/scripts/cdp-event-buffer.test.ts
```

---

### Task 2: The page port and its two adapters

**Files:**
- Create: `scripts/feature-video/capture/cdp-page.mjs`
- Create: `scripts/feature-video/capture/codex-page.mjs`
- Create: `tests/unit/scripts/capture-page-port.test.ts`

The page port is what the director needs from a page: `evaluate(fn, arg)` runs a function in the page and returns its value, `fillByRole({ role, name, value, commitKey })` types into a labelled field and optionally presses a key, `url()` and `snapshot()` describe the page. `fn` must not use variables from outside itself; it is sent to the page as text.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/capture-page-port.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCdpPage } from "../../../scripts/feature-video/capture/cdp-page.mjs";
import { createCodexPage } from "../../../scripts/feature-video/capture/codex-page.mjs";

type Call = [string, Record<string, unknown>];

/** A CDP client that runs Runtime.evaluate in the jsdom this test runs in. */
function jsdomClient() {
  const calls: Call[] = [];
  return {
    calls,
    async send(method: string, params: Record<string, unknown> = {}) {
      calls.push([method, params]);
      if (method === "Runtime.evaluate") {
        try {
          return { result: { value: (0, eval)(String(params.expression)) } };
        } catch (error) {
          return { exceptionDetails: { exception: { description: String(error) } } };
        }
      }
      return {};
    },
  };
}

describe("createCdpPage", () => {
  const original = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }) as DOMRect;
    document.body.innerHTML =
      '<label>Zoom <input id="zoom" type="number" aria-label="Zoom"></label>' +
      '<input id="other" type="number" aria-label="Other">';
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
    document.body.innerHTML = "";
  });

  it("runs a function in the page with an argument and returns its value", async () => {
    const page = createCdpPage(jsdomClient());
    expect(await page.evaluate((n: number) => n * 2, 21)).toBe(42);
  });

  it("throws what the page threw", async () => {
    const page = createCdpPage(jsdomClient());
    await expect(
      page.evaluate(() => {
        throw new Error("nope");
      })
    ).rejects.toThrow(/nope/);
  });

  it("focuses the field with that label, types into it and presses the commit key", async () => {
    const client = jsdomClient();
    const page = createCdpPage(client);
    await page.fillByRole({ role: "spinbutton", name: "Zoom", value: 1.4, commitKey: "Tab" });
    expect(document.activeElement?.id).toBe("zoom");
    const methods = client.calls.map(([method]) => method);
    expect(methods).toEqual([
      "Runtime.evaluate",
      "Input.insertText",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
    ]);
    expect(client.calls[1]?.[1]).toEqual({ text: "1.4" });
    expect(client.calls[2]?.[1]).toMatchObject({ type: "keyDown", key: "Tab", windowsVirtualKeyCode: 9 });
    expect(client.calls[3]?.[1]).toMatchObject({ type: "keyUp", key: "Tab" });
  });

  it("names the field it could not find", async () => {
    const page = createCdpPage(jsdomClient());
    await expect(
      page.fillByRole({ role: "spinbutton", name: "Missing", value: 1 })
    ).rejects.toThrow('No visible spinbutton named "Missing"');
  });

  it("refuses a commit key it does not know", async () => {
    const page = createCdpPage(jsdomClient());
    await expect(
      page.fillByRole({ role: "spinbutton", name: "Zoom", value: 1, commitKey: "F13" })
    ).rejects.toThrow(/F13/);
  });

  it("reports the url and a snapshot", async () => {
    const page = createCdpPage(jsdomClient());
    expect(await page.url()).toContain("http");
    const snapshot = await page.snapshot();
    expect(snapshot.controls).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Zoom" })])
    );
  });
});

describe("createCodexPage", () => {
  it("maps the port onto the Codex runtime tab", async () => {
    const press = vi.fn();
    const fill = vi.fn();
    const getByRole = vi.fn(() => ({ fill, press }));
    const tab = {
      url: async () => "https://localhost:5173/post",
      playwright: {
        evaluate: vi.fn(async (fn: (n: number) => number, arg: number) => fn(arg)),
        getByRole,
        domSnapshot: async () => "- main",
      },
    };
    const page = createCodexPage(tab);
    expect(await page.evaluate((n: number) => n + 1, 1)).toBe(2);
    await page.fillByRole({ role: "spinbutton", name: "Zoom", value: 1.4, commitKey: "Tab" });
    expect(getByRole).toHaveBeenCalledWith("spinbutton", { name: "Zoom", exact: true });
    expect(fill).toHaveBeenCalledWith("1.4");
    expect(press).toHaveBeenCalledWith("Tab");
    expect(await page.url()).toBe("https://localhost:5173/post");
    expect(await page.snapshot()).toBe("- main");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/capture-page-port.test.ts`
Expected: FAIL, the adapter modules cannot be resolved.

- [ ] **Step 3: Write the raw CDP adapter**

Create `scripts/feature-video/capture/cdp-page.mjs`:

```js
import { evaluate } from "../../lib/chrome-cdp.mjs";

/**
 * The page port on raw Chrome DevTools Protocol, for a client from
 * `openTab` in scripts/lib/chrome-cdp.mjs. The recording director talks to a
 * page only through this port: evaluate, fillByRole, url and snapshot.
 */

const KEYS = {
  Tab: { code: "Tab", keyCode: 9 },
  Enter: { code: "Enter", keyCode: 13 },
  Escape: { code: "Escape", keyCode: 27 },
  Backspace: { code: "Backspace", keyCode: 8 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
};

/** Runs in the page: focuses and selects the visible field with this role and name. */
function focusField({ role, name }) {
  const selectors = {
    spinbutton: 'input[type="number"],[role="spinbutton"]',
    textbox:
      'input:not([type]),input[type="text"],textarea,[role="textbox"]',
    slider: 'input[type="range"],[role="slider"]',
  };
  const selector = selectors[role] ?? `[role="${role}"]`;
  const labelOf = (element) =>
    element.getAttribute("aria-label") ??
    element.labels?.[0]?.textContent?.trim() ??
    element.getAttribute("title") ??
    "";
  const field = [...document.querySelectorAll(selector)].find(
    (candidate) =>
      !candidate.closest("[inert]") &&
      candidate.getBoundingClientRect().width &&
      labelOf(candidate) === name
  );
  if (!field) throw new Error(`No visible ${role} named "${name}"`);
  field.focus();
  field.select?.();
  return true;
}

/** Runs in the page: what the page says about itself, kept small. */
function describePage() {
  const controls = [
    ...document.querySelectorAll("button,a,input,select,textarea,[role]"),
  ]
    .filter((element) => element.getBoundingClientRect().width)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label:
        element.getAttribute("aria-label") ??
        element.textContent?.trim().slice(0, 80) ??
        "",
    }));
  return {
    title: document.title,
    text: (document.body.innerText ?? document.body.textContent ?? "").slice(0, 20000),
    controls,
  };
}

export function createCdpPage(client) {
  /** Runs `fn(arg)` in the page and returns its value. `fn` must be self-contained. */
  function run(fn, arg) {
    return evaluate(client, `(${fn.toString()})(${JSON.stringify(arg ?? null)})`);
  }

  async function pressKey(key) {
    const known = KEYS[key];
    if (!known && key.length !== 1)
      throw new Error(
        `pressKey does not know "${key}". It knows ${Object.keys(KEYS).join(", ")} and single characters.`
      );
    const base = known
      ? { key, code: known.code, windowsVirtualKeyCode: known.keyCode }
      : { key, text: key };
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  async function fillByRole({ role, name, value, commitKey }) {
    if (commitKey && !KEYS[commitKey] && commitKey.length !== 1)
      throw new Error(`pressKey does not know "${commitKey}".`);
    await run(focusField, { role, name });
    await client.send("Input.insertText", { text: String(value) });
    if (commitKey) await pressKey(commitKey);
  }

  return {
    evaluate: run,
    fillByRole,
    url: () => run(() => window.location.href),
    snapshot: () => run(describePage),
  };
}
```

- [ ] **Step 4: Write the Codex adapter**

Create `scripts/feature-video/capture/codex-page.mjs`:

```js
/**
 * The page port on the Codex Browser runtime tab, which is what
 * scripts/demo-capture/browser-director.mjs was first written against. Pass
 * the tab the Node REPL's Browser runtime hands out.
 */
export function createCodexPage(tab) {
  const field = ({ role, name }) =>
    tab.playwright.getByRole(role, { name, exact: true });
  return {
    evaluate: (fn, arg) => tab.playwright.evaluate(fn, arg),
    async fillByRole({ role, name, value, commitKey }) {
      const locator = field({ role, name });
      await locator.fill(String(value));
      if (commitKey) await locator.press(commitKey);
    },
    url: () => tab.url(),
    snapshot: () => tab.playwright.domSnapshot(),
  };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/capture-page-port.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write scripts/feature-video/capture/cdp-page.mjs scripts/feature-video/capture/codex-page.mjs tests/unit/scripts/capture-page-port.test.ts
git add scripts/feature-video/capture tests/unit/scripts/capture-page-port.test.ts
git commit -m "feat(capture): a page port with raw CDP and Codex adapters" -- scripts/feature-video/capture tests/unit/scripts/capture-page-port.test.ts
```

---

### Task 3: The director runs on the page port

**Files:**
- Modify (replace whole file): `scripts/demo-capture/browser-director.mjs`
- Create: `tests/unit/scripts/browser-director.test.ts`

The director keeps its behavior and its return values. What changes: it takes a page port, a frames folder, an output size, and parks the pointer at a point that follows the viewport. At 1920 by 1080 the rest point is still (1145, 1020).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/browser-director.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDirector } from "../../../scripts/demo-capture/browser-director.mjs";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "director-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const frameEvent = (n: number, timestamp: number) => ({
  params: {
    sessionId: n,
    data: Buffer.from(`frame-${n}`).toString("base64"),
    metadata: { timestamp },
  },
});

function fakes(view = { width: 1920, height: 1080 }) {
  const sent: [string, Record<string, unknown>][] = [];
  const cdp = {
    send: vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
      sent.push([method, params]);
      return {};
    }),
    readEvents: vi.fn(async (options: { afterSequence?: number } = {}) => {
      if (options.afterSequence === undefined)
        return { cursor: 0, events: [], hasMore: false, truncated: false };
      const events = options.afterSequence < 2 ? [frameEvent(1, 10), frameEvent(2, 10.1)] : [];
      return { cursor: 2, events, hasMore: false, truncated: false };
    }),
  };
  const page = {
    evaluate: vi.fn(async (fn: () => unknown) => {
      if (fn.toString().includes("innerWidth")) return view;
      throw new Error("unexpected evaluate");
    }),
    fillByRole: vi.fn(),
    url: async () => "https://localhost:5173/create/construct",
    snapshot: async () => ({ title: "Construct" }),
  };
  return { cdp, page, sent };
}

describe("createDirector shot", () => {
  it("writes frames and a capture.json where the options say, at the size asked for", async () => {
    const { cdp, page, sent } = fakes({ width: 720, height: 1280 });
    const framesDir = path.join(root, "captures", "frames");
    const director = createDirector(page, cdp, root, {
      framesDir,
      size: { width: 1080, height: 1920 },
    });
    const result = await director.shot("builder", 0.1);
    expect(result.frames).toBe(2);
    const files = await fs.readdir(path.join(framesDir, "builder"));
    expect(files.sort()).toEqual(["00000.jpg", "00001.jpg", "capture.json"]);
    const proof = JSON.parse(await fs.readFile(path.join(framesDir, "builder", "capture.json"), "utf8"));
    expect(proof.frames).toEqual([
      { file: "00000.jpg", timestamp: 10 },
      { file: "00001.jpg", timestamp: 10.1 },
    ]);
    expect(proof.url).toBe("https://localhost:5173/create/construct");
    const start = sent.find(([method]) => method === "Page.startScreencast");
    expect(start?.[1]).toMatchObject({ maxWidth: 1080, maxHeight: 1920, format: "jpeg" });
    expect(sent.filter(([method]) => method === "Page.screencastFrameAck")).toHaveLength(2);
  });

  it("parks the pointer in proportion to the viewport", async () => {
    const small = fakes({ width: 720, height: 1280 });
    await createDirector(small.page, small.cdp, root).shot("a", 0.05);
    const moved = small.sent.filter(([method]) => method === "Input.dispatchMouseEvent");
    expect(moved[0]?.[1]).toMatchObject({ type: "mouseMoved", x: 429, y: 1209 });

    const desktop = fakes();
    await createDirector(desktop.page, desktop.cdp, root).shot("b", 0.05);
    const first = desktop.sent.find(([method]) => method === "Input.dispatchMouseEvent");
    expect(first?.[1]).toMatchObject({ x: 1145, y: 1020 });
  });

  it("defaults to the old folder and 1920 by 1080", async () => {
    const { cdp, page, sent } = fakes();
    await createDirector(page, cdp, root).shot("old", 0.05);
    await fs.access(path.join(root, "production", "frames", "old", "capture.json"));
    const start = sent.find(([method]) => method === "Page.startScreencast");
    expect(start?.[1]).toMatchObject({ maxWidth: 1920, maxHeight: 1080 });
  });

  it("keeps the frames and records the failure when the action throws", async () => {
    const { cdp, page } = fakes();
    const director = createDirector(page, cdp, root);
    await expect(
      director.shot("broken", 0.05, async () => {
        throw new Error("button missing");
      })
    ).rejects.toThrow("button missing");
    const proof = JSON.parse(
      await fs.readFile(path.join(root, "production", "frames", "broken", "capture.json"), "utf8")
    );
    expect(proof.failure).toContain("button missing");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/browser-director.test.ts`
Expected: FAIL (the current director calls `tab.playwright` and has no `options` argument).

- [ ] **Step 3: Replace the director**

Replace the whole of `scripts/demo-capture/browser-director.mjs` with:

```js
import fs from "node:fs/promises";
import path from "node:path";

/** Where the pointer rests between shots, as fractions of the viewport: 1145 by 1020 on a 1920 by 1080 window. */
const REST = { x: 1145 / 1920, y: 1020 / 1080 };
const DEFAULT_SIZE = { width: 1920, height: 1080 };

/**
 * Drives a page the way a person would, with a pointer that moves before it
 * clicks, and records it with Chrome's screencast.
 *
 * - `page`: the page port (evaluate, fillByRole, url, snapshot) from
 *   scripts/feature-video/capture/cdp-page.mjs or codex-page.mjs.
 * - `cdp`: a chrome-cdp client with `send` and `readEvents`, opened with
 *   `Page.screencastFrame` in `bufferEvents`.
 * - `options.framesDir`: where each shot's frames go, one folder per shot id.
 *   Defaults to `<root>/production/frames`.
 * - `options.size`: the largest frame the screencast may deliver. Chrome
 *   stops at 1.5 times the CSS viewport, so pick a viewport that makes that
 *   the size you want. Defaults to 1920 by 1080.
 */
export function createDirector(page, cdp, root, options = {}) {
  const framesDir =
    options.framesDir ?? path.join(root, "production", "frames");
  const size = options.size ?? DEFAULT_SIZE;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let recording = null;
  async function pump() {
    if (!recording) return;
    const batch = await cdp.readEvents({
      methods: ["Page.screencastFrame"],
      afterSequence: recording.cursor,
      limit: 100,
      timeoutMs: 0,
    });
    recording.cursor = batch.cursor;
    if (batch.truncated) throw Error("Screencast event buffer truncated");
    for (const event of batch.events) {
      await cdp.send("Page.screencastFrameAck", {
        sessionId: event.params.sessionId,
      });
      const file = String(recording.frames.length).padStart(5, "0") + ".jpg";
      await fs.writeFile(
        path.join(recording.dir, file),
        Buffer.from(event.params.data, "base64")
      );
      recording.frames.push({
        file,
        timestamp: event.params.metadata.timestamp,
      });
    }
  }
  async function wait(ms) {
    const until = Date.now() + ms;
    do {
      await pump();
      await sleep(10);
    } while (Date.now() < until);
  }
  let pointer = null;
  let events = [];
  let started = 0;

  async function restPoint() {
    const view = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    return {
      x: Math.round(view.width * REST.x),
      y: Math.round(view.height * REST.y),
    };
  }

  async function move(x, y) {
    pointer ??= await restPoint();
    const from = { ...pointer };
    const start = Date.now();
    do {
      const t = Math.min(1, (Date.now() - start) / 540);
      const amount = t * t * (3 - 2 * t);
      pointer = {
        x: from.x + (x - from.x) * amount,
        y: from.y + (y - from.y) * amount,
      };
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...pointer,
      });
      if (t >= 1) break;
      await wait(16);
    } while (true);
  }

  async function target(label) {
    const rect = await page.evaluate((label) => {
      const el = [
        ...document.querySelectorAll('button,a,input,[role="radio"]'),
      ].find(
        (e) =>
          !e.closest("[inert]") &&
          e.getBoundingClientRect().width &&
          (e.getAttribute("aria-label") === label ||
            e.textContent?.trim() === label ||
            e.querySelector(".chip-label")?.textContent?.trim() === label)
      );
      if (!el) throw Error("Missing visible target " + label);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest("[inert]"))
        throw Error("Target is not visible");
      return { x: r.x + r.width * 0.65, y: r.y + r.height * 0.65 };
    }, label);
    await move(rect.x, rect.y);
    await wait(240);
    const hovered = await page.evaluate(
      (label) =>
        [...document.querySelectorAll(":hover")].some(
          (e) =>
            e.getAttribute("aria-label") === label ||
            e.textContent?.trim() === label ||
            e.querySelector(".chip-label")?.textContent?.trim() === label
        ),
      label
    );
    if (!hovered) throw Error("Native hover did not reach " + label);
  }

  async function press() {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...pointer,
    });
    await wait(140);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...pointer,
    });
    await wait(200);
  }

  async function click(label) {
    await target(label);
    events.push({
      label,
      action: "click",
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
    await press();
  }

  async function fill(label, value) {
    await target(label);
    await page.fillByRole({
      role: "spinbutton",
      name: label,
      value,
      commitKey: "Tab",
    });
    events.push({
      label,
      action: "fill",
      value,
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
  }

  async function cell(index = 3) {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((e) => !e.closest("[inert]") && e.getBoundingClientRect().width)
        .map((e) => e.getAttribute("aria-label") || e.textContent?.trim() || "")
        .filter((label) => / over /.test(label))
    );
    if (index >= labels.length) throw Error("Missing matrix crossing");
    await click(labels[index]);
  }

  async function mountPointer() {
    await cdp.send("Runtime.evaluate", {
      expression:
        "window.removeCapturePointer?.(); import('/scripts/demo-capture/mount-pointer.ts').then(m=>{window.removeCapturePointer=m.mountCapturePointer()})",
      awaitPromise: true,
    });
    pointer ??= await restPoint();
    await move(pointer.x, pointer.y);
  }

  async function canvas() {
    const point = await page.evaluate(() => {
      const el = [...document.querySelectorAll("canvas")].find(
        (e) => !e.closest("[inert]") && e.getBoundingClientRect().width
      );
      if (!el) throw Error("No visible animation canvas");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await move(point.x, point.y);
    await wait(240);
    const hovered = await page.evaluate(
      () => !!document.querySelector(".canvas-wrapper:hover")
    );
    if (!hovered) throw Error("Native hover missed animation canvas");
    events.push({
      label: "Animation canvas",
      action: "click",
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
    await press();
  }

  async function shot(id, seconds, action) {
    const dir = path.join(framesDir, id);
    await fs.mkdir(dir, { recursive: true });
    const rest = await restPoint();
    await move(rest.x, rest.y);
    events = [];
    const initial = await cdp.readEvents({ methods: ["Page.screencastFrame"] });
    const frames = [];
    recording = { dir, frames, cursor: initial.cursor };
    started = Date.now();
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 90,
      maxWidth: size.width,
      maxHeight: size.height,
      everyNthFrame: 1,
    });
    let failure;
    try {
      if (action) await action();
      await wait(
        Math.max(action ? 2500 : 0, seconds * 1000 - (Date.now() - started))
      );
    } catch (error) {
      failure = String(error);
    } finally {
      await pump();
      await cdp.send("Page.stopScreencast");
      recording = null;
    }
    const proof = {
      id,
      requestedDuration: seconds,
      elapsed: (Date.now() - started) / 1000,
      events,
      frames,
      failure,
      url: await page.url(),
      snapshot: await page.snapshot(),
    };
    await fs.writeFile(
      path.join(dir, "capture.json"),
      JSON.stringify(proof, null, 2)
    );
    if (failure) throw Error(failure);
    return {
      id,
      frames: frames.length,
      events: events.map(({ label, time, hover }) => ({ label, time, hover })),
    };
  }
  return { wait, move, click, fill, cell, canvas, mountPointer, shot };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/browser-director.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Check no other file still calls the old signature**

Run: `grep -rn "createDirector" --include=*.mjs --include=*.ts --include=*.md scripts src docs tests | grep -v "browser-director"`
Expected: only mentions in tests of this plan and in documents. Report any `.mjs` caller that passes a Codex `tab` directly; wrap it with `createCodexPage(tab)` and report it.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write scripts/demo-capture/browser-director.mjs tests/unit/scripts/browser-director.test.ts
git add scripts/demo-capture/browser-director.mjs tests/unit/scripts/browser-director.test.ts
git commit -m "feat(capture): the recording director runs on the page port, with frames folder, size and a viewport-aware rest point" -- scripts/demo-capture/browser-director.mjs tests/unit/scripts/browser-director.test.ts
```

---

### Task 4: Encoder options

**Files:**
- Modify (replace whole file): `scripts/demo-capture/encode-frames.py`
- Create: `tests/unit/scripts/encode-frames.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/encode-frames.test.ts`:

```ts
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const run = promisify(execFile);
const ENCODER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/demo-capture/encode-frames.py"
);
const haveTools = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-version"]);
    execFileSync("python", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

let folder: string;
beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "encode-"));
});
afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});

async function writeShot(id: string, extra: Record<string, unknown> = {}) {
  const dir = path.join(folder, "frames", id);
  await fs.mkdir(dir, { recursive: true });
  for (const n of [0, 1, 2]) {
    await run(toolPath("ffmpeg"), [
      "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x112",
      "-frames:v", "1", path.join(dir, `0000${n}.jpg`),
    ]);
  }
  await fs.writeFile(
    path.join(dir, "capture.json"),
    JSON.stringify({
      id,
      frames: [
        { file: "00000.jpg", timestamp: 10 },
        { file: "00001.jpg", timestamp: 10.1 },
        { file: "00002.jpg", timestamp: 10.2 },
      ],
      ...extra,
    })
  );
}

describe.skipIf(!haveTools)("encode-frames.py", () => {
  it("writes one file at the size and place it is told", async () => {
    await writeShot("shot");
    const output = path.join(folder, "media", "captures", "shot.1.mp4");
    await run("python", [
      ENCODER, folder, "shot",
      "--frames-dir", path.join(folder, "frames"),
      "--output", output,
      "--size", "108x192",
      "--ffmpeg", toolPath("ffmpeg"),
    ]);
    const size = execFileSync(
      toolPath("ffprobe"),
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", output],
      { encoding: "utf8" }
    ).trim();
    expect(size).toBe("108,192");
  });

  it("rejects a failed capture and leaves no file", async () => {
    await writeShot("bad", { failure: "Error: button missing" });
    const output = path.join(folder, "bad.mp4");
    await expect(
      run("python", [
        ENCODER, folder, "bad",
        "--frames-dir", path.join(folder, "frames"),
        "--output", output,
        "--ffmpeg", toolPath("ffmpeg"),
      ])
    ).rejects.toMatchObject({ stderr: expect.stringContaining("Rejected capture bad") });
    await expect(fs.access(output)).rejects.toThrow();
  });

  it("asks for an id when --output is given", async () => {
    await expect(
      run("python", [ENCODER, folder, "--output", path.join(folder, "x.mp4")])
    ).rejects.toMatchObject({ stderr: expect.stringContaining("--output needs exactly one capture id") });
  });

  it("still writes <id>.mp4 under raw-desktop with the old arguments", async () => {
    const dir = path.join(folder, "production", "frames", "old");
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await writeShot("old");
    await fs.rename(path.join(folder, "frames", "old"), dir);
    await run("python", [ENCODER, folder, "old", "--ffmpeg", toolPath("ffmpeg")]);
    await fs.access(path.join(folder, "raw-desktop", "old.mp4"));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/encode-frames.test.ts`
Expected: FAIL (the encoder rejects `--frames-dir`) or SKIP if ffmpeg or Python is missing. Report a skip.

- [ ] **Step 3: Replace the encoder**

Replace the whole of `scripts/demo-capture/encode-frames.py` with:

```python
"""Encode a native CDP screencast using its recorded frame timestamps."""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("root", type=Path)
parser.add_argument("ids", nargs="*")
parser.add_argument("--ffmpeg", default="E:/_ARCHIVE/zoom-recorder/binaries/ffmpeg.exe")
parser.add_argument("--frames-dir", type=Path, help="folder holding one <id>/ per capture; default <root>/production/frames")
parser.add_argument("--out-dir", type=Path, help="folder for <id>.mp4; default <root>/raw-desktop")
parser.add_argument("--output", type=Path, help="exact output file; needs exactly one capture id")
parser.add_argument("--size", default="1920x1080", help="WIDTHxHEIGHT of the video")
args = parser.parse_args()
if args.output and len(args.ids) != 1:
    parser.error("--output needs exactly one capture id")
width, height = (int(part) for part in args.size.lower().split("x"))
frames_root = args.frames_dir or args.root / "production" / "frames"
out_dir = args.out_dir or args.root / "raw-desktop"
if args.ids:
    folders = [frames_root / name for name in args.ids]
    for folder in folders:
        if not (folder / "capture.json").exists():
            raise RuntimeError(f"No capture.json for {folder.name} in {frames_root}")
else:
    folders = sorted(frames_root.iterdir())
for folder in folders:
    proof = json.loads((folder / "capture.json").read_text(encoding="utf-8"))
    if proof.get("failure"):
        raise RuntimeError(f"Rejected capture {folder.name}: {proof['failure']}")
    frames = proof["frames"]
    if len(frames) < 2:
        raise RuntimeError(f"Insufficient frames for {folder.name}")
    lines = ["ffconcat version 1.0"]
    gaps = []
    for index, frame in enumerate(frames):
        gap = (frames[index + 1]["timestamp"] - frame["timestamp"]) if index + 1 < len(frames) else 1 / 30
        if gap <= 0:
            raise RuntimeError("Non-monotonic capture timestamp")
        gaps.append(gap)
        lines.extend([f"file '{frame['file']}'", "option framerate 1000", f"duration {gap:.9f}"])
    lines.append(f"file '{frames[-1]['file']}'")
    lines.append("option framerate 1000")
    timeline = folder / "timeline.ffconcat"
    timeline.write_text("\n".join(lines) + "\n", encoding="utf-8")
    output = args.output or out_dir / f"{folder.name}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([args.ffmpeg, "-y", "-v", "error", "-safe", "0", "-f", "concat", "-i", str(timeline),
                        "-vf", f"fps=30,scale={width}:{height}", "-c:v", "libx264", "-preset", "fast", "-crf", "16",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)], check=True)
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    print(json.dumps({"id": folder.name, "output": str(output), "frames": len(frames), "seconds": sum(gaps),
                      "sourceAverageFps": (len(frames)-1)/(frames[-1]["timestamp"]-frames[0]["timestamp"]),
                      "maxFrameGapSeconds": max(gaps), "outputFps": 30}), flush=True)
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/encode-frames.test.ts`
Expected: PASS, 4 tests (or 4 skipped with a reason; say which).

- [ ] **Step 5: Commit**

```bash
npx prettier --write tests/unit/scripts/encode-frames.test.ts
git add scripts/demo-capture/encode-frames.py tests/unit/scripts/encode-frames.test.ts
git commit -m "feat(capture): encode-frames takes a frames folder, an output file and a size" -- scripts/demo-capture/encode-frames.py tests/unit/scripts/encode-frames.test.ts
```

---

### Task 5: The `relink-take` op

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project-ops.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project-bridge-guard.ts`
- Create: `tests/unit/media-composition/post-project-relink-take.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-project-relink-take.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { applyPostProjectOps } from "$lib/shared/media-composition/domain/post-project-ops";
import { createTakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import { NOW, project, take } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const FIRST = featureVideoMediaUrl("promo", "captures/builder.1.mp4");
const SECOND = featureVideoMediaUrl("promo", "captures/builder.2.mp4");
const empty = () => project([], [], []);
const recorded = () =>
  applyPostProjectOps(
    empty(),
    [{ op: "add-take", url: FIRST, durationSeconds: 12.5, append: true }],
    ctx
  );
const relink = (before: ReturnType<typeof recorded>, durationSeconds: number) =>
  applyPostProjectOps(
    before,
    [{ op: "relink-take", take: "take-1", url: SECOND, durationSeconds }],
    { now: NOW + 2 }
  );
const clip = (p: ReturnType<typeof recorded>) => p.tracks[0]?.items[0] as {
  takeId: string;
  sourceIn: number;
  sourceOut: number;
  duration: number;
};

describe("relink-take", () => {
  it("points the same take at the new file", () => {
    const next = relink(recorded(), 12.5);
    expect(next.takes).toHaveLength(1);
    expect(next.takes[0]).toMatchObject({
      id: "take-1",
      ref: { kind: "linked", url: SECOND },
      takeKey: `linked:${SECOND}`,
      durationSeconds: 12.5,
    });
    expect(clip(next).takeId).toBe("take-1");
  });

  it("keeps every clip range when the new file is longer", () => {
    const next = relink(recorded(), 20);
    expect(next.takes[0]?.durationSeconds).toBe(20);
    expect(clip(next)).toMatchObject({ sourceIn: 0, sourceOut: 12.5, duration: 12.5 });
  });

  it("cuts clips back when the new file is shorter", () => {
    const next = relink(recorded(), 8);
    expect(next.takes[0]?.durationSeconds).toBe(8);
    expect(clip(next)).toMatchObject({ sourceIn: 0, sourceOut: 8, duration: 8 });
  });

  it("moves the take's timing to the new file", () => {
    const before = {
      ...recorded(),
      timings: {
        "take-1": createTakeTiming({
          sequenceId: "seq",
          takeKey: `linked:${FIRST}`,
          durationSeconds: 12.5,
          now: NOW,
        }),
      },
    };
    const next = relink(before, 8);
    const timing = next.timings?.["take-1"];
    expect(timing?.takeKey).toBe(`linked:${SECOND}`);
    expect(timing?.sections.at(-1)?.endSeconds).toBe(8);
  });

  it("names what is wrong", () => {
    const before = recorded();
    const apply = (op: object) => () =>
      applyPostProjectOps(before, [op as never], ctx);
    expect(apply({ op: "relink-take", take: "take-9", url: SECOND, durationSeconds: 5 })).toThrow(
      'No take "take-9" in this post.'
    );
    expect(apply({ op: "relink-take", take: "take-1", url: "https://x.test/a.mp4", durationSeconds: 5 })).toThrow(
      /feature video media url/
    );
    expect(apply({ op: "relink-take", take: "take-1", url: SECOND, durationSeconds: 0 })).toThrow(
      "durationSeconds must be a positive number."
    );
  });

  it("refuses a file another take already plays", () => {
    const two = applyPostProjectOps(
      recorded(),
      [{ op: "add-take", url: SECOND, durationSeconds: 5 }],
      ctx
    );
    expect(() =>
      applyPostProjectOps(
        two,
        [{ op: "relink-take", take: "take-1", url: SECOND, durationSeconds: 5 }],
        ctx
      )
    ).toThrow("Another take already plays that file.");
  });
});

describe("the bridge guard and feature video timings", () => {
  const timingFor = (takeKey: string, durationSeconds: number) =>
    createTakeTiming({ sequenceId: "seq", takeKey, durationSeconds, now: NOW });

  it("lets a relink through, timing included", () => {
    const before = {
      ...recorded(),
      timings: { "take-1": timingFor(`linked:${FIRST}`, 12.5) },
    };
    expect(bridgeLockedChange(before, relink(before, 8))).toBeNull();
  });

  it("lets a removed take keep its orphan timing", () => {
    const before = {
      ...recorded(),
      timings: { "take-1": timingFor(`linked:${FIRST}`, 12.5) },
    };
    const after = applyPostProjectOps(before, [{ op: "remove-take", take: "take-1" }], ctx);
    expect(bridgeLockedChange(before, after)).toBeNull();
  });

  it("still locks the timing of any other take", () => {
    const before = {
      ...empty(),
      takes: [take("x")],
      timings: { x: timingFor("key-x", 20) },
    };
    const after = { ...before, timings: { x: timingFor("key-x", 30) } };
    expect(bridgeLockedChange(before, after)).toBe("timings");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-relink-take.test.ts`
Expected: FAIL (`relink-take` is not an op yet, so applyPostProjectOps throws "Edit 1 (relink-take)" errors).

- [ ] **Step 3: `replaceTakeMedia` accepts a shorter file when asked**

Edit `src/lib/shared/media-composition/domain/post-project-edits.ts`.

Find:
```ts
  durationSeconds: number;
  offsetSeconds: number;
}
```
Replace with:
```ts
  durationSeconds: number;
  offsetSeconds: number;
  /**
   * Accept a copy too short to hold every clip, as a re-recording can be: the
   * clips are cut back to fit it. Without this, such a copy changes nothing.
   */
  clamp?: boolean;
}
```

Find:
```ts
    !Number.isFinite(durationSeconds) ||
    offset + take.durationSeconds > durationSeconds + POST_TIME_EPSILON
  )
    return project;
```
Replace with:
```ts
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    (!replacement.clamp &&
      offset + take.durationSeconds > durationSeconds + POST_TIME_EPSILON)
  )
    return project;
```

- [ ] **Step 4: The op**

Edit `src/lib/shared/media-composition/domain/post-project-ops.ts`.

Find:
```ts
  removeTake,
  removeTunnelHook,
```
Replace with:
```ts
  removeTake,
  removeTunnelHook,
  replaceTakeMedia,
```

Find:
```ts
  | { op: "remove-take"; take: string }
```
Replace with:
```ts
  | { op: "remove-take"; take: string }
  | {
      op: "relink-take";
      take: string;
      /** A feature video media URL, as featureVideoMediaUrl makes it. */
      url: string;
      durationSeconds: number;
    }
```

Find:
```ts
    case "remove-take": {
```
Replace with:
```ts
    case "relink-take": {
      if (!project.takes.some((take) => take.id === op.take))
        throw new Error(`No take "${op.take}" in this post.`);
      if (!isFeatureVideoMediaUrl(op.url))
        throw new Error(
          "A take's url must be a feature video media url (/api/dev/feature-videos/<slug>/media/...)."
        );
      if (
        typeof op.durationSeconds !== "number" ||
        !Number.isFinite(op.durationSeconds) ||
        op.durationSeconds <= 0
      )
        throw new Error("durationSeconds must be a positive number.");
      const ref = { kind: "linked" as const, url: op.url };
      const takeKey = takeFileKey(ref);
      if (project.takes.some((take) => take.id !== op.take && take.takeKey === takeKey))
        throw new Error("Another take already plays that file.");
      return replaceTakeMedia(
        project,
        op.take,
        {
          ref,
          takeKey,
          durationSeconds: op.durationSeconds,
          offsetSeconds: 0,
          clamp: true,
        },
        ctx
      );
    }
    case "remove-take": {
```

- [ ] **Step 5: The bridge guard**

Replace the whole of `src/lib/shared/media-composition/domain/post-project-bridge-guard.ts` with:

```ts
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

/**
 * Parts of a post the manifest bridge may not change: the media and timing
 * a post is built from. A take's name is only a label, so it may change.
 * A feature video's own footage, a take playing from its media folder, may
 * be added, removed and relinked to a new recording: the CLI puts the file
 * there first. Its timing moves with it, so that take's timing may change
 * too.
 */
const LOCKED_KEYS = [
  "takes",
  "images",
  "timings",
  "mappingPreviewAppearances",
  "fonts",
  "importSource",
] as const;

type Take = PostProject["takes"][number];

const isFeatureTake = (take: Take) =>
  take.ref.kind === "linked" && isFeatureVideoMediaUrl(take.ref.url);

function lockedValue(
  project: PostProject,
  key: (typeof LOCKED_KEYS)[number],
  featureTakeIds: ReadonlySet<string>
) {
  if (key === "takes")
    return project.takes
      .filter((take) => !isFeatureTake(take))
      .map(({ label: _label, ...take }) => take);
  if (key === "timings")
    return Object.fromEntries(
      Object.entries(project.timings ?? {}).filter(
        ([takeId]) => !featureTakeIds.has(takeId)
      )
    );
  return project[key] ?? null;
}

/** The first locked part `next` changes, or null when it changes none. */
export function bridgeLockedChange(
  current: PostProject,
  next: PostProject
): string | null {
  const featureTakeIds = new Set(
    [...current.takes, ...next.takes].filter(isFeatureTake).map((take) => take.id)
  );
  for (const key of LOCKED_KEYS)
    if (
      JSON.stringify(lockedValue(next, key, featureTakeIds)) !==
      JSON.stringify(lockedValue(current, key, featureTakeIds))
    )
      return key;
  return null;
}
```

- [ ] **Step 6: Run the new tests and the neighbours**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-relink-take.test.ts tests/unit/media-composition/feature-video-ops.test.ts tests/unit/media-composition/feature-video-bridge.test.ts tests/unit/media-composition/post-project-edits.test.ts`
Expected: all PASS. The existing "still locks every other take and the timings" test must still pass.

If a test in `post-project-relink-take.test.ts` fails only on an exact number such as `sourceOut` or `duration` because `normalizeProject` rounds, report the actual values; do not change the production code to match a guess.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-project-edits.ts src/lib/shared/media-composition/domain/post-project-ops.ts src/lib/shared/media-composition/domain/post-project-bridge-guard.ts tests/unit/media-composition/post-project-relink-take.test.ts
git diff --stat
git add src/lib/shared/media-composition/domain/post-project-edits.ts src/lib/shared/media-composition/domain/post-project-ops.ts src/lib/shared/media-composition/domain/post-project-bridge-guard.ts tests/unit/media-composition/post-project-relink-take.test.ts
git commit -m "feat(post): relink-take points a take at a re-recorded file and cuts clips to fit" -- src/lib/shared/media-composition/domain/post-project-edits.ts src/lib/shared/media-composition/domain/post-project-ops.ts src/lib/shared/media-composition/domain/post-project-bridge-guard.ts tests/unit/media-composition/post-project-relink-take.test.ts
```

`git diff --stat` before the commit must list only these four files, and prettier must not have rewritten untouched parts of the first three.

---

### Task 6: Capture names and the two CLI commands

**Files:**
- Create: `scripts/feature-video/capture-files.mjs`
- Create: `tests/unit/scripts/capture-files.test.ts`
- Modify: `scripts/post-project.mjs`
- Create: `tests/unit/media-composition/post-project-cli-capture.test.ts`

- [ ] **Step 1: Write the failing test for the names**

Create `tests/unit/scripts/capture-files.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assertCaptureId,
  captureFile,
  findCaptureTake,
  mediaRelativePath,
  nextCaptureFile,
} from "../../../scripts/feature-video/capture-files.mjs";

describe("assertCaptureId", () => {
  it("accepts lowercase letters, digits and hyphens", () => {
    expect(assertCaptureId("builder-dckpsi")).toBe("builder-dckpsi");
    expect(assertCaptureId("ring-2")).toBe("ring-2");
  });
  it("rejects anything that could leave the captures folder", () => {
    for (const bad of ["", "Builder", "../x", "a/b", "a.b", "-a", undefined])
      expect(() => assertCaptureId(bad as never)).toThrow(/capture id/);
  });
});

describe("nextCaptureFile", () => {
  it("starts at 1", () => {
    expect(nextCaptureFile("builder", [])).toBe("captures/builder.1.mp4");
  });
  it("counts up from the highest existing take, never reusing a number", () => {
    expect(
      nextCaptureFile("builder", ["builder.1.mp4", "builder.3.mp4", "ring.9.mp4", "builder.notes.txt"])
    ).toBe("captures/builder.4.mp4");
  });
  it("does not mix up an id with a longer one that starts the same", () => {
    expect(nextCaptureFile("ring", ["ring-2.5.mp4"])).toBe("captures/ring.1.mp4");
  });
  it("names the file the way captureFile does", () => {
    expect(captureFile("a", 2)).toBe("captures/a.2.mp4");
  });
});

describe("mediaRelativePath and findCaptureTake", () => {
  const url = (rel: string) => `/api/dev/feature-videos/promo/media/${rel}`;
  const takes = [
    { id: "take-1", ref: { kind: "linked", url: url("footage/opening.mp4") } },
    { id: "take-2", ref: { kind: "linked", url: url("captures/builder.2.mp4") } },
    { id: "take-3", ref: { kind: "linked", url: url("captures/ring.1.mp4") } },
    { id: "take-4", ref: { kind: "inline", name: "x" } },
  ];
  it("reads the media-relative path, decoding it", () => {
    expect(mediaRelativePath(url("captures/a%20b.1.mp4"))).toBe("captures/a b.1.mp4");
    expect(mediaRelativePath("https://x.test/a.mp4")).toBeNull();
  });
  it("finds the take that plays a capture of that id", () => {
    expect(findCaptureTake(takes, "builder")?.id).toBe("take-2");
    expect(findCaptureTake(takes, "ring")?.id).toBe("take-3");
    expect(findCaptureTake(takes, "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/capture-files.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the names module**

Create `scripts/feature-video/capture-files.mjs`:

```js
/**
 * Where app recordings live in a feature video, and how to tell which take
 * plays one. A capture has an id such as `builder-dckpsi`; each recording of
 * it is `media/captures/<id>.<n>.mp4`, with n counting up so no earlier file
 * is overwritten. The take that plays the latest one keeps its id across
 * re-records, which is what keeps its clips in the post.
 */

const ID = /^[a-z0-9][a-z0-9-]*$/;

export function assertCaptureId(id) {
  if (typeof id !== "string" || !ID.test(id))
    throw new Error(
      `A capture id is lowercase letters, digits and hyphens, like builder-dckpsi. Got "${id}".`
    );
  return id;
}

/** The media-relative path of recording number `n`. */
export function captureFile(id, n) {
  return `captures/${id}.${n}.mp4`;
}

/** The next unused recording for `id`, given the file names already in media/captures. */
export function nextCaptureFile(id, existing) {
  assertCaptureId(id);
  const pattern = new RegExp(`^(?:captures/)?${id}\\.(\\d+)\\.mp4$`);
  let highest = 0;
  for (const name of existing) {
    const match = pattern.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return captureFile(id, highest + 1);
}

/** `captures/a.1.mp4` from a feature video media url, or null for any other url. */
export function mediaRelativePath(url) {
  const marker = "/media/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  return url
    .slice(at + marker.length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

/** The take that plays a recording of capture `id`, or null. */
export function findCaptureTake(takes, id) {
  assertCaptureId(id);
  const pattern = new RegExp(`^captures/${id}\\.\\d+\\.mp4$`);
  return (
    takes.find(
      (take) =>
        take.ref?.kind === "linked" &&
        pattern.test(mediaRelativePath(take.ref.url) ?? "")
    ) ?? null
  );
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/capture-files.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing CLI test**

Create `tests/unit/media-composition/post-project-cli-capture.test.ts`:

```ts
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const run = promisify(execFile);
const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/post-project.mjs"
);
const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

let server: http.Server;
let url: string;
let folder: string;
let takes: unknown[];
let posts: { path: string; body: { ops: Record<string, unknown>[] } }[];

beforeEach(async () => {
  takes = [];
  posts = [];
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "capture-cli-"));
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          return send(200, { sessions: [] });
        case "GET /api/dev/feature-videos/promo":
          return send(200, { file: { project: { takes } }, fingerprint: "f", folder });
        case "POST /api/dev/feature-videos/promo/ops":
          posts.push({ path: target.pathname, body: JSON.parse(text) });
          return send(200, { status: "applied", revision: 2 });
        default:
          return send(404, { message: "No such route." });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(folder, { recursive: true, force: true });
});

async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args, "--url", url]);
    return { code: 0, stdout, stderr };
  } catch (cause) {
    const failed = cause as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

const mediaUrl = (rel: string) => `/api/dev/feature-videos/promo/media/${rel}`;

describe("capture-info", () => {
  it("reports the folder, the recordings already there and the takes", async () => {
    await fs.mkdir(path.join(folder, "media", "captures"), { recursive: true });
    await fs.writeFile(path.join(folder, "media", "captures", "builder.1.mp4"), "x");
    takes = [
      { id: "take-1", label: "builder", ref: { kind: "linked", url: mediaUrl("captures/builder.1.mp4") } },
    ];
    const result = await cli("capture-info", "--feature", "promo");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      folder,
      existing: ["builder.1.mp4"],
      takes: [
        { id: "take-1", label: "builder", url: mediaUrl("captures/builder.1.mp4") },
      ],
    });
  });

  it("reports no recordings when the folder does not exist yet", async () => {
    const result = await cli("capture-info", "--feature", "promo");
    expect(JSON.parse(result.stdout).existing).toEqual([]);
  });
});

describe.skipIf(!canEncode)("link-capture", () => {
  async function makeRecording(rel: string) {
    const file = path.join(folder, "media", ...rel.split("/"));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await run(toolPath("ffmpeg"), [
      "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x112:d=1",
      "-pix_fmt", "yuv420p", file,
    ]);
  }

  it("adds a take the first time, labelled with the capture id", async () => {
    await makeRecording("captures/builder.1.mp4");
    const result = await cli(
      "link-capture", "--feature", "promo", "--capture", "builder", "--media", "captures/builder.1.mp4"
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ media: "captures/builder.1.mp4", take: null });
    expect(posts).toHaveLength(1);
    const op = posts[0]!.body.ops[0]!;
    expect(op).toMatchObject({ op: "add-take", url: mediaUrl("captures/builder.1.mp4"), label: "builder" });
    expect(op.durationSeconds).toBeCloseTo(1, 1);
  });

  it("relinks the take that plays an earlier recording", async () => {
    await makeRecording("captures/builder.2.mp4");
    takes = [
      { id: "take-1", label: "other", ref: { kind: "linked", url: mediaUrl("footage/a.mp4") } },
      { id: "take-2", label: "builder", ref: { kind: "linked", url: mediaUrl("captures/builder.1.mp4") } },
    ];
    const result = await cli(
      "link-capture", "--feature", "promo", "--capture", "builder", "--media", "captures/builder.2.mp4"
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ take: "take-2" });
    const op = posts[0]!.body.ops[0]!;
    expect(op).toMatchObject({ op: "relink-take", take: "take-2", url: mediaUrl("captures/builder.2.mp4") });
  });

  it("refuses a media path that is not a recording of that capture", async () => {
    const result = await cli(
      "link-capture", "--feature", "promo", "--capture", "builder", "--media", "footage/a.mp4"
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--media must be captures/builder.<n>.mp4");
    expect(posts).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli-capture.test.ts`
Expected: FAIL (the CLI prints its usage error for the unknown commands).

- [ ] **Step 7: Add the commands to `scripts/post-project.mjs`**

Edit `scripts/post-project.mjs`. Apply these three edits.

Find:
```js
import { importTake } from "./feature-video/media-import.mjs";
```
Replace with:
```js
import {
  assertCaptureId,
  findCaptureTake,
} from "./feature-video/capture-files.mjs";
import { importTake, probeMedia } from "./feature-video/media-import.mjs";
```

Find:
```js
  } else if (command === "add-music") {
```
Replace with:
```js
  } else if (command === "capture-info") {
    const feature = required("feature");
    const { folder, file } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const existing = await fs
      .readdir(path.join(folder, "media", "captures"))
      .catch(() => []);
    result = {
      folder,
      existing,
      takes: (file.project.takes ?? []).map((take) => ({
        id: take.id,
        label: take.label,
        url: take.ref.kind === "linked" ? take.ref.url : null,
      })),
    };
  } else if (command === "link-capture") {
    const feature = required("feature");
    const capture = assertCaptureId(required("capture"));
    const media = required("media");
    if (!new RegExp(`^captures/${capture}\\.\\d+\\.mp4$`).test(media))
      throw new Error(`--media must be captures/${capture}.<n>.mp4.`);
    const { folder, file } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const { durationSeconds } = await probeMedia(
      path.join(folder, "media", ...media.split("/"))
    );
    const mediaUrl = featureMediaUrl(feature, media);
    const earlier = findCaptureTake(file.project.takes ?? [], capture);
    result = {
      media,
      durationSeconds,
      take: earlier?.id ?? null,
      edit: await sendOps([
        earlier
          ? { op: "relink-take", take: earlier.id, url: mediaUrl, durationSeconds }
          : {
              op: "add-take",
              url: mediaUrl,
              durationSeconds,
              label: option("label") ?? capture,
            },
      ]),
    };
  } else if (command === "add-music") {
```

Find:
```js
  T is seconds (12.5), a clock (1:02.5), or a bar of the music: @9 is bar 9, @9.3 is bar 9, beat 3.
```
Replace with:
```js
  capture-info --feature SLUG   the project's folder, the recordings already in media/captures and its takes
  link-capture --feature SLUG --capture ID --media captures/ID.N.mp4 [--label "Name"]   puts a recording in the project: the take that plays an earlier recording of ID is pointed at it, else it becomes a new take
  T is seconds (12.5), a clock (1:02.5), or a bar of the music: @9 is bar 9, @9.3 is bar 9, beat 3.
```

- [ ] **Step 8: Run both test files and the existing CLI tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli-capture.test.ts tests/unit/media-composition/post-project-cli.test.ts tests/unit/media-composition/post-project-cli-music.test.ts tests/unit/scripts/capture-files.test.ts`
Expected: all PASS (ffmpeg-dependent tests may be skipped; say so).

- [ ] **Step 9: Format and commit**

```bash
npx prettier --write scripts/feature-video/capture-files.mjs scripts/post-project.mjs tests/unit/scripts/capture-files.test.ts tests/unit/media-composition/post-project-cli-capture.test.ts
git diff --stat scripts/post-project.mjs
git add scripts/feature-video/capture-files.mjs scripts/post-project.mjs tests/unit/scripts/capture-files.test.ts tests/unit/media-composition/post-project-cli-capture.test.ts
git commit -m "feat(capture): capture-info and link-capture put app recordings into a feature video" -- scripts/feature-video/capture-files.mjs scripts/post-project.mjs tests/unit/scripts/capture-files.test.ts tests/unit/media-composition/post-project-cli-capture.test.ts
```

`git diff --stat scripts/post-project.mjs` must show only the three edits (about 50 added lines), not a reformatted file.

---

### Task 7: The runner

**Files:**
- Create: `scripts/feature-video/capture.mjs`
- Create: `tests/unit/scripts/capture-runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/capture-runner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  outputSize,
  parseCaptureArgs,
  validateCaptureScript,
} from "../../../scripts/feature-video/capture.mjs";

describe("parseCaptureArgs", () => {
  it("defaults the origin and the port", () => {
    expect(parseCaptureArgs(["--feature", "promo", "--capture", "builder"])).toEqual({
      feature: "promo",
      capture: "builder",
      origin: "https://localhost:5173",
      port: 9223,
      cliUrl: undefined,
    });
  });
  it("takes an origin and a port, and hands the origin to the CLI", () => {
    expect(
      parseCaptureArgs(["--feature", "p", "--capture", "b", "--origin", "http://localhost:4000", "--port", "9300"])
    ).toMatchObject({ origin: "http://localhost:4000", port: 9300, cliUrl: "http://localhost:4000" });
  });
  it("refuses an origin that is not this computer", () => {
    expect(() =>
      parseCaptureArgs(["--feature", "p", "--capture", "b", "--origin", "https://example.com"])
    ).toThrow(/loopback/);
  });
  it("needs a feature and a capture", () => {
    expect(() => parseCaptureArgs(["--capture", "b"])).toThrow(/--feature/);
    expect(() => parseCaptureArgs(["--feature", "p"])).toThrow(/--capture/);
  });
  it("refuses the 9222 browser", () => {
    expect(() =>
      parseCaptureArgs(["--feature", "p", "--capture", "b", "--port", "9222"])
    ).toThrow(/9222/);
  });
});

describe("outputSize", () => {
  it("is the viewport times the scale", () => {
    expect(outputSize({ width: 720, height: 1280, deviceScaleFactor: 1.5 })).toEqual({
      width: 1080,
      height: 1920,
    });
  });
});

describe("validateCaptureScript", () => {
  const good = () => ({
    id: "builder",
    url: "/create/construct",
    viewport: { width: 720, height: 1280, deviceScaleFactor: 1.5, mobile: true },
    run: async () => {},
  });
  it("accepts a complete script", () => {
    expect(validateCaptureScript(good(), "builder")).toBeTruthy();
  });
  it("needs the id to match the file it came from", () => {
    expect(() => validateCaptureScript({ ...good(), id: "other" }, "builder")).toThrow(/id/);
  });
  it("needs a path, a viewport and a run function", () => {
    expect(() => validateCaptureScript({ ...good(), url: "create" }, "builder")).toThrow(/url/);
    expect(() => validateCaptureScript({ ...good(), viewport: undefined }, "builder")).toThrow(/viewport/);
    expect(() => validateCaptureScript({ ...good(), run: undefined }, "builder")).toThrow(/run/);
    expect(() => validateCaptureScript(undefined, "builder")).toThrow(/default export/);
  });
  it("explains why a device scale above 1.5 cannot work", () => {
    const script = good();
    script.viewport.deviceScaleFactor = 2.5;
    expect(() => validateCaptureScript(script, "builder")).toThrow(/1\.5/);
  });
  it("needs even output dimensions", () => {
    const script = good();
    script.viewport.width = 721;
    expect(() => validateCaptureScript(script, "builder")).toThrow(/even/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/capture-runner.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the runner**

Create `scripts/feature-video/capture.mjs`:

```js
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  delay,
  isDebugChromeRunning,
  navigate,
  openTab,
  setViewport,
  waitFor,
} from "../lib/chrome-cdp.mjs";
import { createDirector } from "../demo-capture/browser-director.mjs";
import { createCdpPage } from "./capture/cdp-page.mjs";
import { assertCaptureId, nextCaptureFile } from "./capture-files.mjs";
import { toolPath } from "./media-import.mjs";

/**
 * Records a scripted pass through the app and puts it in a feature video.
 *
 *   node scripts/feature-video/capture.mjs --feature SLUG --capture ID [--origin URL] [--port 9223]
 *
 * The script is `<project folder>/captures/<ID>.capture.mjs`. It default-exports
 * `{ id, url, viewport, ready?, settleMs?, run(director) }`; see
 * docs/development/post-studio-manifest-bridge.md. The recording is made in the
 * dedicated capture Chrome (port 9223, its own profile, signed out), never in
 * your browser and never in the shared 9222 browser.
 *
 * A capture that fails part way exits with an error, keeps its frames in
 * `<folder>/captures/frames/<ID>/`, and leaves the project untouched.
 */

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, "../post-project.mjs");
const ENCODER = path.resolve(here, "../demo-capture/encode-frames.py");
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
const CAPTURE_PROFILE = "C:\\Users\\Austen\\.claude\\chrome-profile-capture";

export function parseCaptureArgs(argv) {
  const option = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  const feature = option("feature");
  const capture = option("capture");
  if (!feature) throw new Error("capture needs --feature SLUG.");
  if (!capture) throw new Error("capture needs --capture ID.");
  const origin = option("origin");
  const base = new URL(origin ?? "https://localhost:5173");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    !LOOPBACK.includes(base.hostname)
  )
    throw new Error("--origin must be a loopback HTTP(S) address.");
  const port = Number(option("port") ?? 9223);
  if (port === 9222)
    throw new Error(
      "Port 9222 is the shared agent browser. Captures use their own Chrome on 9223."
    );
  return {
    feature,
    capture: assertCaptureId(capture),
    origin: base.origin,
    port,
    cliUrl: origin ? base.origin : undefined,
  };
}

/** The pixels the recording ends up with: Chrome's screencast delivers the viewport times the scale. */
export function outputSize({ width, height, deviceScaleFactor }) {
  return {
    width: Math.round(width * deviceScaleFactor),
    height: Math.round(height * deviceScaleFactor),
  };
}

export function validateCaptureScript(script, id) {
  if (!script || typeof script !== "object")
    throw new Error(`${id}.capture.mjs needs a default export.`);
  if (script.id !== id)
    throw new Error(`${id}.capture.mjs has id "${script.id}"; it must be "${id}".`);
  if (typeof script.url !== "string" || !script.url.startsWith("/"))
    throw new Error(`${id}.capture.mjs needs a url that starts with /, like /create/construct.`);
  const { viewport } = script;
  if (
    !viewport ||
    !(viewport.width > 0) ||
    !(viewport.height > 0) ||
    !(viewport.deviceScaleFactor > 0)
  )
    throw new Error(`${id}.capture.mjs needs a viewport with width, height and deviceScaleFactor.`);
  if (viewport.deviceScaleFactor > 1.5)
    throw new Error(
      `${id}.capture.mjs asks for device scale ${viewport.deviceScaleFactor}. Chrome's screencast stops at 1.5 times the CSS viewport, so frames would come out smaller than you plan for. Use a bigger viewport at 1.5: 720 by 1280 gives 1080 by 1920.`
    );
  const exact = {
    width: viewport.width * viewport.deviceScaleFactor,
    height: viewport.height * viewport.deviceScaleFactor,
  };
  if (
    !Number.isInteger(exact.width) ||
    !Number.isInteger(exact.height) ||
    exact.width % 2 ||
    exact.height % 2
  )
    throw new Error(
      `${id}.capture.mjs would record ${exact.width} by ${exact.height}; the video size must be whole and even.`
    );
  if (typeof script.run !== "function")
    throw new Error(`${id}.capture.mjs needs a run(director) function.`);
  return script;
}

async function cli(cliUrl, ...args) {
  const { stdout } = await run(process.execPath, [
    CLI,
    ...args,
    ...(cliUrl ? ["--url", cliUrl] : []),
  ]);
  return stdout.trim() ? JSON.parse(stdout) : undefined;
}

export async function runCapture({ feature, capture, origin, port, cliUrl }) {
  const info = await cli(cliUrl, "capture-info", "--feature", feature);
  const scriptFile = path.join(info.folder, "captures", `${capture}.capture.mjs`);
  const script = validateCaptureScript(
    (await import(pathToFileURL(scriptFile).href)).default,
    capture
  );
  if (!(await isDebugChromeRunning({ port })))
    throw new Error(
      `No capture Chrome on port ${port}. Start it with: powershell -File scripts/launch-chrome-debug.ps1 -Port ${port} -UserDataDir ${CAPTURE_PROFILE} -ProfileDirectory Default -Url about:blank`
    );

  const media = nextCaptureFile(capture, info.existing);
  const output = path.join(info.folder, "media", ...media.split("/"));
  const framesDir = path.join(info.folder, "captures", "frames");
  const size = outputSize(script.viewport);
  await fs.rm(path.join(framesDir, capture), { recursive: true, force: true });
  await fs.mkdir(path.dirname(output), { recursive: true });

  const tab = await openTab("about:blank", {
    port,
    bufferEvents: ["Page.screencastFrame"],
  });
  try {
    await setViewport(tab, {
      width: script.viewport.width,
      height: script.viewport.height,
      dpr: script.viewport.deviceScaleFactor,
      mobile: script.viewport.mobile ?? true,
    });
    await navigate(tab, new URL(script.url, origin).href);
    if (script.ready)
      await waitFor(tab, script.ready, {
        timeoutMs: 60000,
        label: `${capture} ready`,
      });
    await delay(script.settleMs ?? 1500);
    const director = createDirector(createCdpPage(tab), tab, info.folder, {
      framesDir,
      size,
    });
    await director.mountPointer();
    await script.run(director);
  } finally {
    await tab.close();
  }

  await fs
    .access(path.join(framesDir, capture, "capture.json"))
    .catch(() => {
      throw new Error(
        `${capture}.capture.mjs never recorded a shot named "${capture}". Call director.shot("${capture}", seconds, action).`
      );
    });
  await run(process.env.PYTHON ?? "python", [
    ENCODER,
    info.folder,
    capture,
    "--frames-dir",
    framesDir,
    "--output",
    output,
    "--size",
    `${size.width}x${size.height}`,
    "--ffmpeg",
    toolPath("ffmpeg"),
  ]);
  const linked = await cli(
    cliUrl,
    "link-capture",
    "--feature",
    feature,
    "--capture",
    capture,
    "--media",
    media
  );
  return { media, size, ...linked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCapture(parseCaptureArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/capture-runner.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Check the runner starts and explains itself**

Run: `node scripts/feature-video/capture.mjs; echo "exit $?"`
Expected: `capture needs --feature SLUG.` and `exit 1`. Do not run it with a feature; the coordinator does that in Task 9.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write scripts/feature-video/capture.mjs tests/unit/scripts/capture-runner.test.ts
git add scripts/feature-video/capture.mjs tests/unit/scripts/capture-runner.test.ts
git commit -m "feat(capture): the capture runner records, encodes and links an app recording" -- scripts/feature-video/capture.mjs tests/unit/scripts/capture-runner.test.ts
```

---

### Task 8: Documents

**Files:**
- Modify: `docs/architecture/canonical-capabilities.md`
- Modify: `docs/development/post-studio-manifest-bridge.md`

- [ ] **Step 1: The capabilities entry**

In `docs/architecture/canonical-capabilities.md`, find the paragraph that begins `Feature videos, such as the 1.0 promo, are Post Studio projects kept as` and read to the end of that paragraph. Add this paragraph directly after it, with a blank line before and after:

```markdown
App recordings for a feature video come from `scripts/feature-video/capture.mjs`,
the one runner for them. It drives the dedicated capture Chrome on port 9223
through `scripts/lib/chrome-cdp.mjs` (events through `cdp-event-buffer.mjs`),
`scripts/demo-capture/browser-director.mjs` owns the pointer and the screencast,
`scripts/demo-capture/encode-frames.py` owns the encode, and
`scripts/feature-video/capture-files.mjs` owns recording names. The project
changes only through `post-project.mjs link-capture`, which sends
`relink-take` or `add-take`. Do not add a second recorder; extend these.
```

- [ ] **Step 2: The command guide**

In `docs/development/post-studio-manifest-bridge.md`, find the line `### When disk and the editor disagree` and insert this section directly before it, with a blank line before and after:

````markdown
### App recordings

A capture records a scripted pass through the app as a take. The script is `<slug>/captures/<id>.capture.mjs`; an id is lowercase letters, digits and hyphens.

```js
export default {
  id: "builder-dckpsi",
  url: "/create/construct",
  viewport: { width: 720, height: 1280, deviceScaleFactor: 1.5, mobile: true },
  ready: "document.querySelector('.canvas-wrapper') !== null", // optional: waits for this to be true
  settleMs: 1500, // optional: a pause after load, 1500 by default
  async run(director) {
    await director.shot("builder-dckpsi", 8, async () => {
      await director.click("Play");
    });
  },
};
```

Chrome's screencast delivers at most 1.5 times the CSS viewport, so a 9:16 recording uses 720 by 1280 at 1.5 for exactly 1080 by 1920. The runner refuses a higher scale. The director's calls are `click(label)`, `fill(label, value)`, `cell(index)`, `canvas()`, `move(x, y)`, `wait(ms)` and `shot(id, seconds, action)`; the shot named like the capture is the one that is encoded.

```powershell
powershell -File scripts/launch-chrome-debug.ps1 -Port 9223 -UserDataDir C:\Users\Austen\.claude\chrome-profile-capture -ProfileDirectory Default -Url about:blank
node scripts/feature-video/capture.mjs --feature promo-1-0 --capture builder-dckpsi
node scripts/post-project.mjs capture-info --feature promo-1-0
node scripts/post-project.mjs link-capture --feature promo-1-0 --capture builder-dckpsi --media captures/builder-dckpsi.2.mp4
```

The capture Chrome is its own browser with its own profile, signed out. It is never your Chrome and never the shared agent browser on 9222. The dev server must be running; the runner never starts it.

Each run writes `media/captures/<id>.<n>.mp4` with n counting up, so no earlier recording is overwritten, then links it. The first run adds a take labelled with the id. Every later run points that same take at the new file, so the clips cut from it stay in the post: a longer file keeps every clip as it was, and a shorter one cuts them back to fit. The take's timing moves with it. A run that fails part way keeps its frames in `captures/frames/<id>/`, writes no video and leaves the project as it was.
````

- [ ] **Step 3: Check the documents**

Run: `grep -n "check:docs" package.json`. If a script exists, run it with `npm run check:docs 2>&1 | tail -15` and expect it to pass; if it reports a path in the new text that does not exist, correct the text, not the check. If there is no such script, say so and skip this step.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/canonical-capabilities.md docs/development/post-studio-manifest-bridge.md
git commit -m "docs(capture): the capture runner, its script format and re-record behavior" -- docs/architecture/canonical-capabilities.md docs/development/post-studio-manifest-bridge.md
```

---

### Task 9: Coordinator only, the real recording

Not for implementers. The coordinator runs the whole flow once for real, on a throwaway feature video, and removes it afterwards.

1. Make a throwaway project on the running dev server: `node scripts/post-project.mjs create capture-smoke --sequence "<a sequence id from promo-1-0's project.json>" --canvas 9:16`.
2. Write `<root>/capture-smoke/captures/smoke.capture.mjs` with a viewport of 720 by 1280 at 1.5, url `/create/construct`, a `ready` that waits for the page's play button, and a `run` that records `director.shot("smoke", 4, ...)` with one real `click`.
3. Run the runner twice. After run 1: `media/captures/smoke.1.mp4` exists at 1080 by 1920 and the project has one take labelled `smoke`. After run 2: `smoke.2.mp4` exists, `smoke.1.mp4` is untouched, and the project still has one take, now pointing at `smoke.2.mp4`.
4. Make a failing script (clicks a label that does not exist). Run it. Expect a non-zero exit, the frames kept, no new `.mp4`, and `project.json` unchanged.
5. Look at three frames of the encoded video, not only the numbers.
6. Remove the throwaway folder, the capture Chrome stays up for the next piece.

---

## Self-review

**Spec coverage** (piece 3 of the pipeline spec): capture browser on 9223 with its own profile (Task 7 refuses 9222, Task 9 uses it); runner steps connect, size, load, mount pointer, run script, record, encode to `media/captures/<id>.<n>.mp4`, relink or add the take (Tasks 1, 3, 4, 6, 7); page port and both adapters (Task 2); `shot()` size option (Task 3); `relink-take` with clamp (Task 5); error handling, frames kept and project untouched (Tasks 4, 7, 9); tests for relink clamping and the event reader (Tasks 1, 5); canonical-capabilities entry (Task 8); risk step, prove the page port on one short shot first (done 2026-10-07, which changed the capture size; recorded under "Where this plan departs"). Left out on purpose: the Re-record button.

**Type consistency:** `createDirector(page, cdp, root, { framesDir, size })` is called with exactly that shape in Task 7 and in the tests. `readEvents({ methods, afterSequence, limit, timeoutMs })` returns `{ cursor, events, hasMore, truncated }` in Tasks 1 and 3. `fillByRole({ role, name, value, commitKey })` matches in Tasks 2 and 3. The op is `relink-take { take, url, durationSeconds }` in Tasks 5 and 6. `capture-info` returns `{ folder, existing, takes }`, which Task 7 reads as `info.folder` and `info.existing`.
