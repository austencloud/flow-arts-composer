import { describe, expect, it } from "vitest";
import {
  mergeCodesToCheck,
  pickOneCodePerDeck,
  validateRedirectTarget,
  type RunQueryRow,
} from "../../../scripts/scan-health/decision-logic";

function row(code: string, deckName?: string): RunQueryRow {
  return {
    document: {
      name: `projects/the-kinetic-alphabet/databases/(default)/documents/shortcodes/${code}`,
      fields: deckName ? { deckName: { stringValue: deckName } } : {},
    },
  };
}

describe("pickOneCodePerDeck", () => {
  it("keeps the first (most recent) code per distinct deck", () => {
    const rows = [
      row("NEW1", "LOOP Deck #11"),
      row("OLD1", "LOOP Deck #11"), // same deck, later in the list -> dropped
      row("TND1", "TnD Trilogy"),
    ];
    expect(pickOneCodePerDeck(rows, 10)).toEqual([
      { code: "NEW1", deckName: "LOOP Deck #11" },
      { code: "TND1", deckName: "TnD Trilogy" },
    ]);
  });

  it("drops rows with no deckName — ad-hoc shares, not printed cards", () => {
    const rows = [
      row("ADHOC1"),
      row("ADHOC2", ""),
      row("REAL1", "Starter Pack"),
    ];
    expect(pickOneCodePerDeck(rows, 10)).toEqual([
      { code: "REAL1", deckName: "Starter Pack" },
    ]);
  });

  it("drops rows missing a document (defensive against a malformed response)", () => {
    const rows: RunQueryRow[] = [{}, row("REAL1", "Starter Pack")];
    expect(pickOneCodePerDeck(rows, 10)).toEqual([
      { code: "REAL1", deckName: "Starter Pack" },
    ]);
  });

  it("caps the number of distinct decks returned", () => {
    const rows = [
      row("A1", "Deck A"),
      row("B1", "Deck B"),
      row("C1", "Deck C"),
    ];
    expect(pickOneCodePerDeck(rows, 2)).toHaveLength(2);
  });
});

describe("mergeCodesToCheck", () => {
  const fallback = [
    { code: "ZRRQ", deckName: "LOOP Deck #11" },
    { code: "OLDCODE", deckName: "Starter Pack" },
  ];

  it("prefers live results and tags each entry with its source", () => {
    const live = [{ code: "FRESH1", deckName: "LOOP Deck #12" }];
    const merged = mergeCodesToCheck(live, fallback, 10);
    expect(merged).toEqual([
      { code: "FRESH1", deckName: "LOOP Deck #12", source: "live" },
      { code: "ZRRQ", deckName: "LOOP Deck #11", source: "fallback" },
      { code: "OLDCODE", deckName: "Starter Pack", source: "fallback" },
    ]);
  });

  it("falls back entirely when live discovery found nothing", () => {
    const merged = mergeCodesToCheck([], fallback, 10);
    expect(merged.every((entry) => entry.source === "fallback")).toBe(true);
    expect(merged.map((entry) => entry.code)).toEqual(["ZRRQ", "OLDCODE"]);
  });

  it("drops a fallback entry that live discovery already found (same code)", () => {
    const live = [{ code: "ZRRQ", deckName: "LOOP Deck #11" }];
    const merged = mergeCodesToCheck(live, fallback, 10);
    expect(merged).toHaveLength(2);
    expect(merged.filter((entry) => entry.code === "ZRRQ")).toHaveLength(1);
    expect(merged[0]).toEqual({
      code: "ZRRQ",
      deckName: "LOOP Deck #11",
      source: "live",
    });
  });

  it("caps the combined total", () => {
    const live = [
      { code: "L1", deckName: "D1" },
      { code: "L2", deckName: "D2" },
    ];
    const merged = mergeCodesToCheck(live, fallback, 3);
    expect(merged).toHaveLength(3);
  });
});

describe("validateRedirectTarget", () => {
  const base = {
    requestUrl: "https://tka.run/ZRRQ?healthcheck=1",
    expectedOrigin: "https://tkaflowarts.com",
    expectedPath: "/q/ZRRQ",
    markerParam: "healthcheck",
    markerValue: "1",
  };

  it("passes a correct redirect with the query string preserved", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "https://tkaflowarts.com/q/ZRRQ?healthcheck=1",
    });
    expect(result).toEqual({ ok: true });
  });

  it("resolves a relative Location against the request URL, not blindly as absolute", () => {
    // shortcode-redirect.js always sends an absolute Location, so a relative
    // one here would mean the worker regressed to a same-origin redirect
    // (tka.run/q/... instead of tkaflowarts.com/q/...) — this must still fail.
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "/q/ZRRQ?healthcheck=1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.detail).toMatch(/got https:\/\/tka\.run\/q\/ZRRQ/);
  });

  it("accepts a relative Location when it does resolve onto the expected origin", () => {
    const result = validateRedirectTarget({
      ...base,
      requestUrl: "https://tkaflowarts.com/some-other-path",
      status: 302,
      location: "/q/ZRRQ?healthcheck=1",
    });
    expect(result).toEqual({ ok: true });
  });

  it("fails on a non-redirect status (worker returned the OG page or an error)", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 200,
      location: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/status 200/);
  });

  it("fails when there is no Location header at all", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/no Location header/);
  });

  it("fails when the Location header is not a parseable URL", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "https://[not a url",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/not a valid URL/);
  });

  it("fails when the redirect lands on the wrong origin", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "https://evil.example/q/ZRRQ?healthcheck=1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.detail).toMatch(
        /expected https:\/\/tkaflowarts\.com\/q\/ZRRQ/
      );
  });

  it("fails when the redirect lands on the wrong path (e.g. a different code)", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "https://tkaflowarts.com/q/OTHERCODE?healthcheck=1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.detail).toMatch(
        /got https:\/\/tkaflowarts\.com\/q\/OTHERCODE/
      );
  });

  it("fails when the marker query param was dropped across the redirect", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "https://tkaflowarts.com/q/ZRRQ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.detail).toMatch(/query string was not preserved/);
  });

  it("fails when the marker query param value was mangled", () => {
    const result = validateRedirectTarget({
      ...base,
      status: 302,
      location: "https://tkaflowarts.com/q/ZRRQ?healthcheck=0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.detail).toMatch(/query string was not preserved/);
  });

  it("accepts other redirect status codes (301/303/307/308)", () => {
    for (const status of [301, 303, 307, 308]) {
      const result = validateRedirectTarget({
        ...base,
        status,
        location: "https://tkaflowarts.com/q/ZRRQ?healthcheck=1",
      });
      expect(result).toEqual({ ok: true });
    }
  });
});
