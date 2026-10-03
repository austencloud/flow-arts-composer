import { describe, expect, it } from "vitest";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { project, take, video } from "./post-project-fixtures";

describe("manifest bridge guard", () => {
  const base = { ...project([video("v1")]), takes: [take("a")] };

  it("lets a take's name change", () => {
    const renamed = {
      ...base,
      takes: base.takes.map((entry) => ({
        ...entry,
        label: "ΩΛ-XJ — breakdown",
      })),
    };
    expect(bridgeLockedChange(base, renamed)).toBeNull();
  });

  it("still locks the take's media", () => {
    const moved = {
      ...base,
      takes: base.takes.map((entry) => ({ ...entry, durationSeconds: 99 })),
    };
    expect(bridgeLockedChange(base, moved)).toBe("takes");
  });
});
