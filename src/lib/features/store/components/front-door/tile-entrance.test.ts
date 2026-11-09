import { describe, expect, it } from "vitest";
import {
  TILE_STAGGER_MAX_MS,
  TILE_STAGGER_MS,
  tileEntranceDelay,
} from "./tile-entrance";

describe("tileEntranceDelay", () => {
  it("starts the first tile immediately and steps each later one", () => {
    expect(tileEntranceDelay(0, false)).toBe(0);
    expect(tileEntranceDelay(1, false)).toBe(TILE_STAGGER_MS);
    expect(tileEntranceDelay(3, false)).toBe(3 * TILE_STAGGER_MS);
  });

  it("caps the wave so a long shelf never waits", () => {
    expect(tileEntranceDelay(50, false)).toBe(TILE_STAGGER_MAX_MS);
  });

  it("adds no delay under reduced motion", () => {
    expect(tileEntranceDelay(4, true)).toBe(0);
  });

  it("treats bad indexes as the first tile", () => {
    expect(tileEntranceDelay(-2, false)).toBe(0);
    expect(tileEntranceDelay(Number.NaN, false)).toBe(0);
  });
});
