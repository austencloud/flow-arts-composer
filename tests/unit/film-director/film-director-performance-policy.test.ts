import { describe, expect, it } from "vitest";

import { QualityTier } from "#lib/shared/3d/effects/types.js";
import {
  resolveDirectorPerformerPoolSize,
  resolveFilmDirectorEffectQualityTier,
} from "../../../src/routes/test/film-director/_lib/film-director-performance-policy";

describe("film director effect quality", () => {
  it("keeps close casts rich and caps ensemble multiplication", () => {
    expect(resolveFilmDirectorEffectQualityTier(3)).toBe(QualityTier.HIGH);
    expect(resolveFilmDirectorEffectQualityTier(4)).toBe(QualityTier.MEDIUM);
    expect(resolveFilmDirectorEffectQualityTier(6)).toBe(QualityTier.LOW);
    expect(resolveFilmDirectorEffectQualityTier(8)).toBe(QualityTier.LOW);
  });

  it("keeps the film's largest cast alive between smaller scenes", () => {
    expect(resolveDirectorPerformerPoolSize(3, 8)).toBe(8);
    expect(resolveDirectorPerformerPoolSize(8, 8)).toBe(8);
    expect(resolveDirectorPerformerPoolSize(10, 8)).toBe(10);
    expect(resolveDirectorPerformerPoolSize(3)).toBe(3);
  });
});
