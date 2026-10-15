# Choreo 4K Reliability + Visual Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/choreo` self-recovering on restored drafts and gorgeous at 4K, plus kill the thumbnail-404 and half-placement console floods.

**Architecture:** Roster state machine + classified auto-retrying resolver behind an auth-settled boundary (Phase 1); container-query stage-fit recomposition (Phase 2); negative-cache wiring for thumbnails (Phase 3); grid-mode-invariant half-placement paths (Phase 4). Spec: `docs/superpowers/specs/2026-07-25-choreo-gorgeous-4k-design.md` — read it first; its "Decisions already made" and "Gotchas carried forward" bind every task.

**Tech Stack:** Svelte 5 runes, SvelteMap/SvelteSet, vitest (jsdom, DI-stub pattern — no component mounting), container queries, pdf-lib untouched.

**Execution waves:** Wave 1 runs Task groups A (Tasks 1–7), C (Task 11), D (Task 12) in parallel — disjoint files. Wave 2 runs group B (Tasks 8–10) after A lands (same files as A's Task 6–7). Verification (Task 13) last.

**Hard rules for every executor:**
- Work on `main`, primary checkout. NO branches, NO worktrees.
- `git status --short` before every commit; commit ONLY your listed files with explicit pathspec (`git add <paths> && git commit -m "..." -- <paths>`). The tree is dirty with other sessions' work.
- Never touch port 5173. Never run `npm run dev`.
- One `npm run check` max, at the end, respecting `resource-budget.md` gates (check free RAM ≥ 4096 MB, no other svelte-check running). During iteration run only your own vitest targets.
- Prove each step with tool output. No "should work".
- `src/lib/shared/browse/components/PropAwareThumbnail.svelte` has another session's uncommitted comment-only edit at the top — preserve it.

---

## Task group A — Phase 1: self-recovering hydration + roster truth

### Task 1: `awaitAuthSettled()` in auth-state

**Files:**
- Modify: `src/lib/shared/auth/state/auth-state.svelte.ts`

No dedicated unit test: importing this module pulls the live Firebase graph; the contract is covered by Task 2's DI tests (`awaitAuthSettled` is injected there) and the implementation is 15 lines. Do not add a test that mocks half of Firebase to test a promise.

- [ ] **Step 1: Add the deferred + export** — near `let authInitPromise` (~line 129) add:

```ts
// Resolvers parked until auth restoration settles. `awaitAuthSettled()` is the
// one sanctioned readiness boundary for "don't read private data yet" — do not
// add another 50ms poll loop (three legacy ones exist; they are the anti-pattern).
let authSettledResolvers: Array<() => void> = [];

function resolveAuthSettled(): void {
  const resolvers = authSettledResolvers;
  authSettledResolvers = [];
  for (const resolve of resolvers) resolve();
}

/**
 * Resolves once auth restoration has settled (authState.initialized === true) —
 * signed-in, guest, or confirmed signed-out. Resolves immediately if already
 * settled. Never rejects.
 */
export function awaitAuthSettled(): Promise<void> {
  if (_state.initialized) return Promise.resolve();
  return new Promise((resolve) => {
    authSettledResolvers.push(resolve);
  });
}
```

- [ ] **Step 2: Resolve at every `initialized: true` assignment.** There are exactly three `_state = { ... initialized: true ... }` sites: the desktop fast-path (~line 402-409), the persistent-listener success branch (~line 485-491), and the listener error handler (~line 645-651). Add `resolveAuthSettled();` immediately after each assignment. (The HMR-restore path needs nothing: if `hmrAuthData` restored `initialized: true`, the fast-return in `awaitAuthSettled` covers it.)

- [ ] **Step 3: Typecheck just this edit compiles** — run `npx vitest run tests/unit/choreo-sheet-annotations.test.ts` (imports nothing from auth; this is a smoke that the repo test setup still runs) and visually re-read your diff: three `resolveAuthSettled()` calls, one export, no other changes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/auth/state/auth-state.svelte.ts
git commit -m "feat(auth): add awaitAuthSettled() readiness boundary" -- src/lib/shared/auth/state/auth-state.svelte.ts
```

### Task 2: sequence resolver service (TDD)

**Files:**
- Create: `src/lib/features/write/services/sheet-sequence-resolver.ts`
- Test: `tests/unit/sheet-sequence-resolver.test.ts`

- [ ] **Step 1: Write the failing tests** — create `tests/unit/sheet-sequence-resolver.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  classifyResolveError,
  createSheetSequenceResolver,
  type ResolveOutcome,
} from "../../src/lib/features/write/services/sheet-sequence-resolver";
import { LibraryError } from "../../src/lib/shared/library/domain/library-error";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";

