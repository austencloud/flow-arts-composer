import { describe, expect, it } from "vitest";
import { mandalaAddress, readMandalaAddress } from "./mandala-place-address";

const BASE = "https://localhost:5173/browse/explore/sequences";
const FAMILY = "6a6a5155-944~tnd-split-same-cccc__t_0p5-1";

describe("the By mandala address", () => {
  it("reads closed, the wall, a page and a chosen row", () => {
    expect(readMandalaAddress(new URL(`${BASE}?sort=new`))).toEqual({
      open: false,
      familyValue: null,
      sequenceId: null,
    });
    expect(readMandalaAddress(new URL(`${BASE}?mandala`))).toEqual({
      open: true,
      familyValue: null,
      sequenceId: null,
    });
    expect(readMandalaAddress(new URL(`${BASE}?mandala=${FAMILY}&seq=abc`))).toEqual({
      open: true,
      familyValue: FAMILY,
      sequenceId: "abc",
    });
  });

  it("ignores a chosen row without a mandala", () => {
    expect(readMandalaAddress(new URL(`${BASE}?mandala&seq=abc`))).toEqual({
      open: true,
      familyValue: null,
      sequenceId: null,
    });
    expect(readMandalaAddress(new URL(`${BASE}?seq=abc`)).open).toBe(false);
  });

  it("writes the wall as a bare ?mandala and keeps other params", () => {
    const url = mandalaAddress(new URL(`${BASE}?source=saved`), {
      open: true,
      familyValue: null,
      sequenceId: "dropped",
    });
    expect(url.search).toBe("?source=saved&mandala");
  });

  it("round-trips family values with ~ and shape keys exactly", () => {
    const odd = "a b~key/with+plus&amp=%20~2";
    for (const familyValue of [FAMILY, odd]) {
      const state = { open: true, familyValue, sequenceId: "id with space" };
      const url = mandalaAddress(new URL(`${BASE}?source=saved#top`), state);
      expect(readMandalaAddress(new URL(url.href))).toEqual(state);
      expect(url.searchParams.get("source")).toBe("saved");
      expect(url.hash).toBe("#top");
    }
  });

  it("closing removes both params and leaves the rest alone", () => {
    const url = mandalaAddress(new URL(`${BASE}?a=1&mandala=${FAMILY}&seq=x&b=2`), {
      open: false,
      familyValue: FAMILY,
      sequenceId: "x",
    });
    expect(url.search).toBe("?a=1&b=2");
    const closed = mandalaAddress(new URL(`${BASE}?mandala`), {
      open: false,
      familyValue: null,
      sequenceId: null,
    });
    expect(closed.href).toBe(BASE);
  });
});
