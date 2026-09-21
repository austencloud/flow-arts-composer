import { page } from "$app/state";
import { writeUrl } from "$lib/shared/navigation/services/url-state";
import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "$lib/shared/3d/domain/character-model";

export type InspectionView = "front" | "side" | "hand";
export type InspectionHand = "right" | "left";

function numberInRange(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(4, Math.max(0, parsed)) : fallback;
}

function option<T extends string>(
  value: string | null,
  choices: readonly T[],
  fallback: T
): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

/** URL-backed frame state keeps an inspection link reproducible without a lab cache. */
export function createContactInspectionState() {
  let url = $state(new URL(page.url));
  let phase = $state(numberInRange(url.searchParams.get("phase"), 0));
  let playing = $state(url.searchParams.get("play") === "1");
  let view = $state<InspectionView>(
    option(url.searchParams.get("view"), ["front", "side", "hand"], "front")
  );
  let hand = $state<InspectionHand>(
    option(url.searchParams.get("hand"), ["right", "left"], "right")
  );
  const requestedCharacter = url.searchParams.get("character");
  let characterId = $state<CharacterId>(
    CHARACTER_DEFINITIONS.some(
      (character) => character.id === requestedCharacter
    )
      ? (requestedCharacter as CharacterId)
      : ("ch07" as CharacterId)
  );

  function persist(): void {
    const next = new URL(
      typeof window === "undefined" ? url : window.location.href
    );
    next.searchParams.set("phase", phase.toFixed(3));
    next.searchParams.set("view", view);
    next.searchParams.set("hand", hand);
    next.searchParams.set("character", characterId);
    if (playing) next.searchParams.set("play", "1");
    else next.searchParams.delete("play");
    url = next;
    writeUrl(next, { mode: "replace" });
  }

  return {
    get phase() {
      return phase;
    },
    get playing() {
      return playing;
    },
    get view() {
      return view;
    },
    get hand() {
      return hand;
    },
    get characterId() {
      return characterId;
    },
    setPhase(next: number) {
      phase = Math.min(4, Math.max(0, next));
      playing = false;
      persist();
    },
    advancePhase(next: number) {
      phase = Math.min(4, Math.max(0, next));
    },
    setPlaying(next: boolean) {
      playing = next;
      persist();
    },
    setView(next: InspectionView) {
      view = next;
      persist();
    },
    setHand(next: InspectionHand) {
      hand = next;
      persist();
    },
    setCharacter(next: CharacterId) {
      characterId = next;
      persist();
    },
    reset() {
      phase = 0;
      playing = false;
      persist();
    },
  };
}
