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
  const printed = [
    { code: "DACF4E", deckName: "Timing & Direction Hand Paths" },
    { code: "ELYW", deckName: "LOOP Deck #4" },
  ];

  it("always includes every printed entry, tagged with its source", () => {
    const live = [{ code: "FRESH1", deckName: "LOOP Deck #12" }];
    const merged = mergeCodesToCheck(printed, live, 10);
    expect(merged).toEqual([
      {
        code: "DACF4E",
        deckName: "Timing & Direction Hand Paths",
        source: "printed",
      },
      { code: "ELYW", deckName: "LOOP Deck #4", source: "printed" },
      { code: "FRESH1", deckName: "LOOP Deck #12", source: "live" },
    ]);
  });

  it("still includes every printed entry when live discovery found nothing", () => {
    const merged = mergeCodesToCheck(printed, [], 10);
    expect(merged.every((entry) => entry.source === "printed")).toBe(true);
    expect(merged.map((entry) => entry.code)).toEqual(["DACF4E", "ELYW"]);
  });

  it("drops a live entry whose code duplicates a printed one", () => {
    const live = [{ code: "ELYW", deckName: "LOOP Deck #4" }];
    const merged = mergeCodesToCheck(printed, live, 10);
    expect(merged).toHaveLength(2);
    expect(merged.filter((entry) => entry.code === "ELYW")).toHaveLength(1);
    expect(merged.find((entry) => entry.code === "ELYW")).toEqual({
      code: "ELYW",
      deckName: "LOOP Deck #4",
      source: "printed",
    });
  });

  it("drops a live entry for a deck already covered by a printed entry, even under a different code", () => {
    // Live discovery finding a newer code for a deck PRINTED_CODES already
    // checks isn't useful extra coverage — it would just spend quota
    // re-checking a deck instead of catching a genuinely new one.
    const live = [{ code: "NEWCODE", deckName: "LOOP Deck #4" }];
    const merged = mergeCodesToCheck(printed, live, 10);
    expect(merged).toHaveLength(2);
    expect(merged.some((entry) => entry.code === "NEWCODE")).toBe(false);
  });

  it("caps the combined total without trimming printed entries first", () => {
    const live = [
      { code: "L1", deckName: "D1" },
      { code: "L2", deckName: "D2" },
    ];
    const merged = mergeCodesToCheck(printed, live, 3);
    expect(merged).toHaveLength(3);
    expect(merged.filter((entry) => entry.source === "printed")).toHaveLength(
      2
    );
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
