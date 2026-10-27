import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isOvertureScene, type OvertureScene } from "./overture-trace";
import { buildOvertureScene } from "./overture-snapshot";
import {
  OVERTURE_POOL_IDS,
  overturePoolSequence,
} from "./overture-pool-source";

// The checked-in pool must match what the real calculator draws today; if
// this fails, rerun `npx tsx scripts/build-overture-pool.mjs`.
const pool = JSON.parse(
  readFileSync(resolve(process.cwd(), "static/boot/overture-pool.json"), "utf8")
) as { v: number; scenes: OvertureScene[] };

describe("overture pool", () => {
  it("holds every pool id, each a drawable scene", () => {
    expect(pool.v).toBe(1);
    expect(pool.scenes.map((s) => s.id)).toEqual([...OVERTURE_POOL_IDS]);
    for (const scene of pool.scenes) expect(isOvertureScene(scene)).toBe(true);
  });

  it.each(OVERTURE_POOL_IDS)(
    "%s recomputes from its sequence within 0.1 grid units",
    (id) => {
      const stored = pool.scenes.find((s) => s.id === id)!;
      const fresh = buildOvertureScene(overturePoolSequence(id)!, id)!;
      expect(stored.word).toBe(fresh.word);
      expect(stored.letters).toEqual(fresh.letters);
      expect(stored.unit).toBe(fresh.unit);
      expect(stored.beats).toBe(fresh.beats);
      for (const hand of ["left", "right"] as const) {
        expect(stored[hand].length).toBe(fresh[hand].length);
        stored[hand].forEach((path, k) => {
          const other = fresh[hand][k]!;
          expect(path.length).toBe(other.length);
          path.forEach(([x, y], i) => {
            expect(Math.abs(x - other[i]![0])).toBeLessThanOrEqual(0.1);
            expect(Math.abs(y - other[i]![1])).toBeLessThanOrEqual(0.1);
          });
        });
      }
    }
  );
});
