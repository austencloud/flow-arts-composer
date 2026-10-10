/**
 * DuetPersister Implementation
 *
 * Persists duet sequences to localStorage and resolves sequence IDs
 * to full SequenceData using the browse loader.
 */

import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  DuetSequence,
  DuetSequenceWithData,
  CreateDuetInput,
} from "../domain/duet-sequence";
import { createDuetSequence } from "../domain/duet-sequence";

const STORAGE_KEY = "tka-3d-duets";
const DUET_STORAGE_VERSION = 2 as const;

/**
 * Stored format for duets (dates serialized)
 */
interface StoredDuet extends Omit<DuetSequence, "createdAt"> {
  version: typeof DUET_STORAGE_VERSION;
  createdAt: string;
}

interface LegacyStoredDuet
  extends Omit<
    StoredDuet,
    "version" | "performer1SequenceId" | "performer2SequenceId"
  > {
  version?: 1;
  avatar1SequenceId: string;
  avatar2SequenceId: string;
}

type StoredDuetRecord = StoredDuet | LegacyStoredDuet;

export class DuetPersister {
  private sequenceCache: Map<string, SequenceData> | null = null;

  constructor(private browseLoader: PublicSequencesLoader) {}

  /**
   * Save a new duet sequence
   */
  async saveDuet(input: CreateDuetInput): Promise<string> {
    const duet = createDuetSequence(input);
    const duets = this.loadFromStorage();
    duets.push(this.serializeDuet(duet));
    this.saveToStorage(duets);
    return duet.id;
  }

  async updateDuet(duet: DuetSequence): Promise<void> {
    const duets = this.loadFromStorage();
    const index = duets.findIndex((d) => d.id === duet.id);
    if (index >= 0) {
      duets[index] = this.serializeDuet(duet);
      this.saveToStorage(duets);
    }
  }

  async getDuet(id: string): Promise<DuetSequence | null> {
    const duets = this.loadFromStorage();
    const stored = duets.find((d) => d.id === id);
    return stored ? this.deserializeDuet(stored) : null;
  }

  async getAllDuets(): Promise<DuetSequence[]> {
    return this.loadFromStorage().map((d) => this.deserializeDuet(d));
  }

  async deleteDuet(id: string): Promise<void> {
    const duets = this.loadFromStorage();
    const filtered = duets.filter((d) => d.id !== id);
    this.saveToStorage(filtered);
  }

  /**
   * Get a duet with resolved sequence data
   */
  async getDuetWithData(id: string): Promise<DuetSequenceWithData | null> {
    const duet = await this.getDuet(id);
    if (!duet) return null;
    return this.resolveDuetSequences(duet);
  }

  /**
   * Resolve a duet to full sequence data
   */
  async resolveDuetSequences(
    duet: DuetSequence
  ): Promise<DuetSequenceWithData | null> {
    await this.ensureSequenceCache();

    const seq1 = this.sequenceCache?.get(duet.performer1SequenceId);
    const seq2 = this.sequenceCache?.get(duet.performer2SequenceId);

    if (!seq1 || !seq2) {
      console.warn("[DuetPersister] Could not resolve sequences:", {
        performer1Found: !!seq1,
        performer2Found: !!seq2,
      });
      return null;
    }

    return {
      ...duet,
      performer1Sequence: seq1,
      performer2Sequence: seq2,
    };
  }


  private loadFromStorage(): StoredDuetRecord[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (e) {
      console.warn("[DuetPersister] Failed to load duets:", e);
      return [];
    }
  }

  private saveToStorage(duets: StoredDuetRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(duets));
    } catch (e) {
      console.warn("[DuetPersister] Failed to save duets:", e);
    }
  }

  private serializeDuet(duet: DuetSequence): StoredDuet {
    return {
      ...duet,
      version: DUET_STORAGE_VERSION,
      createdAt: duet.createdAt.toISOString(),
    };
  }

  private deserializeDuet(stored: StoredDuetRecord): DuetSequence {
    const performer1SequenceId =
      "performer1SequenceId" in stored
        ? stored.performer1SequenceId
        : stored.avatar1SequenceId;
    const performer2SequenceId =
      "performer2SequenceId" in stored
        ? stored.performer2SequenceId
        : stored.avatar2SequenceId;
    const {
      version: _version,
      avatar1SequenceId: _legacyPerformer1,
      avatar2SequenceId: _legacyPerformer2,
      ...shared
    } = stored as LegacyStoredDuet & Partial<StoredDuet>;

    return {
      ...shared,
      performer1SequenceId,
      performer2SequenceId,
      createdAt: new Date(stored.createdAt),
    };
  }

  /**
   * Ensure sequence cache is loaded for ID -> SequenceData lookup
   */
  private async ensureSequenceCache(): Promise<void> {
    if (this.sequenceCache) return;

    try {
      const sequences = await this.browseLoader.loadSequenceMetadata();
      this.sequenceCache = new Map();
      for (const seq of sequences) {
        this.sequenceCache.set(seq.id, seq);
      }
    } catch (e) {
      console.error("[DuetPersister] Failed to load sequence cache:", e);
      this.sequenceCache = new Map();
    }
  }
}
