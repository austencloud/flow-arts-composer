import { describe, expect, it } from "vitest";

import {
  parseFilmKey,
  savedFilmHref,
  savedFilmKey,
} from "#lib/features/film-director/domain/film-director-link.js";

import { isLibraryFilmKey } from "../../../src/routes/test/film-director/_capabilities/index";

/** The registry the Director itself passes in. */
const parse = (raw: string | null) => parseFilmKey(raw, isLibraryFilmKey);

describe("parseFilmKey", () => {
  it("resolves a library key", () => {
    expect(parse("handheld")).toEqual({ kind: "library", key: "handheld" });
  });

  it("resolves a saved id", () => {
    expect(parse("saved:abc123")).toEqual({ kind: "saved", id: "abc123" });
  });

  it("treats a key the library does not have as unknown", () => {
    expect(parse("nope")).toEqual({ kind: "unknown" });
  });

  it("treats missing and empty values as unknown", () => {
    expect(parse(null)).toEqual({ kind: "unknown" });
    expect(parse("")).toEqual({ kind: "unknown" });
    expect(parse("saved:")).toEqual({ kind: "unknown" });
  });

  it("keeps a saved id that would otherwise collide with a library key", () => {
    // The prefix is the only thing keeping the two namespaces apart.
    expect(parse("saved:handheld")).toEqual({ kind: "saved", id: "handheld" });
  });

  it("round-trips a saved id through the key it builds", () => {
    expect(parse(savedFilmKey("xyz"))).toEqual({ kind: "saved", id: "xyz" });
  });
});

describe("savedFilmHref", () => {
  it("round-trips through the URL the Library links to", () => {
    const url = new URL(savedFilmHref("abc123"), "https://example.test");
    expect(url.pathname).toBe("/test/film-director");
    expect(parse(url.searchParams.get("film"))).toEqual({
      kind: "saved",
      id: "abc123",
    });
  });

  it("encodes an id that would otherwise break the query string", () => {
    const href = savedFilmHref("a&b=c");
    expect(href).not.toContain("&b=");
    const url = new URL(href, "https://example.test");
    expect(parse(url.searchParams.get("film"))).toEqual({
      kind: "saved",
      id: "a&b=c",
    });
  });
});
