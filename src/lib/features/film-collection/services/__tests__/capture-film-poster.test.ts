// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  captureFilmPoster,
  FILM_POSTER_HEIGHT,
  FILM_POSTER_WIDTH,
} from "../capture-film-poster";

interface DrawCall {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** A canvas stub that records what rectangle of the source got cropped. */
function stubTarget(): { canvas: HTMLCanvasElement; draws: DrawCall[] } {
  const draws: DrawCall[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      drawImage: (
        _source: unknown,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
      ) => {
        draws.push({ sx, sy, sw, sh });
      },
    }),
    toDataURL: () => "data:image/webp;base64,stub",
  } as unknown as HTMLCanvasElement;
  return { canvas, draws };
}

function source(width: number, height: number): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

describe("captureFilmPoster", () => {
  it("returns empty when there is no canvas", () => {
    expect(captureFilmPoster(null)).toBe("");
    expect(captureFilmPoster(undefined)).toBe("");
  });

  it("returns empty when the canvas has not painted yet", () => {
    // A zero-sized canvas is the pre-first-paint state. Empty here is what
    // makes the save modal's preview show nothing, which is the user's cue.
    expect(captureFilmPoster(source(0, 0))).toBe("");
  });

  it("takes the whole frame of a 16:9 source, cropping nothing", () => {
    const { canvas, draws } = stubTarget();
    vi.spyOn(document, "createElement").mockReturnValueOnce(canvas);

    captureFilmPoster(source(1920, 1080));

    // The defect this guards: a square poster would crop 1920 down to 1080,
    // dropping the left and right thirds of the frame — exactly where the
    // outer performers of a group reveal stand.
    expect(draws).toEqual([{ sx: 0, sy: 0, sw: 1920, sh: 1080 }]);
    expect(canvas.width).toBe(FILM_POSTER_WIDTH);
    expect(canvas.height).toBe(FILM_POSTER_HEIGHT);
  });

  it("center-crops a square source to widescreen rather than letterboxing", () => {
    const { canvas, draws } = stubTarget();
    vi.spyOn(document, "createElement").mockReturnValueOnce(canvas);

    captureFilmPoster(source(1000, 1000));

    const expectedHeight = 1000 / (FILM_POSTER_WIDTH / FILM_POSTER_HEIGHT);
    expect(draws[0]!.sw).toBe(1000);
    expect(draws[0]!.sh).toBeCloseTo(expectedHeight, 5);
    expect(draws[0]!.sx).toBe(0);
    expect(draws[0]!.sy).toBeCloseTo((1000 - expectedHeight) / 2, 5);
  });
});
