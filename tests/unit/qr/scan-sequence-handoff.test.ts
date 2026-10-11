import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  buildScanSequenceDestination,
  readScanSequenceCode,
} from "#lib/shared/qr/services/scan-sequence-handoff.js";

describe("scan sequence handoff", () => {
  it("hands a physical scan to the canonical sequence route", () => {
    const destination = new URL(
      buildScanSequenceDestination(
        "CLUB42",
        new URLSearchParams(
          "pid=23456789ABCD&render=3d&vm=solo-blue&pending=download&v=OLD"
        )
      ),
      "https://tkaflowarts.com"
    );

    expect(destination.pathname).toBe("/sequence/CLUB42");
    expect(destination.searchParams.get("from")).toBe("scan");
    expect(destination.searchParams.get("code")).toBe("CLUB42");
    expect(destination.searchParams.get("pid")).toBe("23456789ABCD");
    expect(destination.searchParams.get("render")).toBe("3d");
    expect(destination.searchParams.get("vm")).toBe("solo-blue");
    expect(destination.searchParams.get("pending")).toBe("download");
    expect(destination.searchParams.has("v")).toBe(false);
  });

  it("serializes record-derived props only when the printed URL omitted them", () => {
    const fallback = {
      leftPropType: PropType.CLUB,
      rightPropType: PropType.MINIHOOP,
    };
    const filled = new URL(
      buildScanSequenceDestination("MIXED", new URLSearchParams(), fallback),
      "https://tkaflowarts.com"
    );
    const explicit = new URL(
      buildScanSequenceDestination(
        "MIXED",
        new URLSearchParams("bp=fan&rp=fan"),
        fallback
      ),
      "https://tkaflowarts.com"
    );

    expect(filled.searchParams.get("bp")).toBe("C");
    expect(filled.searchParams.get("rp")).toBe("M");
    expect(explicit.searchParams.get("bp")).toBe("fan");
    expect(explicit.searchParams.get("rp")).toBe("fan");
  });

  it("keeps demo state while still avoiding physical scan semantics", () => {
    const destination = new URL(
      buildScanSequenceDestination("DEMO42", new URLSearchParams("demo=1")),
      "https://tkaflowarts.com"
    );

    expect(destination.searchParams.get("demo")).toBe("1");
    expect(destination.searchParams.get("from")).toBe("scan");
  });

  it("recognizes only matching scan-origin sequence routes", () => {
    expect(
      readScanSequenceCode(
        "CLUB42",
        new URLSearchParams("from=scan&code=CLUB42")
      )
    ).toBe("CLUB42");
    expect(
      readScanSequenceCode(
        "CLUB42",
        new URLSearchParams("from=scan&code=OTHER")
      )
    ).toBeNull();
    expect(
      readScanSequenceCode("CLUB42", new URLSearchParams("code=CLUB42"))
    ).toBeNull();
  });
});
