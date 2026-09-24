import { describe, it, expect } from "vitest";
import {
  describeFilm,
  formatFilmDuration,
  latestFilmForSequence,
} from "../film-share-summary";
import type { RenderedFilmSummary } from "../../services/rendered-film-store";

function film(
  id: string,
  sequenceId: string | null,
  createdAt: number
): RenderedFilmSummary {
  return {
    id,
    filmEntryId: null,
    sequenceId,
    word: "ABC",
    mimeType: "video/mp4",
    byteSize: 1,
    render: {
      fps: 30,
      resolution: 1080,
      quality: "standard",
      includeStartPlacement: true,
      includeEndHold: true,
    },
    durationSeconds: 24.4,
    createdAt,
  };
}

describe("latestFilmForSequence", () => {
  it("picks the newest film of that sequence, whatever the list order", () => {
    const films = [
      film("a", "s1", 10),
      film("b", "s2", 99),
      film("c", "s1", 30),
    ];
    expect(latestFilmForSequence(films, "s1")?.id).toBe("c");
  });

  it("offers nothing for another sequence or an unsaved one", () => {
    const films = [film("a", "s1", 10), film("b", null, 20)];
    expect(latestFilmForSequence(films, "s9")).toBeNull();
    expect(latestFilmForSequence(films, null)).toBeNull();
  });
});

describe("describeFilm", () => {
  it("reads length first, then the square 3D frame and rate", () => {
    expect(describeFilm(film("a", "s1", 1))).toBe("0:24 • 1080×1080 • 30 fps");
  });

  it("rolls seconds into minutes", () => {
    expect(formatFilmDuration(65)).toBe("1:05");
    expect(formatFilmDuration(Number.NaN)).toBe("0:00");
  });
});
