import { describe, expect, it } from "vitest";
import { mandalaAddress, readMandalaAddress } from "./mandala-place-address";

const BASE = "https://localhost:5173/browse/explore/sequences";
const FAMILY = "6a6a5155-944~tnd-split-same-cccc__t_0p5-1";

describe("the By mandala address", () => {
  it("reads closed, open, and open on a level", () => {
    expect(readMandalaAddress(new URL(`${BASE}?sort=new`))).toEqual({ open: false, level: null });
    expect(readMandalaAddress(new URL(`${BASE}?mandala`))).toEqual({ open: true, level: null });
    expect(readMandalaAddress(new URL(`${BASE}?mandala=3`))).toEqual({ open: true, level: 3 });
  });

  it("opens an old family link at the start, and ignores levels out of range", () => {
    expect(readMandalaAddress(new URL(`${BASE}?mandala=${FAMILY}&seq=abc`))).toEqual({
      open: true,
      level: null,
    });
    expect(readMandalaAddress(new URL(`${BASE}?mandala=0`))).toEqual({ open: true, level: null });
    expect(readMandalaAddress(new URL(`${BASE}?mandala=6`))).toEqual({ open: true, level: 6 });
    expect(readMandalaAddress(new URL(`${BASE}?mandala=7`))).toEqual({ open: true, level: null });
  });

  it("writes the level, keeps other parameters, and drops the old row", () => {
    const from = new URL(`${BASE}?sort=new&mandala=${FAMILY}&seq=abc`);
    expect(mandalaAddress(from, { open: true, level: 4 }).search).toBe("?sort=new&mandala=4");
    expect(mandalaAddress(from, { open: true, level: null }).search).toBe("?sort=new&mandala");
    expect(mandalaAddress(from, { open: false, level: 4 }).search).toBe("?sort=new");
  });

  it("reads back what it writes", () => {
    const base = new URL(`${BASE}?sort=new`);
    for (const state of [
      { open: true, level: 2 },
      { open: true, level: null },
      { open: false, level: null },
    ]) {
      expect(readMandalaAddress(mandalaAddress(base, state))).toEqual(state);
    }
  });
});
