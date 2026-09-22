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
  tolerance: number;
}

const HISTORY_LIMIT = 30;

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
  let redoKeys = $state<KeyUndoSnapshot[]>([]);
  let editInProgress = false;
  let editSnapshot = $state.raw<KeyUndoSnapshot | null>(null);
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

  function snapshot(): KeyUndoSnapshot {
    return {
      keys: keys.map((key) => ({ ...key })),
      phase,
      transition,
      tolerance,
    };
  }

  function appendHistory(
    history: KeyUndoSnapshot[],
    entry: KeyUndoSnapshot
  ): KeyUndoSnapshot[] {
    return [...history.slice(-(HISTORY_LIMIT - 1)), entry];
  }

  function snapshotMatchesCurrent(entry: KeyUndoSnapshot): boolean {
    return (
      entry.phase === phase &&
      entry.transition === transition &&
      entry.tolerance === tolerance &&
      encodeTeachingKeys(entry.keys) === encodeTeachingKeys(keys)
    );
  }

  function restoreSnapshot(entry: KeyUndoSnapshot): void {
    keys = entry.keys.map((key) => ({ ...key }));
    phase = entry.phase;
    transition = entry.transition;
    tolerance = entry.tolerance;
  }

  function recordChange(before: KeyUndoSnapshot): boolean {
    if (snapshotMatchesCurrent(before)) return false;
    if (editInProgress) {
      editSnapshot ??= before;
      return true;
    }
    undoKeys = appendHistory(undoKeys, before);
    redoKeys = [];
    return true;
  }

  function finishEdit(): boolean {
    if (!editInProgress) return false;
    const before = editSnapshot;
    editInProgress = false;
    editSnapshot = null;
    if (!before || snapshotMatchesCurrent(before)) return false;
    undoKeys = appendHistory(undoKeys, before);
    redoKeys = [];
    return true;
  }

  function segmentForPhase(value: number): "0" | "1" | "2" | "3" {
    return String(Math.min(3, Math.floor(value))) as "0" | "1" | "2" | "3";
  }

  function seekPosition(next: number): void {
    if (!Number.isFinite(next)) return;
    // South is also the end of W → S. Keep the current quarter when possible.
    const target =
      next === 0 && transition === "3" ? 4 : Math.max(0, Math.min(4, next));
    const [start, end] = range();
    if (target < start || target > end) transition = "all";
    phase = target;
    playing = false;
    persist();
  }

  function neighboringKeyframe(
    direction: -1 | 1,
    current: number
  ): TeachingKey | undefined {
    if (direction === 1) {
      return keys.find((key) => key.phase > current + 0.005);
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      if (key.phase < current - 0.005) return key;
    }
    return undefined;
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
      return keys.length < 100 && canAddTeachingKeyAtPhase(keys, phase);
    },
    get canRemoveKey() {
      return keys.length > 1 && !!teachingKeyAtPhase(keys, phase);
    },
    get tolerance() {
      return tolerance;
    },
    get canUndo() {
      return (
        undoKeys.length > 0 ||
        (!!editSnapshot && !snapshotMatchesCurrent(editSnapshot))
      );
    },
    get canRedo() {
      return (
        redoKeys.length > 0 &&
        (!editSnapshot || snapshotMatchesCurrent(editSnapshot))
      );
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
      if (!editInProgress) editSnapshot = snapshot();
      editInProgress = true;
      playing = false;
    },
    editPose(changes: Partial<TeachingPose>) {
      const before = snapshot();
      keys = upsertTeachingKey(keys, phase, changes);
      playing = false;
      recordChange(before);
      if (!editInProgress) persist();
    },
    endEdit() {
      finishEdit();
      persist();
    },
    setTolerance(value: number) {
      if (!Number.isFinite(value)) return;
      const before = snapshot();
      tolerance = Math.max(0, Math.min(0.2, value));
      playing = false;
      recordChange(before);
      if (!editInProgress) persist();
    },
    undo() {
      finishEdit();
      const previous = undoKeys.at(-1);
      if (!previous) return;
      redoKeys = appendHistory(redoKeys, snapshot());
      undoKeys = undoKeys.slice(0, -1);
      restoreSnapshot(previous);
      playing = false;
      persist();
    },
    redo() {
      finishEdit();
      const next = redoKeys.at(-1);
      if (!next) return;
      undoKeys = appendHistory(undoKeys, snapshot());
      redoKeys = redoKeys.slice(0, -1);
      restoreSnapshot(next);
      playing = false;
      persist();
    },
    resetPose() {
      const before = snapshot();
      keys = defaultTeachingKeys();
      playing = false;
      recordChange(before);
      if (!editInProgress) persist();
    },
    addKey(): boolean {
      if (keys.length >= 100 || !canAddTeachingKeyAtPhase(keys, phase)) return false;
      const before = snapshot();
      keys = upsertTeachingKey(keys, phase, {});
      playing = false;
      recordChange(before);
      if (!editInProgress) persist();
      return true;
    },
    removeKey() {
      const selected = teachingKeyAtPhase(keys, phase);
      if (keys.length <= 1 || !selected) return false;
      const before = snapshot();
      keys = keys.filter((key) => key !== selected);
      playing = false;
      recordChange(before);
      if (!editInProgress) persist();
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
      const before = snapshot();
      keys = keys
        .map((key) => (key === source ? { ...key, phase: destination } : key))
        .sort((a, b) => a.phase - b.phase);
      phase = destination;
      if (transition !== "all" && (phase < range()[0] || phase > range()[1])) {
        transition = segmentForPhase(phase);
      }
      playing = false;
      recordChange(before);
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
      seekPosition(next);
    },
    seekKeyframe(direction: -1 | 1) {
      const current = phase % 4;
      const neighboringKey = neighboringKeyframe(direction, current);
      const wrappedKey = direction === 1 ? keys[0] : keys.at(-1);
      seekPosition((neighboringKey ?? wrappedKey)?.phase ?? current);
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
