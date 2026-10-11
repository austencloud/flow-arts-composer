import { describe, expect, it } from "vitest";
import {
  CHARACTER_PRESENTATION,
  charactersWithPresentation,
  countCharacterPresentations,
  type CharacterPresentation,
} from "#lib/shared/3d/config/character-presentation.js";
import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
import { CHARACTER_DEFINITIONS } from "#lib/shared/3d/domain/character-model.js";
import {
  TikaDirectorRequestSchema,
  TikaDirectorResponseSchema,
  TIKA_DIRECTOR_PRESENTATIONS,
} from "#lib/features/stage/domain/tika-director.js";
import { validateTikaDirectorPlanCatalog } from "#lib/features/stage/domain/tika-director-plan-validation.js";
import { resolveDirectorAppearanceAssignments } from "#lib/features/stage/services/tika-director-service.js";

const scene = {
  id: "s",
  name: "S",
  bpm: 120,
  currentBeat: 0,
  performers: ["A", "B", "C"].map((label) => ({
    id: label,
    label,
    characterId: "x-bot",
    prop: "staff",
  })),
  formations: [],
};

describe("character presentation labels", () => {
  it("labels every character in the catalog, deployed or not", () => {
    for (const character of CHARACTER_DEFINITIONS) {
      expect(
        TIKA_DIRECTOR_PRESENTATIONS,
        `${character.id} has no presentation label`
      ).toContain(CHARACTER_PRESENTATION[character.id]);
    }
  });

  it("partitions the deployed catalog by label with no overlap", () => {
    const pools = TIKA_DIRECTOR_PRESENTATIONS.map((presentation) =>
      charactersWithPresentation(presentation)
    );
    expect(pools.flat().sort()).toEqual([...DEPLOYED_CHARACTER_IDS].sort());
    const counts = countCharacterPresentations();
    for (const [index, presentation] of TIKA_DIRECTOR_PRESENTATIONS.entries()) {
      expect(counts[presentation]).toBe(pools[index]!.length);
    }
  });

  it("keeps the two Mixamo robots on the labels their descriptions state", () => {
    expect(CHARACTER_PRESENTATION["x-bot"]).toBe("masculine");
    expect(CHARACTER_PRESENTATION["y-bot"]).toBe("feminine");
  });
});

describe("presentation in the director contract", () => {
  it("accepts an optional presentation on assign-distinct-characters only", () => {
    const parse = (actions: unknown[]) =>
      TikaDirectorResponseSchema.safeParse({
        kind: "apply",
        summary: "ok",
        actions,
      }).success;
    expect(
      parse([{ type: "assign-distinct-characters", presentation: "feminine" }])
    ).toBe(true);
    expect(parse([{ type: "assign-distinct-characters" }])).toBe(true);
    expect(
      parse([{ type: "assign-distinct-characters", presentation: "female" }])
    ).toBe(false);
    expect(
      parse([{ type: "assign-distinct-props", presentation: "feminine" }])
    ).toBe(false);
  });

  it("carries per-label catalog counts in the scene", () => {
    expect(
      TikaDirectorRequestSchema.safeParse({
        prompt: "make them all female",
        conversation: [],
        scene: {
          ...scene,
          characterPresentationCounts: {
            masculine: 6,
            feminine: 6,
            androgynous: 4,
          },
        },
      }).success
    ).toBe(true);
    expect(
      TikaDirectorRequestSchema.safeParse({
        prompt: "make them all female",
        conversation: [],
        scene: { ...scene, characterPresentationCounts: { feminine: 6 } },
      }).success
    ).toBe(false);
  });
});

describe("presentation catalog admission", () => {
  const feminine = {
    kind: "apply" as const,
    summary: "Assign distinct feminine avatars.",
    actions: [
      {
        type: "assign-distinct-characters" as const,
        presentation: "feminine" as const,
      },
    ],
  };

  it("vetoes a filtered assignment the deployed pool cannot cover", () => {
    const eight = {
      ...scene,
      performers: "ABCDEFGH".split("").map((label) => ({
        id: label,
        label,
        characterId: "x-bot",
        prop: "staff",
      })),
      characterPresentationCounts: {
        masculine: 6,
        feminine: 6,
        androgynous: 4,
      },
    };
    const result = validateTikaDirectorPlanCatalog({ scene: eight }, feminine);
    expect(result.kind).toBe("unsupported");
    expect(result.kind === "unsupported" && result.message).toMatch(
      /6 feminine avatars?.*8 performers/
    );
  });

  it("passes a covered pool, an unfiltered assignment, and unknown counts through", () => {
    const covered = {
      ...scene,
      characterPresentationCounts: {
        masculine: 6,
        feminine: 6,
        androgynous: 4,
      },
    };
    expect(validateTikaDirectorPlanCatalog({ scene: covered }, feminine)).toBe(
      feminine
    );
    const unfiltered = {
      ...feminine,
      actions: [{ type: "assign-distinct-characters" as const }],
    };
    expect(
      validateTikaDirectorPlanCatalog({ scene: covered }, unfiltered)
    ).toBe(unfiltered);
    // Older clients send no counts; the client-side resolver reports the gap.
    expect(validateTikaDirectorPlanCatalog({ scene }, feminine)).toBe(feminine);
  });
});

describe("presentation-filtered cast assignment", () => {
  const performerIds = ["A", "B", "C"];

  it.each(TIKA_DIRECTOR_PRESENTATIONS)(
    "draws distinct %s avatars only from that pool",
    (presentation: CharacterPresentation) => {
      const assignments = resolveDirectorAppearanceAssignments({
        actions: [{ type: "assign-distinct-characters", presentation }],
        performerIds,
        seedKey: "seed",
      });
      const picked = assignments.map((assignment) => assignment.characterId!);
      expect(new Set(picked).size).toBe(performerIds.length);
      for (const id of picked) {
        expect(CHARACTER_PRESENTATION[id]).toBe(presentation);
      }
    }
  );

  it("names the shortfall instead of assigning a partial cast", () => {
    expect(() =>
      resolveDirectorAppearanceAssignments({
        actions: [
          { type: "assign-distinct-characters", presentation: "androgynous" },
        ],
        performerIds: "ABCDEFGH".split(""),
        seedKey: "seed",
      })
    ).toThrow(/androgynous/);
  });
});
