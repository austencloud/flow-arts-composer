import type { AppSettings } from "../../settings/domain/app-settings";
import type { CompleteBrowseState } from "$lib/shared/browse/domain/models/browse-models";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { TabId } from "../../navigation/domain/types";
import {
  createSequenceData,
  type SequenceData,
} from "../../foundation/domain/models/sequence-data";
import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import { db } from "../database/tka-database";
import { UserWorkType } from "../domain/enums/user-work-type";
import type { UserProject } from "../domain/models/user-project";
import type { UserWorkData } from "../domain/models/user-work-data";
import {
  normalizeLegacyPictograph,
  normalizeLegacySequence,
  normalizeLegacyStep,
} from "@tka/tka-types";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

export async function initialize(): Promise<void> {
  try {
    await db.open();
  } catch (error) {
    console.error("❌ DexiePersistenceService: Failed to initialize:", error);
    throw error;
  }
}

export function isAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export async function saveSequence(sequence: SequenceData): Promise<void> {
  try {
    await db.sequences.put(sequence);
  } catch (error) {
    console.error("❌ Failed to save sequence:", error);
    throw error;
  }
}

export async function loadSequence(id: string): Promise<SequenceData | null> {
  try {
    const sequence = await db.sequences.get(id);
    // IndexedDB rows can still carry pre-rename keys (blue/red,
    // startPosition/startingPosition) from before either rename shipped.
    return sequence ? normalizeLegacySequence(sequence) : null;
  } catch (error) {
    console.error("❌ Failed to load sequence:", error);
    return null;
  }
}

export async function getAllSequences(filter?: {
  author?: string;
  level?: number;
  isFavorite?: boolean;
  tags?: string[];
}): Promise<SequenceData[]> {
  try {
    let query = db.sequences.toCollection();

    if (filter) {
      if (filter.author) {
        query = query.filter((seq) => seq.author === filter.author);
      }
      if (filter.level !== undefined) {
        query = query.filter((seq) => seq.level === filter.level);
      }
      if (filter.isFavorite !== undefined) {
        query = query.filter((seq) => seq.isFavorite === filter.isFavorite);
      }
      if (filter.tags && filter.tags.length > 0) {
        query = query.filter((seq) =>
          filter.tags!.some((tag) => seq.tags.includes(tag))
        );
      }
    }

    return (await query.toArray()).map(normalizeLegacySequence);
  } catch (error) {
    console.error("❌ Failed to get sequences:", error);
    return [];
  }
}

export async function deleteSequence(id: string): Promise<void> {
  try {
    await db.sequences.delete(id);
  } catch (error) {
    console.error("❌ Failed to delete sequence:", error);
    throw error;
  }
}

export async function deleteSequences(ids: readonly string[]): Promise<void> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  try {
    await db.sequences.bulkDelete(uniqueIds);
  } catch (error) {
    console.error("❌ Failed to delete sequences:", error);
    throw error;
  }
}

export async function loadAllSequences(): Promise<SequenceData[]> {
  return getAllSequences();
}

export async function searchSequences(query: string): Promise<SequenceData[]> {
  try {
    const searchTerm = query.toLowerCase();
    const results = await db.sequences
      .filter(
        (seq) =>
          seq.name.toLowerCase().includes(searchTerm) ||
          stripWordNotation(seq.word).toLowerCase().includes(searchTerm) ||
          (seq.author?.toLowerCase().includes(searchTerm) ?? false)
      )
      .toArray();
    return results.map(normalizeLegacySequence);
  } catch (error) {
    console.error("❌ Failed to search sequences:", error);
    return [];
  }
}

export async function savePictograph(
  pictograph: PictographData
): Promise<void> {
  try {
    await db.pictographs.put(pictograph);
  } catch (error) {
    console.error("❌ Failed to save pictograph:", error);
    throw error;
  }
}

export async function loadPictograph(
  id: string
): Promise<PictographData | null> {
  try {
    const pictograph = await db.pictographs.get(id);
    // IndexedDB rows can still carry a pre-rename startPosition/endPosition
    // key from before the placement rename shipped.
    return pictograph ? normalizeLegacyPictograph(pictograph) : null;
  } catch (error) {
    console.error("❌ Failed to load pictograph:", error);
    return null;
  }
}

export async function getPictographsByLetter(
  letter: string
): Promise<PictographData[]> {
  try {
    const rows = await db.pictographs.where("letter").equals(letter).toArray();
    return rows.map(normalizeLegacyPictograph);
  } catch (error) {
    console.error("❌ Failed to get pictographs by letter:", error);
    return [];
  }
}

export async function getAllPictographs(): Promise<PictographData[]> {
  try {
    const rows = await db.pictographs.toArray();
    return rows.map(normalizeLegacyPictograph);
  } catch (error) {
    console.error("❌ Failed to get all pictographs:", error);
    return [];
  }
}

