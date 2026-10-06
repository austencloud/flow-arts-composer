import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import {
  captureGjSlice,
  legacyConjoinedOverride,
  normalizeGridJoinOverride,
  seedFromGjSlice,
} from "./gj-slice";
import {
  decodeViewerStateParams,
  encodeViewerStateParams,
} from "../viewer-url-state-codec";
import { createViewerUrlSession } from "../viewer-url-session";
import { buildViewerShareDetails } from "../viewer-orchestrator-model";

const EAST: GridJoin = { toward: "e", steps: 1 };
const NORTH_TWO: GridJoin = { toward: "n", steps: 2 };

describe("gj slice capture", () => {
  it("emits nothing while the viewer shows the saved join", () => {
    expect(captureGjSlice(undefined, null)).toBeNull();
    expect(captureGjSlice(undefined, EAST)).toBeNull();
    expect(captureGjSlice({ ...EAST }, EAST)).toBeNull();
    expect(captureGjSlice(null, null)).toBeNull();
  });

  it("emits the join when it differs from the saved one", () => {
    expect(captureGjSlice(NORTH_TWO, null)).toEqual(NORTH_TWO);
    expect(captureGjSlice(NORTH_TWO, EAST)).toEqual(NORTH_TWO);
  });

  it("emits off for One grid over a sequence saved with a join", () => {
    expect(captureGjSlice(null, EAST)).toEqual({ off: true });
  });

  it("normalizes an override equal to the saved join to no override", () => {
    expect(normalizeGridJoinOverride({ ...EAST }, EAST)).toBeUndefined();
    expect(normalizeGridJoinOverride(null, null)).toBeUndefined();
    expect(normalizeGridJoinOverride(null, EAST)).toBeNull();
  });
});

describe("gj slice seed", () => {
  it("reads a join and an off marker", () => {
    expect(seedFromGjSlice(NORTH_TWO)).toEqual(NORTH_TWO);
    expect(seedFromGjSlice({ off: true })).toBeNull();
  });

  it("ignores link data that is not a join", () => {
    for (const junk of [
      undefined,
      "n",
      42,
      [],
      {},
      { off: false },
      { toward: "up", steps: 1 },
      { toward: "n", steps: 3 },
      { toward: "n" },
    ]) {
      expect(seedFromGjSlice(junk), JSON.stringify(junk)).toBeUndefined();
    }
  });

  it("round-trips capture -> seed", () => {
    for (const [override, saved] of [
      [NORTH_TWO, null],
      [NORTH_TWO, EAST],
      [null, EAST],
    ] as [GridJoin | null, GridJoin | null][]) {
      expect(seedFromGjSlice(captureGjSlice(override, saved))).toEqual(
        override
      );
    }
  });
});

describe("old Conjoined links", () => {
  const conjoined = { visibility: { gridLayout: "conjoined" } };

  it("still open joined east, one point, when the sequence has no join", () => {
    expect(legacyConjoinedOverride(conjoined, null)).toEqual(EAST);
  });

  it("leave a sequence's own join alone", () => {
    expect(legacyConjoinedOverride(conjoined, NORTH_TWO)).toBeUndefined();
  });

  it("ignore anything else", () => {
    expect(legacyConjoinedOverride(null, null)).toBeUndefined();
    expect(legacyConjoinedOverride({}, null)).toBeUndefined();
    expect(
      legacyConjoinedOverride({ visibility: { gridLayout: "single" } }, null)
    ).toBeUndefined();
  });
});

describe("gj in the viewer link", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("survives an encode/decode round trip in the state blob", () => {
    for (const payload of [NORTH_TWO, { off: true }]) {
      const { set } = encodeViewerStateParams({ gj: payload });
      expect(set.s).toBeTruthy();
      const decoded = decodeViewerStateParams(
        new URLSearchParams({ s: set.s! })
      );
      expect(decoded.gj).toEqual(payload);
    }
  });

  it("travels beside other slices without disturbing them", () => {
    const { set } = encodeViewerStateParams({
      vw: { mode: "card" },
      gj: NORTH_TWO,
    });
    expect(set.pane).toBe("card");
    const decoded = decodeViewerStateParams(new URLSearchParams(set));
    expect(decoded.vw).toEqual({ mode: "card" });
    expect(decoded.gj).toEqual(NORTH_TWO);
  });

  it("leaves a link with no join choice byte-identical", () => {
    const without = encodeViewerStateParams({ vw: { mode: "card" } });
    const nullGj = encodeViewerStateParams({
      vw: { mode: "card" },
      gj: captureGjSlice(undefined, EAST),
    });
    expect(nullGj).toEqual(without);
    expect(encodeViewerStateParams({}).set).toEqual({});
  });

  it("the session's live capture rides the share link and clears when equal to the saved join", () => {
    let override: GridJoin | null | undefined = NORTH_TWO;
    const session = createViewerUrlSession(new URLSearchParams(), {
      writeParams: vi.fn(),
    });
    session.registerSlice("gj", () => captureGjSlice(override, null));

    const shared = session.captureNowAsParams({ full: true });
    expect(decodeViewerStateParams(new URLSearchParams(shared.set)).gj).toEqual(
      NORTH_TWO
    );

    override = undefined;
    expect(session.captureNowAsParams({ full: true }).set.s).toBeUndefined();
  });

  it("a short-code share link keeps its path and carries the join in s", () => {
    const session = createViewerUrlSession(new URLSearchParams(), {
      writeParams: vi.fn(),
    });
    session.registerSlice("gj", () => captureGjSlice(NORTH_TWO, null));

    const details = buildViewerShareDetails({
      sequence: { word: "EHWE", steps: [] } as never,
      bpm: 60,
      darkMode: false,
      fallbackUrl: "https://example.com/sequence/inline",
      buildUrl: () => "https://example.com/sequence/EHWE?bpm=60",
      getStateParams: () => session.captureNowAsParams({ full: true }),
    });
    const url = new URL(details.url);
    expect(url.pathname).toBe("/sequence/EHWE");
    expect(url.searchParams.get("bpm")).toBe("60");
    expect(decodeViewerStateParams(url.searchParams).gj).toEqual(NORTH_TWO);
  });

  it("opens an old link whose an slice asked for Conjoined", () => {
    const { set } = encodeViewerStateParams({
      an: { visibility: { gridLayout: "conjoined" } },
    });
    const decoded = decodeViewerStateParams(new URLSearchParams(set));
    expect(
      legacyConjoinedOverride(
        decoded.an as { visibility?: unknown } | undefined,
        null
      )
    ).toEqual(EAST);
  });
});
