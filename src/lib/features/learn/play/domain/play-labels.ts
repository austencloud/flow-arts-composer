import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
import type { ChallengeDefinition, GameDefinition } from "./arcade-types";

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function gameTitle(game: GameDefinition): string {
  return tDynamic(`learn_ui_game_${game.id.replaceAll("-", "_")}_title`);
}

export function gameTagline(game: GameDefinition): string {
  return tDynamic(`learn_ui_game_${game.id.replaceAll("-", "_")}_tagline`);
}

export function challengeTitle(challenge: ChallengeDefinition): string {
  return tDynamic(`learn_ui_challenge_${titleKey(challenge.title)}`);
}
