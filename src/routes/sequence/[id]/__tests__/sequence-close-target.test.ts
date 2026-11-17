import { describe, expect, it } from "vitest";
import {
  arrivalProperties,
  resolveSequenceArrival,
  resolveSequenceCloseLanding,
  resolveSequenceCloseTarget,
} from "../sequence-close-target";

describe("sequence page arrival", () => {
  it("calls a scan cold even when the scan page led here inside the app", () => {
    expect(
      resolveSequenceArrival({ scanOrigin: true, reachedInApp: true })
    ).toBe("scan");
  });

  // An Instagram or chat link leaves history behind the page; the old
  // history-length guess read that as an in-app visit.
  it("calls a link opened as the first page cold, whatever history is behind it", () => {
    expect(
      resolveSequenceArrival({ scanOrigin: false, reachedInApp: false })
    ).toBe("link");
  });

  it("is not cold when the app walked here", () => {
    expect(
      resolveSequenceArrival({ scanOrigin: false, reachedInApp: true })
    ).toBeNull();
  });

  it("is not cold when the app handed over a return path, scan or not", () => {
    expect(
      resolveSequenceArrival({
        returnPath: "/browse/collections",
        scanOrigin: true,
        reachedInApp: false,
      })
    ).toBeNull();
  });
});

describe("sequence page Back target", () => {
  it("opens the Composer for a cold scan", () => {
    expect(resolveSequenceCloseTarget({ arrival: "scan" })).toEqual({
      kind: "composer",
    });
  });

  it("opens the Composer for a cold link", () => {
    expect(resolveSequenceCloseTarget({ arrival: "link" })).toEqual({
      kind: "composer",
    });
  });

  it("keeps an explicit handoff return path", () => {
    expect(
      resolveSequenceCloseTarget({
        returnPath: "/browse/collections",
        arrival: null,
      })
    ).toEqual({ kind: "path", path: "/browse/collections" });
  });

  it("goes back in history after an in-app visit", () => {
    expect(resolveSequenceCloseTarget({ arrival: null })).toEqual({
      kind: "history-back",
    });
  });
});

describe("where a close lands", () => {
  // A pressed Back is not a request to edit: their own work stays in front.
  it("opens their own work when Construct holds some, handing nothing over", () => {
    expect(resolveSequenceCloseLanding({ kind: "composer" }, true)).toBe(
      "composer_own_work"
    );
  });

  it("hands this sequence over when Construct is empty", () => {
    expect(resolveSequenceCloseLanding({ kind: "composer" }, false)).toBe(
      "composer_this_sequence"
    );
  });

  it("names a return path and a history step", () => {
    expect(
      resolveSequenceCloseLanding({ kind: "path", path: "/browse" }, true)
    ).toBe("return_path");
    expect(resolveSequenceCloseLanding({ kind: "history-back" }, true)).toBe(
      "history_back"
    );
  });
});

describe("door event arrival property", () => {
  it("tells a cold scan from a cold link and is absent otherwise", () => {
    expect(arrivalProperties("scan")).toEqual({ arrival: "cold_scan" });
    expect(arrivalProperties("link")).toEqual({ arrival: "cold_link" });
    expect(arrivalProperties(null)).toEqual({});
  });
});
