// @vitest-environment jsdom
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

  // Dev auto-retry: a hot module replacement can outlast the resolver's ~6s
  // ladder, and because planRows is complete-or-empty ONE stuck row blanks the
  // whole sheet until someone clicks Try again. These lock the recovery.
  describe("dev auto-retry for stuck rows", () => {
    it("retries a transient row on its own and recovers without a manual click", async () => {
      vi.useFakeTimers();
      try {
        let call = 0;
        const resolveSequence = async (id: string) => (++call === 1 ? transient() : ok(id));
        const s = createChoreoSheetState({ resolveSequence });
        s.replaceSheet(sheetWith(["a"]));
        await vi.advanceTimersByTimeAsync(0);
        expect(s.roster[0]!.status).toBe("error");

        // The scheduled retry fires and the row comes back on its own.
        await vi.advanceTimersByTimeAsync(3000);
        expect(s.roster[0]!.status).toBe("ready");
        expect(s.rosterComplete).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("never auto-retries a missing row — that is the server's answer", async () => {
      vi.useFakeTimers();
      try {
        let calls = 0;
        const resolveSequence = async () => {
          calls++;
          return missing();
        };
        const s = createChoreoSheetState({ resolveSequence });
        s.replaceSheet(sheetWith(["gone"]));
        await vi.advanceTimersByTimeAsync(0);
        expect(s.roster[0]!.status).toBe("missing");

        await vi.advanceTimersByTimeAsync(30_000);
        expect(calls).toBe(1);
        expect(s.roster[0]!.status).toBe("missing");
      } finally {
        vi.useRealTimers();
      }
    });

    it("gives up after a bounded number of attempts", async () => {
      vi.useFakeTimers();
      try {
        let calls = 0;
        const resolveSequence = async () => {
          calls++;
          return transient();
        };
        const s = createChoreoSheetState({ resolveSequence });
        s.replaceSheet(sheetWith(["dead"]));
        await vi.advanceTimersByTimeAsync(0);

        await vi.advanceTimersByTimeAsync(120_000);
        // 1 initial + at most the retry budget; never an unbounded spin.
        expect(calls).toBeLessThanOrEqual(6);
        expect(s.roster[0]!.status).toBe("error");
      } finally {
        vi.useRealTimers();
      }
    });
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
