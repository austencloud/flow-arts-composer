import { describe, expect, it } from "vitest";
import type { ResolvedTakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import {
  mappingPreviewAppearance,
  nextMappedLanding,
} from "$lib/shared/share/components/post-studio/builder/post-timing-animation";
import { overlay, project, video } from "./post-project-fixtures";

describe("take mapping animation", () => {
  it("reads defaults without adding a layer or changing the project", () => {
    const original = project([video("clip")], [[overlay("moves", "moves")]]);
    const before = JSON.stringify(original);
    expect(mappingPreviewAppearance(original, "a")).toMatchObject({
      props: true,
      darkMode: true,
    });
    expect(JSON.stringify(original)).toBe(before);
  });

  it("plays to actual mapped landings across sections and ignores duplicate cut marks", () => {
    const resolved = {
      sections: [
        {
          landings: [
            { position: 1, seconds: 0.75 },
            { position: 2, seconds: 1.9 },
          ],
        },
        {
          landings: [
            { position: 2, seconds: 1.9 },
            { position: 3, seconds: 3.45 },
          ],
        },
      ],
    } as ResolvedTakeTiming;
    expect(nextMappedLanding(resolved, 0)).toBe(0.75);
    expect(nextMappedLanding(resolved, 0.75)).toBe(1.9);
    expect(nextMappedLanding(resolved, 1.9)).toBe(3.45);
    expect(nextMappedLanding(resolved, 3.45)).toBeNull();
  });
});