export async function saveActiveTab(tabId: TabId): Promise<void> {
  try {
    await saveUserWork(UserWorkType.TAB_STATE, "app", {
      activeTab: tabId,
    });
  } catch (error) {
    console.error("❌ Failed to save active tab:", error);
    throw error;
  }
}

export async function getActiveTab(): Promise<TabId | null> {
  try {
    const data = (await loadUserWork(UserWorkType.TAB_STATE, "app")) as {
      activeTab?: TabId;
    } | null;
    return data?.activeTab ?? null;
  } catch (error) {
    console.error("❌ Failed to get active tab:", error);
    return null;
  }
}

export async function saveTabState(
  tabId: TabId,
  state: unknown
): Promise<void> {
  try {
    await saveUserWork(UserWorkType.TAB_STATE, tabId, state);
  } catch (error) {
    console.error("❌ Failed to save tab state:", error);
    throw error;
  }
}

export async function loadTabState<T = unknown>(
  tabId: TabId
): Promise<T | null> {
  try {
    return (await loadUserWork(UserWorkType.TAB_STATE, tabId)) as T | null;
  } catch (error) {
    console.error("❌ Failed to load tab state:", error);
    return null;
  }
}

export async function saveBrowseState(
  state: CompleteBrowseState
): Promise<void> {
  try {
    await saveUserWork(UserWorkType.BROWSE_STATE, "browse", state);
  } catch (error) {
    console.error("❌ Failed to save Browse state:", error);
    throw error;
  }
}

export async function loadBrowseState(): Promise<CompleteBrowseState | null> {
  try {
    return (await loadUserWork(
      UserWorkType.BROWSE_STATE,
      "browse"
    )) as CompleteBrowseState | null;
  } catch (error) {
    console.error("❌ Failed to load Browse state:", error);
    return null;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await db.settings.put({ ...settings, id: "default" } as AppSettings & {
      id: string;
    });
  } catch (error) {
    console.error("❌ Failed to save settings:", error);
    throw error;
  }
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    const settings = await db.settings.where("id").equals("default").first();
    return settings ?? null;
  } catch (error) {
    console.error("❌ Failed to load settings:", error);
    return null;
  }
}

export async function saveProject(project: UserProject): Promise<void> {
  try {
    await db.userProjects.put(project);
  } catch (error) {
    console.error("❌ Failed to save project:", error);
    throw error;
  }
}

export async function loadProjects(): Promise<UserProject[]> {
  try {
    return await db.userProjects.orderBy("lastModified").reverse().toArray();
  } catch (error) {
    console.error("❌ Failed to load projects:", error);
    return [];
  }
}

export async function deleteProject(id: number): Promise<void> {
  try {
    await db.userProjects.delete(id);
  } catch (error) {
    console.error("❌ Failed to delete project:", error);
    throw error;
  }
}

