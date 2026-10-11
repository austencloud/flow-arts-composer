/**
 * Persists 3D scene UI state to localStorage.
 */

import { Plane } from "@austencloud/scene-3d";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import type { GridMode } from "@austencloud/scene-3d";
import { normalizeLegacySequence } from "@tka/tka-types";

export interface CharacterProportions {
  height: number;
  headHeight: number;
  neckLength: number;
  shoulderWidth: number;
  torsoLength: number;
  hipWidth: number;
  upperArmLength: number;
  forearmLength: number;
  handLength: number;
  inseam: number;
  thighLength: number;
  shinLength: number;
}

export interface Scene3DPersistedState {
  visiblePlanes: string[];
  showGrid: boolean;
  showLabels: boolean;
  gridMode: GridMode;
  cameraPreset: "front" | "top" | "side" | "perspective";
  cameraPosition: [number, number, number] | null;
  cameraTarget: [number, number, number] | null;
  activeTab: "left" | "right";
  panelOpen: boolean;
  speed: number;
  characterId: string;
  bodyType: "masculine" | "feminine" | "androgynous";
  skinTone: string;
  showFigure: boolean;
  characterProportions: CharacterProportions;
  loop: boolean;
  showLeft: boolean;
  showRight: boolean;
  leftConfig: MotionConfig3D;
  rightConfig: MotionConfig3D;
  loadedSequence: SequenceData | null;
  currentStepIndex: number;
}

const STORAGE_KEY = "tka-3d-animator-state";

/**
 * Structural interface matching the old class API consumed by CharacterCustomizer.
 * Satisfiable by passing `{ saveState: saveScene3DState, loadState: loadScene3DState }`.
 */
export interface Scene3DPersisterAPI {
  saveState(state: Partial<Scene3DPersistedState>): void;
  loadState(): Partial<Scene3DPersistedState>;
}

/** Save state to localStorage (merges with existing) */
export function saveScene3DState(state: Partial<Scene3DPersistedState>): void {
  try {
    const existing = loadScene3DState();
    const merged = { ...existing, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn("Failed to save 3D scene state:", e);
  }
}

/** Narrows a JSON-parsed value read back from storage into a plain number array. */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

/** Load state from localStorage */
export function loadScene3DState(): Partial<Scene3DPersistedState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const state = JSON.parse(stored) as Record<string, unknown>;

    // Pre-character-schema saves used the renderer package's historical
    // vocabulary. Normalize once at the storage boundary so every caller sees
    // the canonical product model.
    if ("avatarId" in state && !("characterId" in state)) {
      state.characterId = state.avatarId;
      delete state.avatarId;
    }
    if ("avatarProportions" in state && !("characterProportions" in state)) {
      state.characterProportions = state.avatarProportions;
      delete state.avatarProportions;
    }
    if (state.activeTab === "blue") state.activeTab = "left";
    if (state.activeTab === "red") state.activeTab = "right";
    state.showLeft ??= state.showBlue;
    state.showRight ??= state.showRed;
    state.leftConfig ??= state.blueConfig;
    state.rightConfig ??= state.redConfig;
    delete state.showBlue;
    delete state.showRed;
    delete state.blueConfig;
    delete state.redConfig;
    if (state.loadedSequence) {
      state.loadedSequence = normalizeLegacySequence(state.loadedSequence);
    }

    // Migration: Clear legacy camera positions (pre-meter scale).
    if (isNumberArray(state.cameraPosition)) {
      const maxCoord = Math.max(...state.cameraPosition.map(Math.abs));
      if (maxCoord > 20) {
        delete state.cameraPosition;
        delete state.cameraTarget;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    }

    return state as Partial<Scene3DPersistedState>;
  } catch (e) {
    console.warn("Failed to load 3D scene state:", e);
    return {};
  }
}

export function clearScene3DState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Convert plane strings back to Set<Plane> */
export function parsePlanes(planeStrings: string[] | undefined): Set<Plane> {
  if (!planeStrings) {
    return new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]);
  }
  return new Set(planeStrings.map((p) => p as Plane));
}
