import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GAME_REGISTRY } from "#lib/features/learn/play/domain/game-registry.js";

describe("game curriculum classification", () => {
  it("keeps every game out of TKA levels until an editorial review classifies it", () => {
    expect(GAME_REGISTRY).not.toHaveLength(0);

    for (const game of GAME_REGISTRY) {
      expect(game.curriculum, game.id).toEqual({ status: "unclassified" });
    }
  });

  it("uses game-local challenges with contiguous numbering", () => {
    for (const game of GAME_REGISTRY) {
      expect(
        game.challenges.map((challenge) => challenge.challengeNumber),
        game.id
      ).toEqual(game.challenges.map((_, index) => index + 1));
      expect(Object.hasOwn(game, "levels"), game.id).toBe(false);
    }
  });

  it("keeps the old game-level labels out of player-facing arcade copy", () => {
    const files = [
      "src/lib/features/learn/play/components/GameCard.svelte",
      "src/lib/features/learn/play/components/ChallengePicker.svelte",
      "src/lib/features/learn/play/components/ArcadeResults.svelte",
    ];
    const retiredCopy = [
      " levels",
      "Lv ",
      "Replay level",
      "Next level",
      "Back to levels",
      "`Level ${",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const phrase of retiredCopy) {
        expect(source.includes(phrase), `${file}: ${phrase}`).toBe(false);
      }
    }
  });
});
