import { describe, expect, it } from "vitest";
import {
  formatSheetRunningTimestamp,
  formatSheetTitleBlock,
} from "#lib/features/write/domain/sheet-title-block.js";

describe("formatSheetTitleBlock", () => {
  it("formats complete title lines", () => {
    expect(
      formatSheetTitleBlock("Act One", {
        showTitleBlock: true,
        choreographer: "  Austen  ",
        songName: "Signal",
        songArtist: "Artist",
        tagline: "  Keep moving. ",
        date: "2026-08-05",
      })
    ).toEqual({
      title: "Act One",
      choreographyLine: "Choreography by Austen",
      songLine: "“Signal” by Artist",
      createdLine: "Created using The Kinetic Alphabet",
      tagline: "Keep moving.",
      date: "2026-08-05",
      runningTitle: "Signal",
    });
  });

  it("preserves blank lines instead of inventing preview placeholders", () => {
    expect(formatSheetTitleBlock("", { showTitleBlock: true })).toEqual({
      title: "Untitled Sheet",
      choreographyLine: "",
      songLine: "",
      createdLine: "Created using The Kinetic Alphabet",
      tagline: "",
      date: "",
      runningTitle: "Untitled Sheet",
    });
  });

  it("keeps useful partial song credits", () => {
    expect(
      formatSheetTitleBlock("Act", { showTitleBlock: true, songName: "Signal" })
        .songLine
    ).toBe("Song: Signal");
    expect(
      formatSheetTitleBlock("Act", {
        showTitleBlock: true,
        songArtist: "Artist",
      }).songLine
    ).toBe("Song by Artist");
  });
});

describe("formatSheetRunningTimestamp", () => {
  it("shares the trimmed running-header copy used by preview and PDF", () => {
    expect(formatSheetRunningTimestamp(" 01:23 ")).toBe("page starts 01:23");
    expect(formatSheetRunningTimestamp("   ")).toBe("");
  });
});
