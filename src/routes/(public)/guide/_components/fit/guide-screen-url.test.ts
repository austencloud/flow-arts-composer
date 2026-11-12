import { describe, expect, it } from "vitest";
import {
  followScreen,
  readScreenParam,
  screenRoom,
  tighterRoom,
} from "./guide-screen-url";

describe("screenRoom bandShowsTagline", () => {
  it("is off on a short window and on in a tall one", () => {
    expect(screenRoom(375, 667).bandShowsTagline).toBe(false);
    expect(screenRoom(960, 412).bandShowsTagline).toBe(false);
    expect(screenRoom(1440, 900).bandShowsTagline).toBe(true);
    expect(screenRoom(1000, 800).bandShowsTagline).toBe(true);
  });
  it("survives a tighter room", () => {
    expect(tighterRoom(screenRoom(375, 667), 2).bandShowsTagline).toBe(false);
    expect(tighterRoom(screenRoom(1440, 900), 2).bandShowsTagline).toBe(true);
  });
});

describe("followScreen", () => {
  const phone = [
    ["intro"],
    ["intro"],
    ["petals"],
    ["level-2"],
    ["level-2"],
    ["matrix"],
  ];
  const laptop = [
    ["intro"],
    ["reading", "petals"],
    ["level-2", "level-3"],
    ["matrix"],
    ["beyond"],
  ];
  it("lands on the screen holding the same topic after a recut", () => {
    expect(followScreen(phone[5]!, laptop)).toBe(3);
    expect(followScreen(laptop[3]!, phone)).toBe(5);
    expect(followScreen(phone[4]!, laptop)).toBe(2);
  });
  it("takes the first screen that holds a topic split across several", () => {
    expect(followScreen(laptop[2]!, phone)).toBe(3);
  });
  it("falls back to a later topic, then to none", () => {
    expect(followScreen(["names", "petals"], laptop)).toBe(1);
    expect(followScreen(["sources"], laptop)).toBe(-1);
  });
});

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
