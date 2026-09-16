/**
 * Sequence Service - Application Layer
 *
 * Coordinates between domain logic and persistence for sequence operations.
 * This service orchestrates the business workflows for sequence management.
 *
 * Focused on core CRUD operations and domain coordination.
 * Workbench-specific operations moved to WorkbenchBeatOperator.
 * Import operations moved to SequenceImportService.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import type { Step } from "@tka/tka-types";
import type { SequenceCreateRequest } from "$lib/shared/create/domain/sequence-models";
import {
  saveSequence as persistSaveSequence,
  loadSequence as persistLoadSequence,
  loadAllSequences as persistLoadAllSequences,
} from "$lib/shared/persistence/services/dexie-persistence-service";
import type { SequenceImporter } from "$lib/shared/create/services/sequence-importer";
type ReversalDetector = { processReversals: (sequence: SequenceData) => SequenceData };
import { separateStepsFromStartPlacement } from "$lib/shared/animation-engine/services/sequence-normalizer";
type SequenceDomainManager = {
  createSequence: (request: unknown) => SequenceData;
  updateStep: (sequence: SequenceData, stepIndex: number, stepData: unknown) => SequenceData;
};
import {
  collection,
  getDocs,
  query,
  where,
  or,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import {
  getUserSequencesPath,
} from "$lib/shared/library/data/firestore-paths";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";

export class SequenceRepository {
  constructor(
    private readonly sequenceDomainManager: SequenceDomainManager,
    private readonly reversalDetector: ReversalDetector,
    private readonly sequenceImportService?: SequenceImporter
  ) {}

  // If compositional fields are present, derive steps from them so the
  // compositional model is the source of truth for all downstream readers.
  private hydrateSequence(seq: SequenceData): SequenceData {
    try {
      return hydrate(seq);
    } catch {
      return seq;
    }
  }

  /**
   * Create a new sequence
   */
  async createSequence(request: SequenceCreateRequest): Promise<SequenceData> {
    try {
      // Use domain service to create the sequence
      const sequence = this.sequenceDomainManager.createSequence(request);
      await persistSaveSequence(sequence);
      return sequence;
    } catch (error) {
      console.error("Failed to create sequence:", error);
      throw new Error(
        `Failed to create sequence: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Update a beat in a sequence
   */
  async updateStep(
    sequenceId: string,
    stepIndex: number,
    stepData: Step
  ): Promise<void> {
    try {
      // Load the current sequence
      const currentSequence = await persistLoadSequence(sequenceId);
      if (!currentSequence) {
        throw new Error(`Sequence ${sequenceId} not found`);
      }

      // Use domain service to update the beat
      const updatedSequence = this.sequenceDomainManager.updateStep(
        currentSequence,
        stepIndex,
        stepData
      );

      await persistSaveSequence(updatedSequence);
    } catch (error) {
      console.error("Failed to update beat:", error);
      throw new Error(
        `Failed to update beat: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get a sequence by ID.
   *
   * A miss falls back to the bundled legacy PNG for that word. That import
   * mints a fresh random id every time (the PNG carries none), so the result
   * is a synthesized copy, not the document the id names. Callers that hold a
   * document id and have other stores to consult pass `importFromPng: false`
   * and reserve the PNG for their own last resort.
   */
  async getSequence(
    id: string,
    options: { importFromPng?: boolean } = {}
  ): Promise<SequenceData | null> {
    const importFromPng = options.importFromPng ?? true;
    try {
      let sequence = await persistLoadSequence(id);
      if (sequence) sequence = this.hydrateSequence(sequence);

      // If sequence not found, try to import from PNG metadata if import service is available
      if (!sequence && importFromPng && this.sequenceImportService) {
        try {
          sequence = await this.sequenceImportService.importFromPNG(id);
          // Save it to persistence for future use
          if (sequence) {
            await persistSaveSequence(sequence);
          }
        } catch {
          // PNG import failed - sequence not available locally
          return null;
        }
      }

      // Apply reversal detection to ensure sequence has up-to-date reversal data
      if (sequence) {
        sequence = this.reversalDetector.processReversals(sequence);

        // Normalize sequence data to ensure start position is separated from steps
        // This handles legacy data formats where beat 0 or startingPlacement was mixed into steps array
        const normalized =
          separateStepsFromStartPlacement(sequence);
        sequence = {
          ...sequence,
          steps: normalized.steps,
          startPlacement: normalized.startPlacement ?? undefined,
        };
      }

      return sequence;
    } catch (error) {
      console.error(`Failed to get sequence ${id}:`, error);
      toast.error("Couldn't load that sequence. Please try again.");
      return null;
    }
  }

  /**
   * Get all sequences
   */
  async getAllSequences(): Promise<SequenceData[]> {
    try {
      const sequences = await persistLoadAllSequences();

      // Hydrate (derive steps from compositional model) then apply post-processing
      return sequences.map((raw) => {
        const sequence = this.hydrateSequence(raw);
        // Apply reversal detection
        const processed = this.reversalDetector.processReversals(sequence);

        // Normalize to separate start position from steps
        const normalized =
          separateStepsFromStartPlacement(processed);
        return {
          ...processed,
          steps: normalized.steps,
          startPlacement: normalized.startPlacement ?? undefined,
        };
      });
    } catch (error) {
      console.error("Failed to get all sequences:", error);
      toast.error("Couldn't load your sequences. Please refresh.");
      return [];
    }
  }

  /**
   * Find all sequences that reference a specific hand path, on either the left
   * or right performer's side. Queries Firestore directly because the
   * local persistence layer (Dexie) doesn't index these hash fields.
   */
  async getByPathHash(pathHash: string): Promise<SequenceData[]> {
    try {
      const uid = authState.effectiveUserId;
      if (!uid) return [];

      const firestore = await getFirestoreInstance();
      const ref = collection(firestore, getUserSequencesPath(uid));

      // Canonical writes use left/right. The legacy predicates keep sequences
      // saved by older clients discoverable without rewriting user documents.
      const q = query(
        ref,
        or(
          where("leftPathHash", "==", pathHash),
          where("rightPathHash", "==", pathHash),
          where("bluePathHash", "==", pathHash),
          where("redPathHash", "==", pathHash)
        )
      );

      const snap = await getDocs(q);
      return snap.docs.map((d) => this.hydrateSequence({ ...d.data(), id: d.id } as SequenceData));
    } catch (error) {
      console.error("[SequenceRepository] getByPathHash failed:", error);
      toast.error("Couldn't search sequences by hand path. Please try again.");
      return [];
    }
  }

  /**
   * Find all sequences that reference a specific solo prop, on either the left
   * or right performer's side. Queries Firestore directly because the
   * local persistence layer (Dexie) doesn't index these hash fields.
   */
  async getBySoloHash(soloHash: string): Promise<SequenceData[]> {
    try {
      const uid = authState.effectiveUserId;
      if (!uid) return [];

      const firestore = await getFirestoreInstance();
      const ref = collection(firestore, getUserSequencesPath(uid));

      // Query both schema generations for the same reason as getByPathHash.
      const q = query(
        ref,
        or(
          where("leftSoloHash", "==", soloHash),
          where("rightSoloHash", "==", soloHash),
          where("blueSoloHash", "==", soloHash),
          where("redSoloHash", "==", soloHash)
        )
      );

      const snap = await getDocs(q);
      return snap.docs.map((d) => this.hydrateSequence({ ...d.data(), id: d.id } as SequenceData));
    } catch (error) {
      console.error("[SequenceRepository] getBySoloHash failed:", error);
      toast.error("Couldn't search sequences by prop. Please try again.");
      return [];
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import * as sequenceDomainManagerModule from "$lib/shared/create/services/sequence-domain-manager";
const sequenceDomainManager: SequenceDomainManager = {
  createSequence: sequenceDomainManagerModule.createSequence as SequenceDomainManager['createSequence'],
  updateStep: sequenceDomainManagerModule.updateStep as SequenceDomainManager['updateStep'],
};
import * as reversalDetectorModule from "$lib/shared/create/services/reversal-detector";
const reversalDetector: ReversalDetector = {
  processReversals: reversalDetectorModule.processReversals,
};

export const sequenceRepository = new SequenceRepository(
  sequenceDomainManager,
  reversalDetector,
  undefined // sequenceImportService is optional
);
