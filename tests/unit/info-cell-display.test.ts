import { describe, it, expect } from "vitest";
import { getInfoCellCount, infoCellPickOf, infoCellPicks, planInfoCellPick, resolveInfoCellDisplay } from "#lib/shared/sequence-viewer/services/info-cell-display.js";

describe("getInfoCellCount", () => {
  it("returns 0 for one-count and zero-count cards", () => {
    expect(getInfoCellCount({ stepCount: 1, includeStartPlacement: true, startPlacementLayout: "row" })).toBe(0);
    expect(getInfoCellCount({ stepCount: 0, includeStartPlacement: true, startPlacementLayout: "row" })).toBe(0);
  });

  it("returns 0 when start position is hidden (no anchored info scheme)", () => {
    expect(getInfoCellCount({ stepCount: 4, includeStartPlacement: false, startPlacementLayout: "row" })).toBe(0);
  });

  it("4-count row layout has exactly one info cell", () => {
    // LAYOUT_WITH_START_ROW[4] = [2,3] -> cols-1 = 1
    expect(getInfoCellCount({ stepCount: 4, includeStartPlacement: true, startPlacementLayout: "row" })).toBe(1);
  });

  it("4-count column layout has exactly one info cell", () => {
    // LAYOUT_WITH_START_COLUMN[4] = [3,2] -> rows-1 = 1
    expect(getInfoCellCount({ stepCount: 4, includeStartPlacement: true, startPlacementLayout: "column" })).toBe(1);
  });

  it("6-count column layout has two info cells via the accommodation", () => {
    // [3,2] -> accommodation bumps rows to 3 -> rows-1 = 2
    expect(getInfoCellCount({ stepCount: 6, includeStartPlacement: true, startPlacementLayout: "column" })).toBe(2);
  });

  it("6-count row layout has two info cells", () => {
    // LAYOUT_WITH_START_ROW[6] = [3,3] -> cols-1 = 2
    expect(getInfoCellCount({ stepCount: 6, includeStartPlacement: true, startPlacementLayout: "row" })).toBe(2);
  });

  it("honors a step-column override (row layout)", () => {
    // 4 steps forced to 4 step columns, row layout -> cols-1 = 3 info cells
    expect(getInfoCellCount({ stepCount: 4, includeStartPlacement: true, startPlacementLayout: "row", columnCount: 4 })).toBe(3);
  });
});

