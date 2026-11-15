import { describe, expect, it } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { ArrowPlacer } from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const ROOT = "/data/arrow_placement/default";
const MOTIONS = ["pro", "anti", "float", "dash", "static"];
const HALVES = ["pro_half", "anti_half", "dash_half", "static_half"];

/** A cache whose get() records each path and waits for the test to answer. */
function handCache() {
  const asked: string[] = [];
  const pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  return {
    asked,
    pending,
    cache: {
      get: (path: string) => {
        asked.push(path);
        return new Promise((resolve, reject) => {
          pending.set(path, { resolve, reject });
        });
      },
    },
  };
}

const dataFor = (path: string) => ({
  key_a: { "0": [path.length, 1], bad: ["x", 2] },
});

const tick = () => new Promise((r) => setTimeout(r, 0));

const staffPaths = [
  ...MOTIONS.map((m) => `${ROOT}/default_${m}_placements.json`),
  ...HALVES.map((m) => `${ROOT}/default_${m}_placements.json`),
];
const fanPaths = MOTIONS.map(
  (m) => `${ROOT}/fan/default_${m}_placements.json`
);

describe("ArrowPlacer loads a bucket's files together", () => {
  it("asks for all nine staff files before any arrives", async () => {
    const h = handCache();
    const placer = new ArrowPlacer(h.cache as never);
    const load = placer.ensureLoaded(GridMode.DIAMOND, "staff");
    await tick();
    expect([...h.asked].sort()).toEqual([...staffPaths].sort());
    for (const [p, c] of h.pending) c.resolve(dataFor(p));
    await load;
    const proPath = `${ROOT}/default_pro_placements.json`;
    await expect(
      placer.getDefaultAdjustment(MotionType.PRO, "key_a", 0)
    ).resolves.toEqual({ x: proPath.length, y: 1 });
  });

  it("asks for all five files of a seeded prop at once", async () => {
    const h = handCache();
    const placer = new ArrowPlacer(h.cache as never);
    const load = placer.ensureLoaded(GridMode.DIAMOND, "fan");
    await tick();
    expect([...h.asked].sort()).toEqual([...fanPaths].sort());
    for (const [p, c] of h.pending) c.resolve(dataFor(p));
    await load;
  });

  it("gives the same data whatever order the files arrive in", async () => {
    async function run(reverse: boolean) {
      const h = handCache();
      const placer = new ArrowPlacer(h.cache as never);
      const load = placer.ensureLoaded(GridMode.DIAMOND, "staff");
      await tick();
      const entries = [...h.pending];
      if (reverse) entries.reverse();
      for (const [p, c] of entries) c.resolve(dataFor(p));
      await load;
      const out: unknown[] = [];
      for (const m of [...MOTIONS, ...HALVES]) {
        out.push(
          await placer.getDefaultAdjustment(m as MotionType, "key_a", 0)
        );
      }
      return out;
    }
    expect(await run(true)).toEqual(await run(false));
  });

  it("rejects with the earliest failing file and stores nothing, then retries", async () => {
    const h = handCache();
    const placer = new ArrowPlacer(h.cache as never);
    const load = placer.ensureLoaded(GridMode.DIAMOND, "staff");
    const settled = load.then(
      () => "ok",
      (e) => e
    );
    await tick();
    // fail a later file first, then an earlier one
    h.pending.get(staffPaths[3]!)!.reject(new Error("late-order"));
    h.pending.get(staffPaths[1]!)!.reject(new Error("early-order"));
    for (const [p, c] of h.pending) c.resolve(dataFor(p));
    expect((await settled).message).toBe("early-order");
    expect(placer.isLoaded()).toBe(false);
    h.asked.length = 0;
    h.pending.clear();
    const again = placer.ensureLoaded(GridMode.DIAMOND, "staff");
    await tick();
    expect(h.asked.length).toBe(9);
    for (const [p, c] of h.pending) c.resolve(dataFor(p));
    await again;
    expect(placer.isLoaded()).toBe(true);
  });
});
