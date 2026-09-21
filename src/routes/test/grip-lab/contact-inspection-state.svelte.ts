import { page } from "$app/state";
import { writeUrl } from "$lib/shared/navigation/services/url-state";
import {
  canAddTeachingKeyAtPhase,
  canMoveTeachingKey,
  decodeTeachingKeys,
  encodeTeachingKeys,
  normalizeTeachingKeyPhase,
  sampleTeachingPose,
  teachingKeyAtPhase,
  upsertTeachingKey,
  defaultTeachingKeys,
  type TeachingPose,
  type TeachingKey,
} from "./isolation-teaching";
import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "$lib/shared/3d/domain/character-model";

export type InspectionView = "front" | "side" | "hand";
export type InspectionHand = "right" | "left";
interface KeyUndoSnapshot {
  keys: TeachingKey[];
  phase: number;
  transition: "all" | "0" | "1" | "2" | "3";
}

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
  let transition = $state(
    option(url.searchParams.get("segment"), ["all", "0", "1", "2", "3"], "all")
  );
  let keys = $state(decodeTeachingKeys(url.searchParams.get("poses")));
  const initialTolerance = Number(url.searchParams.get("drift") ?? "0.13");
  let tolerance = $state(
    Number.isFinite(initialTolerance)
      ? Math.max(0, Math.min(0.2, initialTolerance))
      : 0.13
  );
  let undoKeys = $state<KeyUndoSnapshot[]>([]);
  let editInProgress = false;
  const range = () =>
    transition === "all"
      ? ([0, 4] as const)
      : ([Number(transition), Number(transition) + 1] as const);
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

  function pushKeyUndo(): void {
    undoKeys = [
      ...undoKeys.slice(-29),
      {
        keys: keys.map((key) => ({ ...key })),
        phase,
        transition,
      },
    ];
  }

  function segmentForPhase(value: number): "0" | "1" | "2" | "3" {
    return String(Math.min(3, Math.floor(value))) as "0" | "1" | "2" | "3";
  }

  return {
    get transition() {
      return transition;
    },
    get range() {
      return range();
    },
    get keys() {
      return keys;
    },
    get pose() {
      return sampleTeachingPose(phase, keys);
    },
    get selectedKey() {
      return teachingKeyAtPhase(keys, phase);
    },
    get canAddKey() {
      return canAddTeachingKeyAtPhase(keys, phase);
    },
    get canRemoveKey() {
      return keys.length > 1 && !!teachingKeyAtPhase(keys, phase);
    },
    get tolerance() {
      return tolerance;
    },
    get canUndo() {
      return undoKeys.length > 0;
    },
    setTransition(next: string) {
      transition = option(next, ["all", "0", "1", "2", "3"], "all");
      phase = range()[0];
      playing = false;
      persist();
    },
    tick(delta: number) {
      const [start, end] = range();
      phase =
        start + ((Math.max(start, phase) - start + delta) % (end - start));
    },
    beginEdit() {
      if (!editInProgress) pushKeyUndo();
      editInProgress = true;
      playing = false;
    },
    editPose(changes: Partial<TeachingPose>) {
      if (!editInProgress) pushKeyUndo();
      keys = upsertTeachingKey(keys, phase, changes);
      playing = false;
      if (!editInProgress) persist();
    },
    endEdit() {
      editInProgress = false;
      persist();
    },
    setTolerance(value: number) {
      if (!Number.isFinite(value)) return;
      tolerance = Math.max(0, Math.min(0.2, value));
      playing = false;
      persist();
    },
    undo() {
      const previous = undoKeys.at(-1);
      if (!previous) return;
      keys = previous.keys;
      phase = previous.phase;
      transition = previous.transition;
      undoKeys = undoKeys.slice(0, -1);
      playing = false;
      persist();
    },
    resetPose() {
      pushKeyUndo();
      keys = defaultTeachingKeys();
      playing = false;
      persist();
    },
    addKey(): boolean {
      if (!canAddTeachingKeyAtPhase(keys, phase)) return false;
      pushKeyUndo();
      keys = upsertTeachingKey(keys, phase, {});
      playing = false;
      persist();
      return true;
    },
    removeKey() {
      const selected = teachingKeyAtPhase(keys, phase);
      if (keys.length <= 1 || !selected) return false;
      pushKeyUndo();
      keys = keys.filter((key) => key !== selected);
      playing = false;
      persist();
      return true;
    },
    moveKey(fromPhase: number, toPhase: number): boolean {
      const source = teachingKeyAtPhase(keys, fromPhase);
      const destination = normalizeTeachingKeyPhase(toPhase);
      if (
        !source ||
        destination === null ||
        !canMoveTeachingKey(keys, fromPhase, toPhase)
      )
        return false;
      if (source.phase === destination) return true;
      if (!editInProgress) pushKeyUndo();
      keys = keys
        .map((key) => (key === source ? { ...key, phase: destination } : key))
        .sort((a, b) => a.phase - b.phase);
      phase = destination;
      if (transition !== "all" && (phase < range()[0] || phase > range()[1])) {
        transition = segmentForPhase(phase);
      }
      playing = false;
      if (!editInProgress) persist();
      return true;
    },
    poseLink() {
      playing = false;
      persist();
      return url.href;
    },
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
      const target =
        next === 0 && transition === "3" ? 4 : Math.max(0, Math.min(4, next));
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