describe("resolveInfoCellDisplay", () => {
  const base = {
    stepCount: 4,
    includeStartPlacement: true,
    startPlacementLayout: "row" as const,
    isAuthenticated: true,
  };

  it("passes globals through when not both-on (no contention)", () => {
    expect(resolveInfoCellDisplay({ ...base, showQRCode: false, showMandala: true, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: false, showMandala: true });
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: false, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: true, showMandala: false });
  });

  it("reserves a guest QR cell only when its scan link is already published", () => {
    const guest = { ...base, isAuthenticated: false, showQRCode: true, showMandala: false, infoCellChoice: "qr" as const };
    expect(resolveInfoCellDisplay(guest).showQRCode).toBe(false);
    expect(resolveInfoCellDisplay({ ...guest, hasPublishedUrl: true }).showQRCode).toBe(true);
    expect(resolveInfoCellDisplay({ ...guest, hasPublishedUrl: true, showQRCode: false }).showQRCode).toBe(false);
  });

  it("passes globals through when more than one info cell", () => {
    expect(resolveInfoCellDisplay({ ...base, stepCount: 6, showQRCode: true, showMandala: true, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: true, showMandala: true });
  });

  it("one-spot + both on resolves via the choice", () => {
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: true, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: true, showMandala: false });
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: true, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: false, showMandala: true });
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: true, infoCellChoice: "none" }))
      .toEqual({ showQRCode: false, showMandala: false });
  });

  it("guest QR pick degrades to mandala so the cell is never blank", () => {
    expect(resolveInfoCellDisplay({ ...base, isAuthenticated: false, showQRCode: true, showMandala: true, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: false, showMandala: true });
  });

  it("guest multi-cell forces QR off so the mandala fill claims its slot", () => {
    // 6-count row layout = two info cells. A guest can't mint a QR, so QR must
    // resolve off even though the raw toggle is on — otherwise the reserved QR
    // cell renders blank instead of becoming a third/second mandala.
    expect(resolveInfoCellDisplay({ ...base, stepCount: 6, isAuthenticated: false, showQRCode: true, showMandala: true, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: false, showMandala: true });
  });

  it("guest with only QR on resolves QR off (no scannable code to mint)", () => {
    expect(resolveInfoCellDisplay({ ...base, isAuthenticated: false, showQRCode: true, showMandala: false, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: false, showMandala: false });
  });

  it("signed-in multi-cell keeps QR reserved (unchanged)", () => {
    expect(resolveInfoCellDisplay({ ...base, stepCount: 6, isAuthenticated: true, showQRCode: true, showMandala: true, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: true, showMandala: true });
  });
});

describe("the info-cell chooser", () => {
  const card = (stepCount: number) => ({
    stepCount,
    includeStartPlacement: true,
    startPlacementLayout: "row" as const,
    isAuthenticated: true,
  });
  /** Apply a pick's write to stored values, then read the card back. */
  function pickAndResolve(
    stored: {
      showQRCode: boolean;
      showMandala: boolean;
      infoCellChoice: "qr" | "mandala" | "none";
    },
    pick: Parameters<typeof planInfoCellPick>[0],
    stepCount: number,
    isAuthenticated = true
  ) {
    const geometry = { ...card(stepCount), isAuthenticated };
    const write = planInfoCellPick(pick, getInfoCellCount(geometry));
    const next = { ...stored, ...write };
    return infoCellPickOf(resolveInfoCellDisplay({ ...geometry, ...next }));
  }

  it("offers Both only where the card has two or more info cells", () => {
    expect(infoCellPicks(1, true)).toEqual(["qr", "mandala", "none"]);
    expect(infoCellPicks(2, true)).toEqual(["qr", "mandala", "both", "none"]);
    expect(infoCellPicks(0, true)).toEqual([]);
  });

  it("withholds QR and Both from guests", () => {
    expect(infoCellPicks(3, false)).toEqual(["mandala", "none"]);
  });

  // The silent failure: a pick that writes the switches but leaves the card
  // showing something else, e.g. Mandala picked on a one-cell card while the
  // per-length choice still says QR.
  it("every offered pick resolves to itself on one-cell and multi-cell cards", () => {
    const starts = [
      { showQRCode: true, showMandala: true, infoCellChoice: "qr" as const },
      {
        showQRCode: false,
        showMandala: false,
        infoCellChoice: "none" as const,
      },
      {
        showQRCode: true,
        showMandala: false,
        infoCellChoice: "mandala" as const,
      },
    ];
    for (const stepCount of [4, 8, 16]) {
      const count = getInfoCellCount(card(stepCount));
      for (const pick of infoCellPicks(count, true)) {
        for (const stored of starts) {
          expect(
            pickAndResolve(stored, pick, stepCount),
            `${stepCount} ${pick}`
          ).toBe(pick);
        }
      }
    }
  });

  it("a one-cell pick keeps the globals on, so a longer card is unaffected", () => {
    expect(planInfoCellPick("qr", 1)).toEqual({
      showQRCode: true,
      showMandala: true,
      infoCellChoice: "qr",
    });
    expect(planInfoCellPick("none", 1)).toEqual({
      showQRCode: true,
      showMandala: true,
      infoCellChoice: "none",
    });
  });

  it("a multi-cell pick writes the two globals", () => {
    expect(planInfoCellPick("both", 3)).toEqual({
      showQRCode: true,
      showMandala: true,
    });
    expect(planInfoCellPick("mandala", 3)).toEqual({
      showQRCode: false,
      showMandala: true,
    });
    expect(planInfoCellPick("none", 3)).toEqual({
      showQRCode: false,
      showMandala: false,
    });
  });

  it("a guest's leftover QR choice reads as Mandala on a one-cell card", () => {
    const resolved = resolveInfoCellDisplay({
      ...card(4),
      isAuthenticated: false,
      showQRCode: true,
      showMandala: true,
      infoCellChoice: "qr",
    });
    expect(infoCellPickOf(resolved)).toBe("mandala");
    expect(
      pickAndResolve(
        { showQRCode: true, showMandala: true, infoCellChoice: "qr" },
        "none",
        4,
        false
      )
    ).toBe("none");
  });
});
