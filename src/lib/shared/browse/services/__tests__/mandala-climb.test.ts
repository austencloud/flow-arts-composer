// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths, MandalaPoint } from "#lib/shared/mandala/domain/mandala-types.js";
import type { MandalaFamilyBook } from "#lib/shared/mandala/services/mandala-family-book.js";
import { shapeOutline } from "#lib/shared/mandala/services/mandala-family.js";
import {
  measureDistancesInSlices,
  type MandalaDistanceRunner,
} from "#lib/shared/mandala/services/mandala-distance-runner.js";
import {
  createMandalaClimb,
  mandalaFamilyValue,
  parseMandalaFamilyValue,
  type MandalaClimbSource,
  type MandalaFamilyBookStore,
} from "../mandala-climb.svelte";
import type { MandalaGroup } from "../mandala-index.svelte";
import { seedMandalaSignature } from "../sequence-density";
import { filterByMandalaFamily } from "../browse-filter";

const paths = (left: MandalaPoint[][], right: MandalaPoint[][] = []): MandalaPaths => ({
  left: left.map((p, tipIndex) => ({ d: "", tipIndex, beats: [p] })),
  right: right.map((p, tipIndex) => ({ d: "", tipIndex, beats: [p] })),
  purple: [],
});

function ring(radius: number): MandalaPoint[] {
  return Array.from({ length: 121 }, (_, i) => {
    const a = (i / 120) * 2 * Math.PI;
    return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  });
}

