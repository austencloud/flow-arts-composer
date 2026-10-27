import { describe, expect, it } from "vitest";
import { readScreenParam } from "./guide-screen-url";

describe("readScreenParam", () => {
  it("reads the 1-based screen as a 0-based index", () => {
    expect(readScreenParam("?screen=3")).toBe(2);
    expect(readScreenParam("?prop=staff&screen=1")).toBe(0);
  });
  it("opens on the first screen for a missing or bad value", () => {
    expect(readScreenParam("")).toBe(0);
    expect(readScreenParam("?screen=0")).toBe(0);
    expect(readScreenParam("?screen=abc")).toBe(0);
  });
});
