import { describe, expect, it } from "vitest";
import {
  codexScreen,
  codexScreenDepth,
  codexScreenParent,
  writeCodexScreen,
} from "./codex-screen";

const typeOf = (label: string) => (label === "K" ? 2 : label === "A" ? 1 : null);
const read = (query: string, mode: "full-board" | "drill-down" = "drill-down") => {
  const params = new URLSearchParams(query);
  return codexScreen(params, mode, params.get("letter"), typeOf);
};

describe("codexScreen", () => {
  it("is Home with no screen params", () => {
    expect(read("")).toEqual({ kind: "home", type: null, letter: null });
  });
  it("opens a type", () => {
    expect(read("type=3")).toEqual({ kind: "type", type: 3, letter: null });
  });
  it("ignores a type outside 1-6", () => {
    expect(read("type=9").kind).toBe("home");
  });
  it("opens a letter under its own type", () => {
    expect(read("letter=K&grid=box")).toEqual({ kind: "letter", type: 2, letter: "K" });
  });
  it("opens Adjust over Home, a type or a letter", () => {
    expect(read("adjust=1")).toEqual({ kind: "adjust", type: null, letter: null });
    expect(read("type=3&adjust=1")).toEqual({ kind: "adjust", type: 3, letter: null });
    expect(read("letter=K&adjust=1")).toEqual({ kind: "adjust", type: 2, letter: "K" });
  });
  it("opens Links only under a letter", () => {
    expect(read("letter=K&links=1").kind).toBe("links");
    expect(read("links=1").kind).toBe("home");
  });
  it("in full-board mode knows only the board and the dialog", () => {
    expect(read("type=3&adjust=1", "full-board").kind).toBe("home");
    expect(read("letter=K&links=1", "full-board").kind).toBe("letter");
  });
});

describe("parents and depth", () => {
  it("walks Links → Letter → Type → Home", () => {
    const links = read("letter=K&links=1");
    const letter = codexScreenParent(links)!;
    const type = codexScreenParent(letter)!;
    expect(letter.kind).toBe("letter");
    expect(type).toEqual({ kind: "type", type: 2, letter: null });
    expect(codexScreenParent(type)!.kind).toBe("home");
    expect(codexScreenDepth(links)).toBe(3);
  });
  it("returns Adjust to the screen that opened it", () => {
    expect(codexScreenParent(read("adjust=1"))!.kind).toBe("home");
    expect(codexScreenParent(read("type=3&adjust=1"))).toEqual({ kind: "type", type: 3, letter: null });
    expect(codexScreenParent(read("letter=K&adjust=1"))!.kind).toBe("letter");
  });
});

describe("writeCodexScreen", () => {
  const write = (query: string, screen: Parameters<typeof writeCodexScreen>[1]) => {
    const url = new URL(`https://x/codex?${query}`);
    writeCodexScreen(url, screen);
    return url.searchParams.toString();
  };
  it("clears the screen params for Home", () => {
    expect(write("type=3&adjust=1&tf=r", { kind: "home", type: null, letter: null })).toBe("tf=r");
  });
  it("writes type, adjust and links", () => {
    expect(write("", { kind: "type", type: 4, letter: null })).toBe("type=4");
    expect(write("", { kind: "adjust", type: 4, letter: null })).toBe("type=4&adjust=1");
    expect(write("letter=K", { kind: "adjust", type: 2, letter: "K" })).toBe("letter=K&adjust=1");
    expect(write("letter=K", { kind: "links", type: 2, letter: "K" })).toBe("letter=K&links=1");
  });
});