function comma(radius: number): MandalaPoint[] {
  return Array.from({ length: 121 }, (_, i) => {
    const t = i / 120;
    const a = t * 1.5 * Math.PI;
    const r = radius * (0.35 + 0.65 * t);
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

/** A sequence the climb can look up, with its shape key planted. */
function drawing(id: string, key: string): SequenceData {
  const sequence = { id, word: "AAAA", steps: [{}] } as unknown as SequenceData;
  seedMandalaSignature(sequence, { key, coverage: 0, spaces: 0 });
  return sequence;
}

function group(
  key: string,
  figure: MandalaPaths,
  count: number,
  spaces: number,
  coverage: number
): MandalaGroup {
  return {
    key,
    coverage,
    spaces,
    sequences: Array.from({ length: count }, (_, i) => drawing(`${key}-seq${i}`, key)),
    paths: figure,
  };
}

// "a" and "b" are one comma drawn by either hand: distance 0, one family,
// and "b" is drawn more, so it represents. The rings are far from everything.
const a = group("a", paths([comma(120)]), 2, 9, 0.5);
const b = group("b", paths([], [comma(120)]), 5, 0, 0.4);
const big = group("big", paths([ring(140)]), 1, 1, 0.1);
const small = group("small", paths([ring(40)]), 3, 1, 0.2);
const extra = group("extra", paths([ring(90), ring(20)]), 1, 2, 0.3);

/** An index stand-in the test feeds by hand. */
function source(): MandalaClimbSource & {
  show(groups: MandalaGroup[]): void;
  measuring(): void;
  showEmpty(): void;
} {
  let groups: MandalaGroup[] = [];
  let done = false;
  let empty = false;
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());
  return {
    get done() {
      return done;
    },
    get empty() {
      return empty;
    },
    showEmpty() {
      groups = [];
      done = false;
      empty = true;
      tell();
    },
    get groups() {
      return groups;
    },
    groupOf: (key) => groups.find((g) => g.key === key),
    sequenceById: (id) => groups.flatMap((g) => g.sequences).find((s) => s.id === id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(next) {
      groups = next;
      done = true;
      tell();
    },
    measuring() {
      done = false;
      tell();
    },
  };
}

function memoryBooks() {
  let saved: MandalaFamilyBook | null = null;
  const store: MandalaFamilyBookStore = {
    load: async () => saved,
    save: async (book) => {
      saved = book;
    },
  };
  return { store, saved: () => saved };
}

function countingRunner() {
  const asked: number[] = [];
  const runner: MandalaDistanceRunner = (job, options) => {
    asked.push(job.pairs.length / 2);
    return measureDistancesInSlices(job, options);
  };
  return { runner, asked };
}

const soon = (work: (budgetMs: number) => void) => {
  const handle = setTimeout(() => work(1000), 0);
  return () => clearTimeout(handle);
};

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(check()).toBe(true);
}

describe("the mandala climb", () => {
  it("orders families simple to complex and represents each by its most-drawn shape", async () => {
    const index = source();
    const books = memoryBooks();
    const climb = createMandalaClimb({ index, store: books.store, scheduler: soon });
    expect(climb.ready).toBe(false);
    expect(climb.fan).toEqual([]);

    index.show([big, a, small, b]);
    // Before families land, the fan picks from the measured shapes as given.
    expect(climb.fan.map((g) => g.key)).toEqual(["big", "a", "b"]);
    const before = climb.version;
    await until(() => climb.ready);

    expect(climb.version).toBeGreaterThan(before);
    expect(climb.progress).toBe(1);
    expect(climb.families.map((f) => f.id)).toEqual(["b", "big", "small"]);
    const commas = climb.families[0]!;
    expect(commas.representative).toBe(b);
    expect(commas.members.map((m) => m.key)).toEqual(["b", "a"]);
    expect(commas.sequenceCount).toBe(7);
    expect(commas.value).toBe("b~b-seq0");
    expect(climb.fan.map((g) => g.key)).toEqual(["b", "big", "small"]);
    expect(books.saved()?.keys).toHaveLength(4);
  });

  it("links from the saved book on a return visit and measures only a new shape's pairs", async () => {
    const books = memoryBooks();
    const first = countingRunner();
    const index = source();
    const climb = createMandalaClimb({ index, store: books.store, measure: first.runner, scheduler: soon });
    index.show([a, b, big, small]);
    await until(() => climb.ready);
    expect(first.asked).toEqual([6]);

    // A new visit: a fresh climb over the same shapes makes no outline and
    // starts no measuring.
    const again = countingRunner();
    let outlines = 0;
    const revisit = source();
    const returned = createMandalaClimb({
      index: revisit,
      store: books.store,
      measure: again.runner,
      scheduler: soon,
      outline: (p) => {
        outlines++;
        return shapeOutline(p);
      },
    });
    revisit.show([a, b, big, small]);
    await until(() => returned.ready);
    expect(again.asked).toEqual([]);
    expect(outlines).toBe(0);
    expect(returned.families.map((f) => f.id)).toEqual(climb.families.map((f) => f.id));

    // The pool gains one shape: only its four pairs are measured.
    revisit.measuring();
    revisit.show([a, b, big, small, extra]);
    await until(() => returned.families.length === 4);
    expect(again.asked).toEqual([4]);
    expect(returned.families.map((f) => f.id)).toEqual(["b", "big", "small", "extra"]);
    expect(books.saved()?.keys).toHaveLength(5);
  });

  it("drops a build for a pool that was replaced", async () => {
    const index = source();
    const climb = createMandalaClimb({ index, store: memoryBooks().store, scheduler: soon });
    index.show([a, b, big]);
    index.show([big, small]);
    await until(() => climb.ready);
    expect(climb.families.map((f) => f.id)).toEqual(["big", "small"]);
  });

  it("finds a family from a full value, a bare key, and a sequence whose key is gone", async () => {
    const index = source();
    const climb = createMandalaClimb({ index, store: memoryBooks().store, scheduler: soon });
    index.show([a, b, big]);
    expect(climb.familyOf("b~b-seq0")).toBeUndefined();
    await until(() => climb.ready);

    expect(climb.familyOf("b~b-seq0")?.id).toBe("b");
    expect(climb.familyOf("a")?.id).toBe("b");
    // A re-measure renamed the shape; the named sequence still draws "a".
    expect(climb.familyOf("renamed~a-seq1")?.id).toBe("b");
    expect(climb.familyOf("renamed")).toBeUndefined();
    expect(climb.familyOf("")).toBeUndefined();
  });

  it("matches the named shape before families land and the whole family after", async () => {
    const index = source();
    const climb = createMandalaClimb({ index, store: memoryBooks().store, scheduler: soon });
    index.show([a, b, big]);
    const pool = [...a.sequences, ...b.sequences, ...big.sequences];
    const value = mandalaFamilyValue(a);

    expect(climb.keysFor(value)).toEqual(new Set(["a"]));
    expect(filterByMandalaFamily(pool, value, climb)).toEqual([...a.sequences]);

    await until(() => climb.ready);
    expect(climb.keysFor(value)).toEqual(new Set(["a", "b"]));
    expect(filterByMandalaFamily(pool, value, climb)).toEqual([...a.sequences, ...b.sequences]);
    expect(filterByMandalaFamily(pool, "", climb)).toEqual([]);
  });

  it("keeps the last families serving while a new pool is measured", async () => {
    const index = source();
    const climb = createMandalaClimb({ index, store: memoryBooks().store, scheduler: soon });
    index.show([a, b, big]);
    await until(() => climb.ready);
    const first = climb.families;
    const value = mandalaFamilyValue(a);

    index.measuring();
    index.show([a, b, big, small]);
    expect(climb.ready).toBe(true);
    expect(climb.families).toBe(first);
    expect(climb.keysFor(value)).toEqual(new Set(["a", "b"]));
    expect(climb.familyOf(value)?.id).toBe("b");

    const before = climb.version;
    await until(() => climb.families.length === 3);
    expect(climb.version).toBe(before + 1);
    expect(climb.progress).toBe(1);
    expect(climb.keysFor(value)).toEqual(new Set(["a", "b"]));
  });

  it("relinks without measuring when only sequence counts change", async () => {
    const counted = countingRunner();
    const index = source();
    const climb = createMandalaClimb({
      index,
      store: memoryBooks().store,
      measure: counted.runner,
      scheduler: soon,
    });
    index.show([a, b, big]);
    await until(() => climb.ready);
    expect(climb.families[0]!.representative.key).toBe("b");

    // "a" is now drawn most, so it represents the commas.
    const moreA = group("a", a.paths, 9, 9, 0.5);
    index.show([moreA, b, big]);
    expect(climb.families.find((f) => f.id === "a")?.representative).toBe(moreA);
    expect(counted.asked).toEqual([3]);
  });

  it("falls back to lone shapes when measuring fails, and tries again on the next pool", async () => {
    let fail = true;
    const runner: MandalaDistanceRunner = (job, options) =>
      fail ? Promise.reject(new Error("worker died")) : measureDistancesInSlices(job, options);
    const index = source();
    const climb = createMandalaClimb({ index, store: memoryBooks().store, measure: runner, scheduler: soon });
    index.show([a, b, big]);
    await until(() => climb.ready);
    expect(climb.families.map((f) => f.members.length)).toEqual([1, 1, 1]);

    fail = false;
    index.show([a, b, big]);
    await until(() => climb.families.length === 2);
    expect(climb.familyOf("a")?.id).toBe("b");
  });

  it("is ready with no families for an empty pool, and not before one is set", async () => {
    const index = source();
    const climb = createMandalaClimb({ index, store: memoryBooks().store, scheduler: soon });
    expect(climb.ready).toBe(false);
    index.showEmpty();
    await until(() => climb.ready);
    expect(climb.families).toEqual([]);
    expect(climb.fan).toEqual([]);
  });

  it("reads and writes filter values", () => {
    expect(parseMandalaFamilyValue("abc-12~seq-1")).toEqual({ key: "abc-12", sequenceId: "seq-1" });
    expect(parseMandalaFamilyValue("abc-12")).toEqual({ key: "abc-12" });
  });
});
