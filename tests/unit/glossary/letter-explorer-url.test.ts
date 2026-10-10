import { describe, expect, it } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  parseLetterExplorerRoute,
  writeLetterExplorerRoute,
} from "../../../src/routes/(public)/atlas/_components/codex-boards/letter-explorer-url";
import { buildComposerDraftHref } from "../../../src/routes/(public)/atlas/_components/codex-boards/letter-explorer-draft";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { parseDeepLink } from "#lib/shared/navigation/services/sequence-encoder.js";

const letters = new Set(["A", "B", "W-"]);

describe("letter explorer URL state", () => {
  it("round-trips the selected grid, variation, and unsaved turn edits", () => {
    const url = new URL("https://tkaflowarts.com/atlas?board=atlas");

    writeLetterExplorerRoute(url, {
      letter: "B",
      gridMode: GridMode.BOX,
      variation: 7,
      leftTurns: 1.5,
      rightTurns: "fl",
      leftRotation: RotationDirection.COUNTER_CLOCKWISE,
      rightRotation: RotationDirection.CLOCKWISE,
    });

    expect(url.hash).toBe("#cat-letter");
    expect(url.searchParams.get("board")).toBe("atlas");
    expect(url.searchParams.get("leftTurns")).toBe("1.5");
    expect(url.searchParams.get("rightTurns")).toBe("fl");
    expect(url.searchParams.has("blueTurns")).toBe(false);
    expect(url.searchParams.has("redTurns")).toBe(false);
    expect(parseLetterExplorerRoute(url.searchParams, letters)).toEqual({
      letter: "B",
      gridMode: GridMode.BOX,
      variation: 7,
      leftTurns: 1.5,
      rightTurns: "fl",
      leftRotation: RotationDirection.COUNTER_CLOCKWISE,
      rightRotation: RotationDirection.CLOCKWISE,
    });
  });

  it("reads published palette-keyed links but prefers current hand keys", () => {
    const legacy = new URLSearchParams(
      "letter=A&blueTurns=0.5&redTurns=1&blueRotation=ccw&redRotation=cw"
    );
    expect(parseLetterExplorerRoute(legacy, letters)).toMatchObject({
      leftTurns: 0.5,
      rightTurns: 1,
      leftRotation: RotationDirection.COUNTER_CLOCKWISE,
      rightRotation: RotationDirection.CLOCKWISE,
    });

    legacy.set("leftTurns", "1.5");
    expect(parseLetterExplorerRoute(legacy, letters)?.leftTurns).toBe(1.5);
  });

  it("keeps canonical links compact when the pictograph is unedited", () => {
    const url = new URL("https://tkaflowarts.com/atlas");

    writeLetterExplorerRoute(url, {
      letter: "W-",
      gridMode: GridMode.DIAMOND,
      variation: 2,
      leftTurns: 0,
      rightTurns: 0,
      leftRotation: RotationDirection.CLOCKWISE,
      rightRotation: RotationDirection.COUNTER_CLOCKWISE,
    });

    expect(url.searchParams.toString()).toBe(
      "letter=W-&grid=diamond&variation=2"
    );
  });

  it("rejects unknown letters and normalizes invalid editor values", () => {
    const unknown = new URLSearchParams("letter=NOPE&grid=box&variation=2");
    expect(parseLetterExplorerRoute(unknown, letters)).toBeNull();

    const malformed = new URLSearchParams(
      "letter=A&grid=elsewhere&variation=-4&blueTurns=99&redTurns=0.25"
    );
    expect(parseLetterExplorerRoute(malformed, letters)).toMatchObject({
      letter: "A",
      gridMode: GridMode.DIAMOND,
      variation: 0,
      leftTurns: 0,
      rightTurns: 0,
    });
  });

  it("removes only explorer-owned parameters when the destination closes", () => {
    const url = new URL(
      "https://tkaflowarts.com/atlas?board=atlas&letter=B&grid=box&variation=3"
    );

    writeLetterExplorerRoute(url, null);

    expect(url.searchParams.toString()).toBe("board=atlas");
  });

  it("hands the draft to the Construct route with a self-contained payload", () => {
    const sequence = createSequenceData({
      id: "letter-b-draft",
      name: "B draft",
      word: "B",
      steps: [],
    });

    const href = buildComposerDraftHref(sequence);
    const parsed = parseDeepLink(href);

    const url = new URL(href, "https://tkaflowarts.com");
    expect(url.pathname).toBe("/create/construct");
    expect(url.searchParams.get("open")?.startsWith("construct:")).toBe(true);
    expect(parsed?.module).toBe("construct");
    expect(parsed?.sequence).toBeDefined();
  });
});
