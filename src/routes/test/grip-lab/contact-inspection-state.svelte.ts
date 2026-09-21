import { page } from "$app/state";
import { writeUrl } from "$lib/shared/navigation/services/url-state";
import {
  decodeTeachingKeys, encodeTeachingKeys, sampleTeachingPose, upsertTeachingKey,
  defaultTeachingKeys, type TeachingPose, type TeachingKey,
} from "./isolation-teaching";
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
  let transition = $state(option(url.searchParams.get("segment"), ["all", "0", "1", "2", "3"], "all"));
  let keys = $state(decodeTeachingKeys(url.searchParams.get("poses")));
  const initialTolerance = Number(url.searchParams.get("drift") ?? "0.13");
  let tolerance = $state(Number.isFinite(initialTolerance) ? Math.max(0, Math.min(0.2, initialTolerance)) : 0.13);
  let undoKeys = $state<TeachingKey[][]>([]);
  let editInProgress = false;
  const range = () => transition === "all" ? [0, 4] as const : [Number(transition), Number(transition) + 1] as const;
  phase = Math.max(range()[0], Math.min(range()[1], phase));
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
    next.searchParams.set("segment", transition);
    next.searchParams.set("poses", encodeTeachingKeys(keys));
    next.searchParams.set("drift", tolerance.toFixed(3));
    if (playing) next.searchParams.set("play", "1");
    else next.searchParams.delete("play");
    url = next;
    writeUrl(next, { mode: "replace" });
  }

  return {
    get transition() { return transition; },
    get range() { return range(); },
    get keys() { return keys; },
    get pose() { return sampleTeachingPose(phase, keys); },
    get tolerance() { return tolerance; },
    get canUndo() { return undoKeys.length > 0; },
    setTransition(next: string) {
      transition = option(next, ["all", "0", "1", "2", "3"], "all");
      phase = range()[0]; playing = false; persist();
    },
    tick(delta: number) {
      const [start, end] = range();
      phase = start + ((Math.max(start, phase) - start + delta) % (end - start));
    },
    beginEdit() {
      if (!editInProgress) undoKeys = [...undoKeys.slice(-29), keys.map((key) => ({ ...key }))];
      editInProgress = true; playing = false;
    },
    editPose(changes: Partial<TeachingPose>) {
      if (!editInProgress) undoKeys = [...undoKeys.slice(-29), keys.map((key) => ({ ...key }))];
      keys = upsertTeachingKey(keys, phase, changes); playing = false;
      if (!editInProgress) persist();
    },
    endEdit() { editInProgress = false; persist(); },
    setTolerance(value: number) {
      if (!Number.isFinite(value)) return;
      tolerance = Math.max(0, Math.min(0.2, value)); playing = false; persist();
    },
    undo() {
      const previous = undoKeys.at(-1);
      if (!previous) return;
      keys = previous; undoKeys = undoKeys.slice(0, -1); playing = false; persist();
    },
    resetPose() {
      undoKeys = [...undoKeys.slice(-29), keys.map((key) => ({ ...key }))];
      keys = defaultTeachingKeys(); playing = false; persist();
    },
    removeKey() {
      const wrapped = phase % 4;
      if (keys.length <= 1 || !keys.some((key) => Math.abs(key.phase - wrapped) < 0.005)) return;
      undoKeys = [...undoKeys.slice(-29), keys.map((key) => ({ ...key }))];
      keys = keys.filter((key) => Math.abs(key.phase - wrapped) >= 0.005); playing = false; persist();
    },
    poseLink() { playing = false; persist(); return url.href; },
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
      phase = Math.min(range()[1], Math.max(range()[0], next));
      playing = false;
      persist();
    },
    seekPosition(next: number) {
      if (!Number.isFinite(next)) return;
      // South is also the end of W → S. Keep the current quarter when possible.
      const target = next === 0 && transition === "3" ? 4 : Math.max(0, Math.min(4, next));
      const [start, end] = range();
      if (target < start || target > end) transition = "all";
      phase = target;
      playing = false;
      persist();
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
      phase = range()[0];
      playing = false;
      persist();
    },
  };
}