function seq(id: string): SequenceData {
  return { id, word: id, steps: [{ stepNumber: 1 }] } as unknown as SequenceData;
}

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** delay stub that resolves instantly but records requested waits. */
function instantDelay() {
  const waits: number[] = [];
  return {
    waits,
    delay: (ms: number, _signal: AbortSignal) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
}

describe("classifyResolveError", () => {
  it("classifies UNAUTHORIZED, permission, and everything else", () => {
    expect(classifyResolveError(new LibraryError("no user", "UNAUTHORIZED"))).toBe("unauthorized");
    expect(classifyResolveError({ code: "permission-denied" })).toBe("permission");
    expect(classifyResolveError(new LibraryError("net", "NETWORK"))).toBe("transient");
    expect(classifyResolveError({ code: "unavailable" })).toBe("transient");
    expect(classifyResolveError(new Error("weird"))).toBe("transient");
  });
});

describe("createSheetSequenceResolver", () => {
  it("does not touch loaders until auth settles, and shares one settlement across ids", async () => {
    const gate = deferred();
    const settleSpy = vi.fn(() => gate.promise);
    const loadPrivate = vi.fn(async (id: string) => seq(id));
    const resolver = createSheetSequenceResolver({
      loadPrivate,
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: settleSpy,
    });
    const ctrl = new AbortController();
    const results = Promise.all(
      ["a", "b", "c", "d", "e", "f"].map((id) => resolver.resolve(id, ctrl.signal))
    );
    await Promise.resolve();
    expect(loadPrivate).not.toHaveBeenCalled();
    gate.resolve();
    const outcomes = await results;
    expect(outcomes.every((o) => o.sequence !== null)).toBe(true);
    // one awaitAuthSettled call per resolve is fine — the point is zero loader
    // calls pre-settlement; the promise itself is the shared gate.
    expect(loadPrivate).toHaveBeenCalledTimes(6);
  });

  it("retries a transient failure automatically and succeeds", async () => {
    const { waits, delay } = instantDelay();
    const loadPrivate = vi
      .fn<[string], Promise<SequenceData | null>>()
      .mockRejectedValueOnce({ code: "unavailable" })
      .mockResolvedValueOnce(seq("a"));
    const resolver = createSheetSequenceResolver({
      loadPrivate,
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: async () => {},
      delay,
    });
    const out = await resolver.resolve("a", new AbortController().signal);
    expect(out.sequence?.id).toBe("a");
    expect(out.attempts).toBe(2);
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThanOrEqual(375); // 500ms ±25% jitter
    expect(waits[0]).toBeLessThanOrEqual(625);
  });

  it("exhausts retries then reports transient — never missing", async () => {
    const { delay } = instantDelay();
    const resolver = createSheetSequenceResolver({
      loadPrivate: vi.fn(async () => {
        throw new LibraryError("net", "NETWORK");
      }),
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: async () => {},
      delay,
    });
    const out = await resolver.resolve("a", new AbortController().signal);
    expect(out).toMatchObject({ sequence: null, failure: "transient", attempts: 4 });
  });

  it("private null + public null → missing, no retries burned", async () => {
    const resolver = createSheetSequenceResolver({
      loadPrivate: vi.fn(async () => null),
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: async () => {},
    });
    const out = await resolver.resolve("gone", new AbortController().signal);
    expect(out).toMatchObject({ sequence: null, failure: "missing", attempts: 1 });
  });

  it("permission error + public miss → permission, not missing", async () => {
    const resolver = createSheetSequenceResolver({
      loadPrivate: vi.fn(async () => {
        throw { code: "permission-denied" };
      }),
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: async () => {},
    });
    const out = await resolver.resolve("locked", new AbortController().signal);
    expect(out.failure).toBe("permission");
  });

  it("UNAUTHORIZED post-settle falls through to public without recording failure", async () => {
    const resolver = createSheetSequenceResolver({
      loadPrivate: vi.fn(async () => {
        throw new LibraryError("no user", "UNAUTHORIZED");
      }),
      loadPublic: vi.fn(async (id: string) => seq(id)),
      awaitAuthSettled: async () => {},
    });
    const out = await resolver.resolve("pub1", new AbortController().signal);
    expect(out).toMatchObject({ source: "public", failure: null });
  });

  it("abort mid-backoff rejects with AbortError and stops retrying", async () => {
    const ctrl = new AbortController();
    const loadPrivate = vi.fn(async () => {
      throw new LibraryError("net", "NETWORK");
    });
    const resolver = createSheetSequenceResolver({
      loadPrivate,
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: async () => {},
      delay: (_ms, signal) =>
        new Promise((_res, rej) => {
          signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        }),
    });
    const pending = resolver.resolve("a", ctrl.signal);
    await Promise.resolve();
    ctrl.abort();
    await expect(pending).rejects.toThrow(/abort/i);
    expect(loadPrivate).toHaveBeenCalledTimes(1);
  });

  it("single-flight: concurrent resolves for one id share one resolution", async () => {
    const gate = deferred<SequenceData>();
    const loadPrivate = vi.fn(() => gate.promise);
    const resolver = createSheetSequenceResolver({
      loadPrivate,
      loadPublic: vi.fn(async () => null),
      awaitAuthSettled: async () => {},
    });
    const ctrl = new AbortController();
    const p1 = resolver.resolve("a", ctrl.signal);
    const p2 = resolver.resolve("a", ctrl.signal);
    await Promise.resolve();
    gate.resolve(seq("a"));
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(loadPrivate).toHaveBeenCalledTimes(1);
    expect(o1.sequence?.id).toBe("a");
    expect(o2.sequence?.id).toBe("a");
  });

  const _typecheck: ResolveOutcome | null = null;
  void _typecheck;
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/sheet-sequence-resolver.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/lib/features/write/services/sheet-sequence-resolver.ts`:

```ts
/**
 * Classified, auto-retrying, cancellable sequence resolution for the Choreo
 * sheet. Private library first, public gallery fallback, with the auth-settled
 * gate in front so a restored draft never races Firebase session restoration
 * (the six-red-rows bug). Pure DI — the view wires the real loaders.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import { isPermissionDeniedError } from "$lib/shared/auth/utils/is-permission-denied-error";

export type ResolveFailure = "transient" | "permission" | "missing";

export interface ResolveOutcome {
  sequence: SequenceData | null;
  source: "private" | "public" | null;
  failure: ResolveFailure | null;
  attempts: number;
}

export interface SheetSequenceResolverDeps {
  /** Private library read. Throws LibraryError / FirestoreError; null = confirmed not in library. */
  loadPrivate: (id: string) => Promise<SequenceData | null>;
  /** Public gallery read. null = confirmed not public; throws only for network-class failures. */
  loadPublic: (id: string) => Promise<SequenceData | null>;
  awaitAuthSettled: () => Promise<void>;
  /** Injectable for fake timers in tests. */
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Error classes: unauthorized = genuinely no identity (post-settle) → public-only,
 *  permission = never present as deleted, transient = retry. Unknowns fail open
 *  to transient — never toward "deleted". */
export function classifyResolveError(error: unknown): "unauthorized" | "permission" | "transient" {
  if (error instanceof LibraryError && error.code === "UNAUTHORIZED") return "unauthorized";
  if (isPermissionDeniedError(error)) return "permission";
  return "transient";
}

const BACKOFF_MS = [500, 1500, 4000] as const;

function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

function abortError(): DOMException {
  return new DOMException("Sequence resolution aborted", "AbortError");
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function hasSteps(seq: SequenceData | null): seq is SequenceData {
  return seq != null && (seq.steps?.length ?? 0) > 0;
}

export function createSheetSequenceResolver(deps: SheetSequenceResolverDeps) {
  const delay = deps.delay ?? defaultDelay;
  const inFlight = new Map<string, Promise<ResolveOutcome>>();

  /** One private→public pass. Throws for transient failures (caller retries). */
  async function attempt(id: string): Promise<
    { sequence: SequenceData; source: "private" | "public" } | { terminal: "missing" | "permission" }
  > {
    let sawPermission = false;
    try {
      const own = await deps.loadPrivate(id);
      if (hasSteps(own)) return { sequence: own, source: "private" };
    } catch (error) {
      const cls = classifyResolveError(error);
      if (cls === "transient") throw error;
      if (cls === "permission") sawPermission = true;
      // "unauthorized": no identity — the public tier is all we have. Not a failure.
    }
    const pub = await deps.loadPublic(id);
    if (hasSteps(pub)) return { sequence: pub, source: "public" };
    return { terminal: sawPermission ? "permission" : "missing" };
  }

  async function resolve(id: string, signal: AbortSignal): Promise<ResolveOutcome> {
    const existing = inFlight.get(id);
    if (existing) return existing;

    const run = (async (): Promise<ResolveOutcome> => {
      await deps.awaitAuthSettled();
      let attempts = 0;
      for (;;) {
        if (signal.aborted) throw abortError();
        attempts++;
        try {
          const result = await attempt(id);
          if ("sequence" in result) {
            return { sequence: result.sequence, source: result.source, failure: null, attempts };
          }
          return { sequence: null, source: null, failure: result.terminal, attempts };
        } catch (error) {
          if (signal.aborted) throw abortError();
          const backoff = BACKOFF_MS[attempts - 1];
          if (backoff === undefined) {
            return { sequence: null, source: null, failure: "transient", attempts };
          }
          await delay(jitter(backoff), signal);
        }
      }
    })();

    const tracked = run.finally(() => inFlight.delete(id));
    inFlight.set(id, tracked);
    return tracked;
  }

  return { resolve };
}

export type SheetSequenceResolver = ReturnType<typeof createSheetSequenceResolver>;
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/unit/sheet-sequence-resolver.test.ts`. Expected: all PASS. (If the `mockRejectedValueOnce` generic signature complains under the repo's vitest version, drop the generic — `vi.fn().mockRejectedValueOnce(...)` untyped is fine in tests.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-sequence-resolver.ts tests/unit/sheet-sequence-resolver.test.ts
git commit -m "feat(choreo): classified auto-retrying sequence resolver" -- src/lib/features/write/services/sheet-sequence-resolver.ts tests/unit/sheet-sequence-resolver.test.ts
```

### Task 3: roster state machine in the sheet state factory (TDD)

**Files:**
- Modify: `src/lib/features/write/state/choreo-sheet-state.svelte.ts`
- Test: `tests/unit/choreo-sheet-roster.test.ts`
- Existing tests must stay green: `tests/unit/choreo-sheet-annotations.test.ts`, `tests/unit/choreo-sheet-persistence.test.ts`, `tests/unit/choreo-sheet-factory.test.ts`

Key insight from the spec: the hydration cache never evicts, so "roster complete" is monotonic for a given id-set — the derived pipeline gates on complete-or-empty with NO snapshot machinery.

- [ ] **Step 1: Write the failing tests** — create `tests/unit/choreo-sheet-roster.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createChoreoSheetState } from "../../src/lib/features/write/state/choreo-sheet-state.svelte";
import type { ResolveOutcome } from "../../src/lib/features/write/services/sheet-sequence-resolver";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";
import type { ChoreoSheet } from "../../src/lib/features/write/domain/types/choreo-sheet";
import { createEmptyChoreoSheet } from "../../src/lib/features/write/domain/types/choreo-sheet";

function seq(id: string, steps = 2): SequenceData {
  return {
    id,
    word: id,
    steps: Array.from({ length: steps }, (_, i) => ({ stepNumber: i + 1 })),
  } as unknown as SequenceData;
}

function sheetWith(ids: string[]): ChoreoSheet {
  return { ...createEmptyChoreoSheet(""), sequenceIds: ids };
}

function ok(id: string): ResolveOutcome {
  return { sequence: seq(id), source: "private", failure: null, attempts: 1 };
}
function missing(): ResolveOutcome {
  return { sequence: null, source: null, failure: "missing", attempts: 1 };
}
function transient(): ResolveOutcome {
  return { sequence: null, source: null, failure: "transient", attempts: 4 };
}

function deferredMap() {
  const pending = new Map<string, (o: ResolveOutcome) => void>();
  const resolveSequence = (id: string, _signal: AbortSignal) =>
    new Promise<ResolveOutcome>((r) => pending.set(id, r));
  return { pending, resolveSequence };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("roster state machine", () => {
  it("keeps roster order and per-row status while ids resolve out of order", async () => {
    const { pending, resolveSequence } = deferredMap();
    const s = createChoreoSheetState({ resolveSequence, initialSheet: sheetWith(["a", "b", "c"]) });
    expect(s.roster.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(s.roster.every((r) => r.status === "loading")).toBe(true);
    expect(s.rosterComplete).toBe(false);

    pending.get("b")!(ok("b"));
    await tick();
    expect(s.roster.map((r) => r.status)).toEqual(["loading", "ready", "loading"]);
    // incomplete roster → derived pipeline is EMPTY, never a reduced list
    expect(s.normalizedRows).toEqual([]);
    expect(s.pages).toEqual([]);

    pending.get("a")!(ok("a"));
    pending.get("c")!(ok("c"));
    await tick();
    expect(s.rosterComplete).toBe(true);
    expect(s.normalizedRows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("classifies terminal outcomes: missing vs error", async () => {
    const { pending, resolveSequence } = deferredMap();
    const s = createChoreoSheetState({ resolveSequence, initialSheet: sheetWith(["gone", "flaky"]) });
    pending.get("gone")!(missing());
    pending.get("flaky")!(transient());
    await tick();
    const [gone, flaky] = s.roster;
    expect(gone!.status).toBe("missing");
    expect(flaky!.status).toBe("error");
    expect(flaky!.failure).toBe("transient");
    expect(s.failedSequenceIds.has("gone")).toBe(true);
    expect(s.failedSequenceIds.has("flaky")).toBe(true);
  });

  it("retryHydration flips error → retrying in place, row never leaves the roster", async () => {
    const { pending, resolveSequence } = deferredMap();
    const s = createChoreoSheetState({ resolveSequence, initialSheet: sheetWith(["x"]) });
    pending.get("x")!(transient());
    await tick();
    expect(s.roster[0]!.status).toBe("error");
    pending.delete("x");
    void s.retryHydration("x");
    await Promise.resolve();
    expect(s.roster[0]!.status).toBe("retrying");
    expect(s.roster.length).toBe(1);
    pending.get("x")!(ok("x"));
    await tick();
    expect(s.roster[0]!.status).toBe("ready");
  });

  it("replaceSheet cancels the old batch — stale completions are dropped", async () => {
    const { pending, resolveSequence } = deferredMap();
    const s = createChoreoSheetState({ resolveSequence, initialSheet: sheetWith(["old"]) });
    const resolveOld = pending.get("old")!;
    s.replaceSheet(sheetWith(["new"]));
    resolveOld(ok("old")); // stale generation
    pending.get("new")!(ok("new"));
    await tick();
    expect(s.roster.map((r) => r.id)).toEqual(["new"]);
    expect(s.rosterComplete).toBe(true);
    // the stale outcome must not have poisoned status maps for a roster it isn't on
    expect(s.failedSequenceIds.size).toBe(0);
  });

  it("directly seeded sequences are ready immediately (picker path)", () => {
    const s = createChoreoSheetState({
      resolveSequence: vi.fn(),
      initialSheet: sheetWith([]),
    });
    s.addHydratedSequences([seq("p")]);
    expect(s.roster[0]).toMatchObject({ id: "p", status: "ready" });
    expect(s.rosterComplete).toBe(true);
  });

  it("meta from the draft labels loading rows before data arrives", () => {
    const { resolveSequence } = deferredMap();
    localStorage.setItem(
      "roster-test-draft",
      JSON.stringify({
        sequenceIds: ["m1"],
        sequenceMeta: { m1: { name: "KECΦ-KECΦ-", stepCount: 16 } },
      })
    );
    const s = createChoreoSheetState({ resolveSequence, persistKey: "roster-test-draft" });
    expect(s.roster[0]!.meta).toEqual({ name: "KECΦ-KECΦ-", stepCount: 16 });
    localStorage.removeItem("roster-test-draft");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/choreo-sheet-roster.test.ts`. Expected: FAIL (`resolveSequence` not a known dep / `roster` undefined).

- [ ] **Step 3: Rework the factory.** In `choreo-sheet-state.svelte.ts`:

**3a — deps.** Replace `loadSequence` with the resolver seam (grep the repo for `loadSequence:` consumers first — the only wiring is `ChoreoSheetView.svelte:101-104` and test stubs):

```ts
import type { ResolveFailure, ResolveOutcome } from "../services/sheet-sequence-resolver";

export type RowStatus = "loading" | "retrying" | "ready" | "missing" | "error";

export interface SequenceMeta {
  name: string;
  stepCount: number;
}

export interface RosterRow {
  id: string;
  status: RowStatus;
  sequence: SequenceData | null;
  meta: SequenceMeta | null;
  failure: ResolveFailure | null;
  attempts: number;
}

export interface ChoreoSheetStateDeps {
  /** Resolves one id to full step data (private→public, classified, retrying).
   *  Wire to createSheetSequenceResolver(...).resolve at the builder root. */
  resolveSequence: (id: string, signal: AbortSignal) => Promise<ResolveOutcome>;
  initialSheet?: ChoreoSheet;
  persistKey?: string;
}
```

**3b — draft meta.** Extend persistence (keep `loadDraft`'s signature; add a meta reader; extra JSON fields are ignored by the existing parser so back-compat is automatic):

```ts
export function loadDraftMeta(key: string): Record<string, SequenceMeta> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { sequenceMeta?: unknown };
    const out: Record<string, SequenceMeta> = {};
    if (parsed.sequenceMeta && typeof parsed.sequenceMeta === "object") {
      for (const [id, m] of Object.entries(parsed.sequenceMeta as Record<string, unknown>)) {
        const meta = m as Partial<SequenceMeta> | null;
        if (meta && typeof meta.name === "string" && typeof meta.stepCount === "number") {
          out[id] = { name: meta.name, stepCount: meta.stepCount };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function persistDraft(
  key: string,
  sheet: ChoreoSheet,
  sequenceMeta?: Record<string, SequenceMeta>
): void {
  try {
    localStorage.setItem(key, JSON.stringify(sequenceMeta ? { ...sheet, sequenceMeta } : sheet));
  } catch {
    // ignore storage errors (quota, private mode)
  }
}
```

**3c — state.** Replace `isHydrating`/`failedIds` internals (keep both PUBLIC getters, now derived — the view keeps working until Task 6):

```ts
const statusById = new SvelteMap<string, RowStatus>();
const failureById = new SvelteMap<string, ResolveFailure>();
const attemptsById = new SvelteMap<string, number>();
const metaById = new SvelteMap<string, SequenceMeta>();
if (deps.persistKey) {
  for (const [id, meta] of Object.entries(loadDraftMeta(deps.persistKey))) metaById.set(id, meta);
}

let generation = 0;
const controllers = new Set<AbortController>();

const roster = $derived<RosterRow[]>(
  sheet.sequenceIds.map((id) => {
    const sequence = cache.get(id) ?? null;
    return {
      id,
      status: sequence ? "ready" : (statusById.get(id) ?? "loading"),
      sequence,
      meta: sequence
        ? { name: metaName(sequence), stepCount: sequence.steps?.length ?? 0 }
        : (metaById.get(id) ?? null),
      failure: sequence ? null : (failureById.get(id) ?? null),
      attempts: attemptsById.get(id) ?? 0,
    };
  })
);
const rosterComplete = $derived(roster.every((r) => r.status === "ready"));

// While ANY row is unresolved the planner input is EMPTY — sequence N+1 is
// never normalized against N−1 across a hole, and no reduced sheet is ever
// paginated, played, or exported (spec §1.3).
const planRows = $derived<SequenceData[]>(
  sheet.sequenceIds.length > 0 && sheet.sequenceIds.every((id) => cache.has(id))
    ? sheet.sequenceIds.map((id) => cache.get(id)!)
    : []
);
```

`metaName(seq)` mirrors the view's existing label chain: `(seq as { displayName?: string }).displayName ?? seq.word ?? seq.name ?? seq.id` — check `SequenceData`'s actual fields and keep the same order the view used (`ChoreoSheetView.svelte:121-125`).

Change `normalizedRows` to fold `planRows` instead of `hydratedSequences` (the fold body at lines 162-174 is otherwise unchanged). `hydratedSequences` (lines 153-157) stays as-is for compat.

**3d — hydration coordinator.** Replace `ensureHydrated` (lines 220-245) and `retryHydration` (248-252):

```ts
async function ensureHydrated(ids: readonly string[]): Promise<void> {
  const targets = ids.filter((id) => !cache.has(id));
  if (targets.length === 0) return;
  const gen = generation;
  const ctrl = new AbortController();
  controllers.add(ctrl);
  try {
    await Promise.all(
      targets.map(async (id) => {
        const prior = statusById.get(id);
        statusById.set(id, prior === "error" || prior === "missing" ? "retrying" : "loading");
        failureById.delete(id);
        try {
          const outcome = await deps.resolveSequence(id, ctrl.signal);
          if (gen !== generation) return; // stale batch — drop
          attemptsById.set(id, outcome.attempts);
          if (outcome.sequence) {
            cache.set(id, outcome.sequence);
            statusById.set(id, "ready");
            metaById.set(id, {
              name: metaName(outcome.sequence),
              stepCount: outcome.sequence.steps?.length ?? 0,
            });
          } else {
            statusById.set(id, outcome.failure === "missing" ? "missing" : "error");
            failureById.set(id, outcome.failure ?? "transient");
          }
        } catch {
          if (gen !== generation || ctrl.signal.aborted) return; // cancelled — not an error
          statusById.set(id, "error");
          failureById.set(id, "transient");
        }
      })
    );
  } finally {
    controllers.delete(ctrl);
    persistMeta();
  }
}

async function retryHydration(id?: string): Promise<void> {
  const targets = id
    ? [id]
    : roster.filter((r) => r.status === "error").map((r) => r.id);
  if (targets.length === 0) return;
  await ensureHydrated(targets);
}

function cancelHydration(): void {
  generation++;
  for (const ctrl of controllers) ctrl.abort();
  controllers.clear();
}

function persistMeta(): void {
  if (!deps.persistKey) return;
  const meta: Record<string, SequenceMeta> = {};
  for (const id of sheet.sequenceIds) {
    const m = metaById.get(id);
    if (m) meta[id] = m;
  }
  persistDraft(deps.persistKey, sheet, meta);
}
```

**3e — invalidation points.** `replaceSheet` and `newSheet` call `cancelHydration()` FIRST (before reassigning `sheet`). `addHydratedSequences` and `seedFromAct` replace their `failedIds.delete(...)` lines with `statusById.delete(id); failureById.delete(id);` and call `persistMeta()` at the end. The construction-time kick (lines 483-485) and the persist `$effect` (490-495) stay — the auth gate lives inside the resolver, and the `$effect` now calls `persistMeta()` instead of bare `persistDraft` (guard: `$effect` still only registered when `persistKey` set, so non-component test construction stays legal).

**3f — return surface.** Add getters `roster`, `rosterComplete`, and method `cancelHydration`; keep every existing getter. Compat getters become:

```ts
get isHydrating() {
  return roster.some((r) => r.status === "loading" || r.status === "retrying");
},
get failedSequenceIds(): ReadonlySet<string> {
  return new Set(roster.filter((r) => r.status === "error" || r.status === "missing").map((r) => r.id));
},
```

- [ ] **Step 4: Run the new + all existing choreo tests**

```
npx vitest run tests/unit/choreo-sheet-roster.test.ts tests/unit/choreo-sheet-annotations.test.ts tests/unit/choreo-sheet-persistence.test.ts tests/unit/choreo-sheet-factory.test.ts
```

Expected: all PASS. The annotations test constructs with `{ loadSequence: async () => null }` — update that stub to `{ resolveSequence: async () => ({ sequence: null, source: null, failure: "missing", attempts: 1 }) }` (it never hydrates anyway; empty sheet).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/state/choreo-sheet-state.svelte.ts tests/unit/choreo-sheet-roster.test.ts tests/unit/choreo-sheet-annotations.test.ts
git commit -m "feat(choreo): roster state machine with gated derived pipeline" -- src/lib/features/write/state/choreo-sheet-state.svelte.ts tests/unit/choreo-sheet-roster.test.ts tests/unit/choreo-sheet-annotations.test.ts
```

### Task 4: cloud repository `sequenceMeta` (back-compat)

**Files:**
- Modify: `src/lib/features/write/services/choreo-sheet-repository.ts`
- Test: extend `tests/unit/choreo-sheet-persistence.test.ts`

- [ ] **Step 1: Add failing test cases** to `tests/unit/choreo-sheet-persistence.test.ts` (follow the file's existing `parseChoreoSheet` suite style):

```ts
it("round-trips sequenceMeta through the draft", () => {
  const sheet = { ...createEmptyChoreoSheet("o"), sequenceIds: ["a"] };
  persistDraft("k", sheet, { a: { name: "CΦ-", stepCount: 8 } });
  expect(loadDraftMeta("k")).toEqual({ a: { name: "CΦ-", stepCount: 8 } });
  expect(loadDraft("k")?.sequenceIds).toEqual(["a"]);
});

it("draft without sequenceMeta parses with empty meta", () => {
  persistDraft("k2", { ...createEmptyChoreoSheet("o"), sequenceIds: ["a"] });
  expect(loadDraftMeta("k2")).toEqual({});
  expect(loadDraft("k2")).not.toBeNull();
});
```

- [ ] **Step 2: Run → the first fails until Task 3's persistence code is present; both pass after.** `npx vitest run tests/unit/choreo-sheet-persistence.test.ts`

- [ ] **Step 3: Repository.** Read `choreo-sheet-repository.ts`; in its zod document schema add an optional field (adapting to the schema's actual style):

```ts
sequenceMeta: z.record(z.object({ name: z.string(), stepCount: z.number() })).optional(),
```

Include `sequenceMeta` in the `saveSheet` payload (source it from a new optional second parameter `saveSheet(sheet, sequenceMeta?)`; `ChoreoSheetView` passes the roster's meta in Task 6) and surface it from the parse path (`parseChoreoSheet` returning it as an optional property on the loaded object, or a parallel accessor — match the file's existing shape; existing docs without the field must parse exactly as before, which the `.optional()` guarantees).

- [ ] **Step 4: Run** `npx vitest run tests/unit/choreo-sheet-persistence.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/choreo-sheet-repository.ts tests/unit/choreo-sheet-persistence.test.ts
git commit -m "feat(choreo): optional sequenceMeta on sheet docs and drafts" -- src/lib/features/write/services/choreo-sheet-repository.ts tests/unit/choreo-sheet-persistence.test.ts
```

### Task 5: skeleton sheet placeholder in the preview

**Files:**
- Modify: `src/lib/features/write/components/sheet/SheetPreviewPages.svelte`

- [ ] **Step 1: Add a `placeholder` input.** New optional prop: `placeholderRoster?: { stepCount: number | null }[]` (view passes `builder.roster.map(r => ({ stepCount: r.meta?.stepCount ?? null }))` when incomplete). When `pages.length === 0 && bandPages.length === 0 && placeholderRoster?.length`, render ONE placeholder page frame (same `.page` element, same `aspect-ratio: {pageAspect}` inline style and grid) whose rows come from the roster: per entry, `Math.ceil((stepCount ?? layout.columns) / layout.columns)` rows of `layout.columns` skeleton cells, capped at the page's row capacity. Use `ShimmerBlock` (`src/lib/shared/components/loading/ShimmerBlock.svelte`) inside each cell at ~58% size, `aria-hidden`. Skeleton must reuse the existing `.sheet-row`/cell geometry classes so real cells swap in with zero layout shift (skeletons-match-layout).

- [ ] **Step 2: Manual render proof.** `npx vitest run tests/unit/choreo-sheet-roster.test.ts` still green (no state change here), then `npm run check:fast` for this file's types. Visual proof lands in Task 13.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/write/components/sheet/SheetPreviewPages.svelte
git commit -m "feat(choreo): reserved skeleton sheet while the roster hydrates" -- src/lib/features/write/components/sheet/SheetPreviewPages.svelte
```

### Task 6: view wiring — resolver, roster UI, word display, Retry all

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`

- [ ] **Step 1: Wire the resolver.** Replace `loadSheetSequence` (lines 65-97) with:

```ts
import { createSheetSequenceResolver } from "../../services/sheet-sequence-resolver";
import { awaitAuthSettled } from "$lib/shared/auth/state/auth-state.svelte";

const resolver = createSheetSequenceResolver({
  loadPrivate: (id) => getLibraryRepository().getSequence(id),
  loadPublic: (id) => getBrowseLoader().loadFullSequenceData(id, id),
  awaitAuthSettled,
});
```

and construct state with `createChoreoSheetState({ resolveSequence: resolver.resolve, persistKey: "tka-choreo-sheet-draft" })`. `handleBrowseSelect` (lines 307-315) used `loadSheetSequence` directly to hydrate picked cards — replace that call with `await resolver.resolve(id, new AbortController().signal)` and use `.sequence`. Add `onDestroy(() => builder.cancelHydration())`.

- [ ] **Step 2: Roster rail rows.** Rework the row list (lines 575-638) to consume `builder.roster` instead of `sequenceIds` + `byId` + `failedSequenceIds`:

- Label: `simplifyRepeatedWord(row.meta?.name ?? row.sequence ? metaName : "…")` — import `simplifyRepeatedWord` from `$lib/shared/foundation/utils/word-simplifier`; render in a `class="tka-font"` span, `font-size: 1.05rem` minimum, full raw name in `title`. This kills the live `simplified-word-display` violation — grep your diff afterward: no raw `.word`/meta name may reach a template unsimplified.
- Count: `row.meta?.stepCount`, `tabular-nums`.
- Status slot: ALWAYS-RESERVED fixed-width slot (~24px). Contents by status: `loading`/`retrying` → `ShimmerBlock` circle; `error` → retry icon-button (visible, `aria-label="Didn't load — retry"`, calls `builder.retryHydration(row.id)`); `missing` → a "not found" glyph + the remove button emphasised; `ready` → empty. Toggle contents with `visibility`/opacity — the slot itself never mounts/unmounts (no `{#if}` around the slot, no `popIn` reflow).
- Row `title` for error rows: "This sequence didn't load automatically. Tap to retry." / missing rows: "Not in your library or the gallery."

- [ ] **Step 3: Retry all + earned error surface.** Add to the state-consuming script:

```ts
let reportedErrorIds = $state<string>("");
$effect(() => {
  const errorIds = builder.roster.filter((r) => r.status === "error").map((r) => r.id);
  const key = errorIds.join(",");
  if (errorIds.length === 0 || key === reportedErrorIds || builder.isHydrating) return;
  reportedErrorIds = key;
  getErrorHandler().showUserError({
    message: `${errorIds.length} sequence${errorIds.length > 1 ? "s" : ""} didn't load — retry from the rail`,
    severity: "warning",
    context: { module: "choreo", tab: "sheet", action: "hydrate-roster" },
    technicalDetails: builder.roster
      .filter((r) => r.status !== "ready")
      .map((r) => `${r.id}: ${r.status}/${r.failure ?? "-"} after ${r.attempts}`)
      .join("\n"),
  });
});
```

Add a "Retry all" button in the rail header, rendered only when ≥2 rows are `error`, calling `builder.retryHydration()`. Migrate the inline `saveMessage`/`exportError` strips (lines 554-563) to `showUserError` calls (severity "warning") and delete the strips — the toolbar must never reflow on error.

- [ ] **Step 4: Gates.** Export-PDF disabled condition changes from `hydratedSequences.length === 0` (lines 375, 532) to `!builder.rosterComplete || builder.roster.length === 0`, tooltip "Waiting for sequences to load" when incomplete. Play-act button gains the same `rosterComplete` condition. Pass the placeholder prop to the preview: `placeholderRoster={builder.rosterComplete ? undefined : builder.roster.map((r) => ({ stepCount: r.meta?.stepCount ?? null }))}`. `save()` passes meta: collect `Object.fromEntries(builder.roster.filter(r => r.meta).map(r => [r.id, r.meta!]))` as `saveSheet`'s second arg.

- [ ] **Step 5: Full choreo test sweep + contract test.**

```
npx vitest run tests/unit/choreo-sheet-roster.test.ts tests/unit/choreo-sheet-annotations.test.ts tests/unit/choreo-sheet-persistence.test.ts tests/unit/choreo-sheet-factory.test.ts tests/unit/public-collection-live-choreo-contract.test.ts
```

The contract test greps `ChoreoSheetView.svelte` source for literal strings (`onAddCollection`, `getCollectionSequences(`, `setPictographSize("large")` …) — keep those call sites intact; if a rename breaks a literal, fix your code, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(choreo): roster-driven rail with auto-recovery UX and simplified TKA words" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

### Task 7: Phase-1 wrap — full check

- [ ] **Step 1:** Respect `resource-budget.md`: PowerShell `(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue` ≥ 4096 and no other `svelte-check` running, then ONE `npm run check > "$env:TEMP/choreo-check.log" 2>&1`; grep the log for errors in files you touched; fix and re-grep the log (do not re-run check to re-filter).
- [ ] **Step 2:** Report: test summary + check result. No commit (nothing new).

---

## Task group B — Phase 2: wide-screen recomposition (AFTER group A lands)

Design reference: the approved sketch `static/sketches/2026-07-25-choreo-4k.html` — open it for the target look (light-table stage, paper-white primary action, identity hairline, continuity connectors). Translate its values into the app's token system (`--theme-*`; component-scoped styles; rem not px for scalables; 14px text floor). The styling skill's 3-layer hierarchy applies.

### Task 8: stage fit policy + 2-up spread

**Files:**
- Modify: `src/lib/features/write/components/sheet/SheetPreviewPages.svelte`
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte` (fit control + pref)

- [ ] **Step 1: Container-size the stage.** In `ChoreoSheetView.svelte`, `.preview-pane` gains `container-type: size; container-name: sheet-stage;`. In `SheetPreviewPages.svelte`, DELETE `max-width: 1100px` (lines ~478-492) and size `.page` with the fit formula:

```css
.page {
  width: min(calc(100cqw - 4.5rem), calc((100cqh - 6rem) * var(--page-aspect)));
}
.pages-scroll.fit-width .page {
  width: calc(100cqw - 4.5rem);
}
.pages-scroll.two-up .page {
  width: min(calc((100cqw - 4.5rem - 2rem) / 2), calc((100cqh - 6rem) * var(--page-aspect)));
}
```

`--page-aspect` is set inline per page from `geo.pageWidthPt / geo.pageHeightPt` (the component already computes `pageAspect` as a string for `aspect-ratio` — add the numeric ratio as a CSS var on `.pages-scroll`). Both branches (flow + annotated) get the sizing; the annotated branch's `--pt: calc(100cqw / pageWidthPt)` container math is per-page (`container-type: inline-size` on `.page.annotated`) and keeps working unchanged because it scales off the page's own width.

- [ ] **Step 2: Fit modes + 2-up.** New prop `fitMode: "page" | "width"` (default `"page"`). 2-up class via a tiny measurement effect (mirror the sketch's rule): when `fitMode === "page" && pages.length > 1` and the stage box (from a `ResizeObserver` on the scroll wrapper, or `element.clientWidth/Height` re-read on resize) satisfies `width - 72 > (height - 96) * aspect * 2 + 32` → add `two-up`. Wrap each page in a `<figure>` with a `<figcaption>` — `Page {n} of {total} · Letter · {orientation}` — 10.5px min → use `0.72rem`, letter-spaced small caps, `tabular-nums`. Keep the IntersectionObserver virtualization untouched.

- [ ] **Step 3: Fit control + persistence.** In `ChoreoSheetView.svelte` toolbar, a two-option `SegmentedControl` (`src/lib/shared/ui/components/SegmentedControl.svelte` — note current path) with options Fit page / Fit width, `size="sm"`, bound to a `fitMode` state persisted in the existing `PICKER_PREFS_KEY` object (extend the load/persist shape at lines ~184-276 with `fitMode`).

- [ ] **Step 4: Sanity + commit.** `npm run check:fast`, then:

```bash
git add src/lib/features/write/components/sheet/SheetPreviewPages.svelte src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(choreo): container-driven stage fit with 2-up spread, 1100px cap removed" -- src/lib/features/write/components/sheet/SheetPreviewPages.svelte src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

### Task 9: rail resize/collapse + toolbar zones + dock width + container-query migration

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`

- [ ] **Step 1: Rail.** Reuse `ResizeHandle` (`src/lib/shared/panels/ResizeHandle.svelte`) between rail and stage; drag range 240–360px; width in a `$state` initialized from `localStorage("tka-choreo-rail-width")`, persisted on drag end; double-click on the handle and an explicit chevron button both toggle collapse to a 48px icon strip (sequences count badge + expand affordance; hide row list + layout controls with `display: none`, keep the strip's buttons ≥44px targets). Mirror `ViewerContentRail.svelte:1-107` conventions — read it first; do not hand-roll new drag logic.

- [ ] **Step 2: Toolbar zones + stage hero.** Restructure the toolbar into identity / secondary / primary zones per the sketch: sheet-name input steps up (via `@container choreo-workspace (min-width: 2200px)`) — root element gains `container-name: choreo-workspace` (it needs `container-type: inline-size`); loop badge keeps its reserved-width ghost sizer; primary zone right-aligned (Add sequences, Save, Export PDF — Export styled as the emphasized action using theme tokens, the sketch's paper-white treatment adapted to `--theme-*` vars); secondary zone (Acts, Play act, fit control) icon+label at wide, icon-only mid-range with `aria-label`s. Add the blue→red identity hairline as a 1px `::after` gradient using `--prop-*`/semantic color vars if they exist (grep `--prop-blue`/`--semantic`; fall back to the literal rgba stops from the sketch). Stage backdrop: subtle radial glow + `--theme-panel-bg`-derived deep tone; page shadow layered per sketch.

- [ ] **Step 3: Dock + breakpoint migration.** `.browse-dock` width → `clamp(400px, 30cqi, 640px)` against the workspace container, with the width-pin contract preserved by introducing `--dock-w: clamp(400px, 30cqi, 640px)` used by BOTH `.browse-dock { width: var(--dock-w) }` and `.browse-dock > :global(*) { width: var(--dock-w) }` (dockSlide clip-reveal stays a non-reflow animation). Replace `@media (max-width: 900px)` (lines ~1428-1442) with `@container choreo-workspace (max-width: 900px)` — same stacked rules; verify the stack still fires by narrowing the window.

- [ ] **Step 4: Contract test + commit.**

```
npx vitest run tests/unit/public-collection-live-choreo-contract.test.ts
npm run check:fast
```

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(choreo): 4K workspace — resizable rail, zoned toolbar, container-query layout" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

### Task 10: PDF parity gate

- [ ] **Step 1:** Confirm zero diffs under `src/lib/features/write/services/` and `src/lib/features/write/domain/` from group B: `git diff --stat -- src/lib/features/write/services src/lib/features/write/domain` → empty output = geometry/planner/exporter untouched = parity by construction. Paste the (empty) output in your report. Visual PDF compare happens in Task 13.

---

## Task group C — Phase 3: thumbnail 404 hygiene (parallel-safe with A)

### Task 11: negative-cache wiring + response.ok gate (TDD)

**Files:**
- Create: `src/lib/shared/browse/services/thumbnail-repair.ts`
- Modify: `src/lib/shared/browse/services/thumbnail-render-orchestrator.ts`
- Modify: `src/lib/shared/browse/components/PropAwareThumbnail.svelte` (PRESERVE the other session's top-of-file comment edit)
- Test: create `tests/unit/browse/thumbnail-repair.test.ts`; update mocks in `src/lib/shared/browse/services/thumbnail-render-orchestrator.test.ts`, `tests/unit/browse/thumbnail-render-orchestrator-failures.test.ts`, `tests/unit/thumbnail-cache-keys.test.ts`

- [ ] **Step 1: Failing tests** — `tests/unit/browse/thumbnail-repair.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const markMissing = vi.fn();
vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  markMissing: (...a: unknown[]) => markMissing(...a),
}));

import { repairThumbnailCaches } from "../../../src/lib/shared/browse/services/thumbnail-repair";
import { saveCloudBlobToLocal } from "../../../src/lib/shared/browse/services/thumbnail-render-orchestrator";

const cloudKey = { sequenceName: "AB", propType: "staff", lightMode: false, variant: "default", showQRCode: false };

describe("repairThumbnailCaches", () => {
  beforeEach(() => markMissing.mockClear());

  it("cloud-404: marks missing + deletes local blob + evicts memory hash", async () => {
    const localCache = { delete: vi.fn(async () => {}) };
    const evictHash = vi.fn();
    await repairThumbnailCaches({ kind: "cloud-404", hash: "h1", cloudKey, localCache, evictHash });
    expect(markMissing).toHaveBeenCalledWith(cloudKey);
    expect(localCache.delete).toHaveBeenCalledWith("h1");
    expect(evictHash).toHaveBeenCalledWith("h1");
  });

  it("blob-decode: purges local tiers but does NOT negative-cache the cloud", async () => {
    const localCache = { delete: vi.fn(async () => {}) };
    const evictHash = vi.fn();
    await repairThumbnailCaches({ kind: "blob-decode", hash: "h2", cloudKey, localCache, evictHash });
    expect(markMissing).not.toHaveBeenCalled();
    expect(localCache.delete).toHaveBeenCalledWith("h2");
    expect(evictHash).toHaveBeenCalledWith("h2");
  });
});

describe("saveCloudBlobToLocal", () => {
  beforeEach(() => markMissing.mockClear());

  const blob = new Blob(["x"]);

  it("writes the blob on 200", async () => {
    const localCache = { set: vi.fn(async () => {}) };
    await saveCloudBlobToLocal("u", "h", cloudKey, localCache, async () => ({ ok: true, status: 200, blob: async () => blob }) as unknown as Response);
    expect(localCache.set).toHaveBeenCalledWith("h", blob);
    expect(markMissing).not.toHaveBeenCalled();
  });

  it("404: no write, negative-caches the cloud key", async () => {
    const localCache = { set: vi.fn(async () => {}) };
    await saveCloudBlobToLocal("u", "h", cloudKey, localCache, async () => ({ ok: false, status: 404, blob: async () => blob }) as unknown as Response);
    expect(localCache.set).not.toHaveBeenCalled();
    expect(markMissing).toHaveBeenCalledWith(cloudKey);
  });

  it("500: no write, NOT negative-cached (stays retryable)", async () => {
    const localCache = { set: vi.fn(async () => {}) };
    await saveCloudBlobToLocal("u", "h", cloudKey, localCache, async () => ({ ok: false, status: 500, blob: async () => blob }) as unknown as Response);
    expect(localCache.set).not.toHaveBeenCalled();
    expect(markMissing).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`repairThumbnailCaches` / exported `saveCloudBlobToLocal` don't exist).

- [ ] **Step 3: Implement.**

`thumbnail-repair.ts` (new):

```ts
/**
 * One shared repair path for a thumbnail whose bytes turned out bad — wired by
 * PropAwareThumbnail's image-error handler. A confirmed cloud 404 is
 * authoritative (markMissing: kills the persisted positive, writes the 24h
 * negative). A blob-decode failure only proves the LOCAL tiers are poisoned.
 */
import { markMissing, type CloudThumbnailKey } from "./cloud-thumbnail-cache";

export interface ThumbnailRepairInput {
  kind: "cloud-404" | "blob-decode";
  hash: string;
  cloudKey: CloudThumbnailKey | null;
  localCache: { delete(hash: string): Promise<void> } | null;
  evictHash: (hash: string) => void;
}

export async function repairThumbnailCaches(input: ThumbnailRepairInput): Promise<void> {
  if (input.kind === "cloud-404" && input.cloudKey) markMissing(input.cloudKey);
  input.evictHash(input.hash);
  await input.localCache?.delete(input.hash).catch(() => {});
}
```

(Check `cloud-thumbnail-cache.ts` for the exported key type name — if it isn't exported as `CloudThumbnailKey`, export it or use the structural type the module's functions accept.)

Orchestrator: extract + gate the cloud-blob save (replace the private method at lines 593-600) and add per-hash eviction:

```ts
/** Fetch a cloud thumbnail body and persist it locally — ONLY on HTTP OK.
 *  fetch() resolves on 404 with an error body; writing that body poisoned
 *  IndexedDB (the stale-404-flood bug). A confirmed 404 negative-caches the
 *  cloud key instead (mirrors offline-cache-orchestrator.ts). Exported for
 *  focused tests; the class method delegates. */
export async function saveCloudBlobToLocal(
  url: string,
  hash: string,
  cloudKey: CloudKeyShape,
  localCache: { set(hash: string, blob: Blob): Promise<void> },
  fetchImpl: typeof fetch = fetch,
  markMissingFn: (key: CloudKeyShape) => void = cloudCacheModule.markMissing
): Promise<void> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      if (response.status === 404) markMissingFn(cloudKey);
      return;
    }
    const blob = await response.blob();
    await localCache.set(hash, blob);
  } catch {
    // Non-fatal — cloud URL still renders; local tier just isn't warmed.
  }
}
```

Class: the call site (~line 369) becomes `void saveCloudBlobToLocal(url, key.hash, this.buildCloudKey(key), this.localCache)`. Add:

```ts
/** Drop one hash from the in-memory URL cache so sibling mounts stop
 *  re-serving a known-bad entry (the flood mechanism). */
evictHash(hash: string): void {
  this.memoryCache.delete(hash);
}
```

(Adapt `memoryCache.delete` to the MemoryUrlCache's actual API — read the class; if it lacks `delete`, add it there.) Note the default-parameter import: bind `markMissing` via the module import the orchestrator already uses for `getUrl`/`upload` so the three existing test mocks keep working once updated.

`PropAwareThumbnail.svelte` — inside `handleImageError` (lines 298-338), replace the `invalidateCloudUrl` block (312-321) with:

```ts
void repairThumbnailCaches({
  kind: urlType === "blob" ? "blob-decode" : "cloud-404",
  hash: key.hash,
  cloudKey: key.usesDefaults ? orchestrator.buildCloudKey(key) : null,
  localCache,
  evictHash: (h) => orchestrator.evictHash(h),
});
```

Keep the debounce, skip-cache flag, and state reset exactly as they are. `forceRerender` (lines 510-542) also routes its steps 1–2 through `repairThumbnailCaches({ kind: "blob-decode", ... })` so the two paths can't drift again (manual force ≠ confirmed 404, hence blob-decode semantics). DO NOT touch the top-of-file comment block.

- [ ] **Step 4: Update the three existing mocks.** Each `vi.mock("...cloud-thumbnail-cache", ...)` factory in `thumbnail-render-orchestrator.test.ts`, `thumbnail-render-orchestrator-failures.test.ts`, `thumbnail-cache-keys.test.ts` gains `markMissing: vi.fn(),`. Run:

```
npx vitest run tests/unit/browse/thumbnail-repair.test.ts src/lib/shared/browse/services/thumbnail-render-orchestrator.test.ts tests/unit/browse/thumbnail-render-orchestrator-failures.test.ts tests/unit/thumbnail-cache-keys.test.ts tests/unit/browse/cloud-thumbnail-cache.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/browse/services/thumbnail-repair.ts src/lib/shared/browse/services/thumbnail-render-orchestrator.ts src/lib/shared/browse/components/PropAwareThumbnail.svelte tests/unit/browse/thumbnail-repair.test.ts src/lib/shared/browse/services/thumbnail-render-orchestrator.test.ts tests/unit/browse/thumbnail-render-orchestrator-failures.test.ts tests/unit/thumbnail-cache-keys.test.ts
git commit -m "fix(thumbnails): confirmed 404s hit the authoritative negative cache; ok-gate cloud blob saves" -- src/lib/shared/browse/services/thumbnail-repair.ts src/lib/shared/browse/services/thumbnail-render-orchestrator.ts src/lib/shared/browse/components/PropAwareThumbnail.svelte tests/unit/browse/thumbnail-repair.test.ts src/lib/shared/browse/services/thumbnail-render-orchestrator.test.ts tests/unit/browse/thumbnail-render-orchestrator-failures.test.ts tests/unit/thumbnail-cache-keys.test.ts
```

---

## Task group D — Phase 4: half-placement paths (parallel-safe with A and C)

### Task 12: grid-invariant segment paths + in-flight dedup (TDD)

**Files:**
- Modify: `src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts`
- Test: create `tests/unit/arrow-placer-segment-paths.test.ts`
- Modify: `.claude/agents/arrow-positioning-expert.md` (knowledge flow-back)

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from "vitest";
import { ArrowPlacer } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer";
import { GridMode } from "../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";

function trackingCache() {
  const requested: string[] = [];
  let loads = 0;
  return {
    requested,
    getLoads: () => loads,
    cache: {
      get: async (path: string) => {
        requested.push(path);
        loads++;
        return {};
      },
    },
  };
}

describe("ArrowPlacer segment placement paths", () => {
  it("box staff bucket requests DIAMOND _half files (segment nudges are grid-mode-invariant)", async () => {
    const t = trackingCache();
    const placer = new ArrowPlacer(t.cache as never);
    await placer.ensureLoaded(GridMode.BOX, "staff");
    const halfPaths = t.requested.filter((p) => p.includes("_half_"));
    expect(halfPaths).toHaveLength(4);
    for (const p of halfPaths) {
      expect(p).toMatch(/\/diamond\/default\/default_diamond_(pro|anti|dash|static)_half_placements\.json$/);
    }
    // full-motion files still box-keyed
    expect(t.requested.some((p) => p.includes("default_box_pro_placements.json"))).toBe(true);
  });

  it("concurrent ensureLoaded calls share one load per bucket", async () => {
    const t = trackingCache();
    const placer = new ArrowPlacer(t.cache as never);
    await Promise.all(
      Array.from({ length: 26 }, () => placer.ensureLoaded(GridMode.BOX, "staff"))
    );
    // 5 motion files + 4 segment files = 9 fetches for ONE bucket, not 26×9
    expect(t.getLoads()).toBe(9);
  });
});
```

(Check the actual `GridMode` import path with grep before writing; adjust the enum import to the real location.)

- [ ] **Step 2: Run → FAIL** (box `_half` paths currently box-keyed; 26 concurrent calls fan out).

- [ ] **Step 3: Implement** in `arrow-placer.ts`:

Segment paths (`filesFor`, lines 82-86) — replace the inner loop:

```ts
if (sub === "") {
  for (const mt of this.segmentMotionTypes) {
    // Segment (half-motion) nudges are authored GLYPH-LOCAL and are
    // grid-mode-invariant by design (arrow-positioning-orchestrator.ts:73-77):
    // one (motionType, turns) value serves every location/direction/grid.
    // The diamond files are the single source of truth — box files must not
    // exist (a second source would contradict the coverage oracle and the
    // WASD authoring harness, both diamond-only on purpose).
    files[mt] = `/data/arrow_placement/diamond/default/default_diamond_${mt}_placements.json`;
  }
}
```

(`mt` is `"pro_half"` etc., so the filename resolves to `default_diamond_pro_half_placements.json` — the files that exist.)

In-flight dedup (`ensureLoaded`, lines 113-126) — mirror `SimpleJsonCache.loadingPromises`:

```ts
private loadingBuckets = new Map<string, Promise<void>>();

async ensureLoaded(gridMode: GridMode, propType: string): Promise<void> {
  if (gridMode === GridMode.SKEWED) {
    await this.ensureLoaded(GridMode.DIAMOND, propType);
    await this.ensureLoaded(GridMode.BOX, propType);
    return;
  }
  const key = `${gridMode}:${propType}`;
  if (this.loadedKeys.has(key)) return;
  let inFlight = this.loadingBuckets.get(key);
  if (!inFlight) {
    inFlight = this.loadPlacements(gridMode, propType)
      .then(() => {
        this.loadedKeys.add(key);
      })
      .finally(() => {
        this.loadingBuckets.delete(key);
      });
    this.loadingBuckets.set(key, inFlight);
  }
  await inFlight;
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/arrow-placer-segment-paths.test.ts` → PASS.

- [ ] **Step 5: Expert flow-back.** In `.claude/agents/arrow-positioning-expert.md`, add to the half/segment section: segment half-placements are grid-mode-invariant; `static/data/arrow_placement/diamond/default/default_diamond_*_half_placements.json` is the single source for ALL grid modes; `arrow-placer.ts filesFor()` deliberately points box (and any future grid) at the diamond files; never author `default_box_*_half_placements.json`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts tests/unit/arrow-placer-segment-paths.test.ts .claude/agents/arrow-positioning-expert.md
git commit -m "fix(arrows): segment half-placements load grid-invariant diamond data; dedup bucket loads" -- src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts tests/unit/arrow-placer-segment-paths.test.ts .claude/agents/arrow-positioning-expert.md
```

Note the rendering-behavior change for the report: box-mode half segments move from the `{x:0,y:0}` fallback to real diamond nudges. Flag it; visual spot-check happens in Task 13.

---

## Task 13: verification (after all groups)

- [ ] Reproduce the original defect path: persisted six-sequence draft → reload `/choreo` → every row resolves with zero manual clicks (needs browser; **read-only evaluation allowed; navigation/typing requires Austen's explicit permission in-conversation — request it, don't assume**).
- [ ] Console clean: no `[PublicSequencesLoader] No sequence found` burst, no half-placement warnings, no Firebase Storage 404 flood on first load and revisit.
- [ ] Screenshots at 3840×2160, 2560×1249 (DPR 1.5, DevTools docked), 1920×1080, ~900px container transition — picker open AND closed, Study AND Annotated, loading AND ready states.
- [ ] Export a PDF; compare page count + slot geometry against preview.
- [ ] Box half-motion pictograph spot-check on `/test/half-movements` (before/after the placement change).
- [ ] Update the spec's implementation ledger checkboxes.

---

## Self-review record

Spec coverage: 1.1→T1, 1.2→T2, 1.3→T3, 1.4→T3+T4, 1.5→T5+T6, 1.5b→T6, 1.6→T2+T3 tests, 2.1→T8, 2.2/2.3/2.4/2.5→T9, 2.6→T13, 3.x→T11, 4.x→T12, ledger→T13. Type consistency: `ResolveOutcome`/`ResolveFailure`/`RowStatus` defined in T2, consumed in T3/T6; `SequenceMeta` defined T3, used T4/T6; `evictHash`/`repairThumbnailCaches` defined and consumed in T11 only.