export async function exportAllData(): Promise<unknown> {
  try {
    const data = {
      sequences: await db.sequences.toArray(),
      pictographs: await db.pictographs.toArray(),
      userWork: await db.userWork.toArray(),
      userProjects: await db.userProjects.toArray(),
      settings: await db.settings.toArray(),
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    return data;
  } catch (error) {
    console.error("❌ Failed to export data:", error);
    throw error;
  }
}

export function importData(_data: unknown): Promise<void> {
  throw new Error("Import not yet implemented");
}

export async function clearAllData(): Promise<void> {
  try {
    await db.transaction(
      "rw",
      [db.sequences, db.pictographs, db.userWork, db.userProjects, db.settings],
      async () => {
        await db.sequences.clear();
        await db.pictographs.clear();
        await db.userWork.clear();
        await db.userProjects.clear();
        await db.settings.clear();
      }
    );
  } catch (error) {
    console.error("❌ Failed to clear data:", error);
    throw error;
  }
}

export async function getStorageInfo(): Promise<{
  sequences: number;
  pictographs: number;
  userWork: number;
  projects: number;
}> {
  try {
    return {
      sequences: await db.sequences.count(),
      pictographs: await db.pictographs.count(),
      userWork: await db.userWork.count(),
      projects: await db.userProjects.count(),
    };
  } catch (error) {
    console.error("❌ Failed to get storage info:", error);
    return { sequences: 0, pictographs: 0, userWork: 0, projects: 0 };
  }
}

async function saveUserWork(
  type: UserWorkType,
  tabId: string,
  data: unknown
): Promise<void> {
  const workData: UserWorkData = {
    type,
    tabId,
    data,
    lastModified: new Date(),
    version: 1,
  };

  const existing = await db.userWork.where({ type, tabId }).first();

  if (existing) {
    await db.userWork.update(existing.id, {
      data,
      lastModified: new Date(),
    });
  } else {
    await db.userWork.add(workData);
  }
}

async function loadUserWork(
  type: UserWorkType,
  tabId: string
): Promise<unknown> {
  const workData = await db.userWork.where({ type, tabId }).first();
  return workData?.data ?? null;
}

function getSequenceStateKey(mode: string): string {
  const normalizedMode = mode.toLowerCase();
  return `tka-${normalizedMode}-sequence-state-v1`;
}

export function saveCurrentSequenceState(state: {
  currentSequence: SequenceData | null;
  selectedStartPlacement: StartPlacementData | null;
  hasStartPlacement: boolean;
  activeBuildSection?: string;
}): Promise<void> {
  try {
    const mode = state.activeBuildSection ?? "construct";
    const storageKey = getSequenceStateKey(mode);

    const stateData = {
      currentSequence: state.currentSequence,
      selectedStartPlacement: state.selectedStartPlacement,
      hasStartPlacement: state.hasStartPlacement,
      activeBuildSection: mode,
      timestamp: Date.now(),
    };

    localStorage.setItem(storageKey, JSON.stringify(stateData));
    return Promise.resolve();
  } catch (error) {
    console.error("❌ Failed to save current sequence state:", error);
    throw error;
  }
}

export async function loadCurrentSequenceState(mode?: string): Promise<{
  currentSequence: SequenceData | null;
  selectedStartPlacement: StartPlacementData | null;
  hasStartPlacement: boolean;
  activeBuildSection?: string;
} | null> {
  try {
    const targetMode = mode ?? "construct";
    const storageKey = getSequenceStateKey(targetMode);
    const stateJson = localStorage.getItem(storageKey);

    if (!stateJson) {
      return null;
    }

    const rawParsed: unknown = JSON.parse(stateJson);
    const parsed = migrateLegacySequenceStateBlob(rawParsed);

    if (!isValidSequenceState(parsed)) {
      console.warn("❌ Invalid sequence state structure, clearing state");
      await clearCurrentSequenceState(targetMode);
      return null;
    }

    const maxAge = 24 * 60 * 60 * 1000;
    if (
      typeof parsed.timestamp === "number" &&
      Date.now() - parsed.timestamp > maxAge
    ) {
      await clearCurrentSequenceState(targetMode);
      return null;
    }

    return {
      currentSequence: parsed.currentSequence
        ? createSequenceData(parsed.currentSequence)
        : null,
      selectedStartPlacement: parsed.selectedStartPlacement
        ? normalizeLegacyStep(parsed.selectedStartPlacement)
        : null,
      hasStartPlacement: parsed.hasStartPlacement,
      activeBuildSection: parsed.activeBuildSection ?? targetMode,
    };
  } catch (error) {
    console.error("❌ Failed to load current sequence state:", error);
    return null;
  }
}

/**
 * Migrates a `loadCurrentSequenceState` blob written before the position ->
 * placement rename shipped. `hasStartPosition`/`selectedStartPosition` only
 * fill the new keys when those are absent; an already-migrated or freshly
 * saved blob passes through untouched. Never deletes user data over a
 * spelling mismatch — a blob that fails validation even after this still
 * gets cleared by the caller, not this function.
 */
export function migrateLegacySequenceStateBlob(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const migrated: Record<string, unknown> = { ...source };

  if (
    migrated["hasStartPlacement"] === undefined &&
    typeof source["hasStartPosition"] === "boolean"
  ) {
    migrated["hasStartPlacement"] = source["hasStartPosition"];
  }
  if (
    migrated["selectedStartPlacement"] === undefined &&
    source["selectedStartPosition"] !== undefined
  ) {
    migrated["selectedStartPlacement"] = source["selectedStartPosition"];
  }

  return migrated;
}

function isValidSequenceState(obj: unknown): obj is {
  currentSequence: SequenceData | null;
  selectedStartPlacement: StartPlacementData | null;
  hasStartPlacement: boolean;
  activeBuildSection?: string;
  timestamp?: number;
} {
  if (!obj || typeof obj !== "object") return false;

  const state = obj as Record<string, unknown>;

  return (
    (state["currentSequence"] === null ||
      typeof state["currentSequence"] === "object") &&
    (state["selectedStartPlacement"] === null ||
      typeof state["selectedStartPlacement"] === "object") &&
    typeof state["hasStartPlacement"] === "boolean"
  );
}

export function clearCurrentSequenceState(mode?: string): Promise<void> {
  try {
    if (mode) {
      const storageKey = getSequenceStateKey(mode);
      localStorage.removeItem(storageKey);
    } else {
      const modes = ["construct", "generate", "assemble"];
      modes.forEach((m) => {
        const storageKey = getSequenceStateKey(m);
        localStorage.removeItem(storageKey);
      });
    }
    return Promise.resolve();
  } catch (error) {
    console.error("❌ Failed to clear current sequence state:", error);
    throw error;
  }
}
