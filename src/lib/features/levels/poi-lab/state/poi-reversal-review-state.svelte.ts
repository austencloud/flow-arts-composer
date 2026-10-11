import type { PositionValue } from "#lib/shared/notation/qft/qft-model.js";
import {
  POI_REVERSAL_CANDIDATES,
  selectNextPoiReversalCandidate,
  type PoiCandidateSelection,
  type PoiReversalVerdict,
} from "../domain/poi-reversal-candidates";
import {
  createPoiReversalObservation,
  parsePoiReversalObservationFile,
  type PoiReversalObservation,
  type PoiReversalObservationFile,
} from "../domain/poi-reversal-observations";

export interface PoiReversalSaveResult {
  ok: boolean;
  message: string;
}

export type SavePoiReversalObservations = (
  file: PoiReversalObservationFile
) => Promise<PoiReversalSaveResult>;

const BACKUP_KEY = "poi-reversal-observations-unsaved-v1";

function fileWith(
  observations: readonly PoiReversalObservation[]
): PoiReversalObservationFile {
  return {
    version: 1,
    generatorVersion: 1,
    observations: [...observations],
  };
}

export function createPoiReversalReviewState(
  seedData: unknown,
  saveObservations: SavePoiReversalObservations
) {
  const seed = parsePoiReversalObservationFile(seedData);
  const observations = $state<PoiReversalObservation[]>(
    structuredClone(seed.observations)
  );
  let dirtyIds = $state<Set<string>>(new Set());

  let draftVerdict = $state<PoiReversalVerdict | null>(null);
  let draftFailureStep = $state<PositionValue | null>(null);
  let draftReason = $state("");
  let formMessage = $state("");
  let saving = $state(false);
  let saveResult = $state<PoiReversalSaveResult | null>(null);

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (raw) {
        const backup = parsePoiReversalObservationFile(JSON.parse(raw));
        const knownIds = new Set(
          observations.map((observation) => observation.id)
        );
        for (const observation of backup.observations) {
          if (knownIds.has(observation.id)) continue;
          observations.push(observation);
          dirtyIds = new Set(dirtyIds).add(observation.id);
          knownIds.add(observation.id);
        }
      }
    } catch {
      localStorage.removeItem(BACKUP_KEY);
    }
  }

  const selection = $derived<PoiCandidateSelection | null>(
    selectNextPoiReversalCandidate(observations, POI_REVERSAL_CANDIDATES)
  );
  const uniqueReviewedCount = $derived(
    new Set(observations.map((observation) => observation.candidate.id)).size
  );
  const currentReviewCount = $derived(
    selection
      ? observations.filter(
          (observation) => observation.candidate.id === selection.candidate.id
        ).length
      : 0
  );
  const canRecord = $derived(
    draftVerdict !== null &&
      (draftVerdict !== "illegal" ||
        (draftFailureStep !== null && draftReason.trim().length > 0))
  );

  function backup(): void {
    if (typeof localStorage === "undefined") return;
    if (dirtyIds.size === 0) {
      localStorage.removeItem(BACKUP_KEY);
      return;
    }
    const dirty = observations.filter((observation) =>
      dirtyIds.has(observation.id)
    );
    localStorage.setItem(BACKUP_KEY, JSON.stringify(fileWith(dirty)));
  }

  function resetDraft(): void {
    draftVerdict = null;
    draftFailureStep = null;
    draftReason = "";
    formMessage = "";
  }

  function selectVerdict(verdict: PoiReversalVerdict): void {
    draftVerdict = verdict;
    formMessage = "";
    if (verdict !== "illegal") draftFailureStep = null;
  }

  function selectFailureStep(step: PositionValue): void {
    draftVerdict = "illegal";
    draftFailureStep = step;
    formMessage = "";
  }

  function setReason(reason: string): void {
    draftReason = reason;
    formMessage = "";
  }

  function recordCurrent(): PoiReversalSaveResult {
    const current = selection?.candidate;
    if (!current || !draftVerdict) {
      formMessage = "Choose Legal, Illegal, or Unsure";
      return { ok: false, message: formMessage };
    }

    try {
      const observation = createPoiReversalObservation(
        current,
        draftVerdict,
        draftFailureStep,
        draftReason,
        observations
      );
      observations.push(observation);
      dirtyIds = new Set(dirtyIds).add(observation.id);
      backup();
      resetDraft();
      saveResult = null;
      return { ok: true, message: "Observation added" };
    } catch (cause) {
      formMessage = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, message: formMessage };
    }
  }

  function serialize(): PoiReversalObservationFile {
    return parsePoiReversalObservationFile(fileWith(observations));
  }

  async function save(): Promise<PoiReversalSaveResult> {
    if (dirtyIds.size === 0) {
      saveResult = { ok: true, message: "Everything is saved" };
      return saveResult;
    }

    const savingIds = new Set(dirtyIds);
    const snapshot = serialize();
    saving = true;
    saveResult = null;
    try {
      const result = await saveObservations(snapshot);
      saveResult = result;
      if (result.ok) {
        dirtyIds = new Set([...dirtyIds].filter((id) => !savingIds.has(id)));
        backup();
      }
      return result;
    } catch (cause) {
      const result = {
        ok: false,
        message: cause instanceof Error ? cause.message : String(cause),
      };
      saveResult = result;
      return result;
    } finally {
      saving = false;
    }
  }

  return {
    get observations() {
      return observations;
    },
    get selection() {
      return selection;
    },
    get uniqueReviewedCount() {
      return uniqueReviewedCount;
    },
    get totalCandidateCount() {
      return POI_REVERSAL_CANDIDATES.length;
    },
    get currentReviewCount() {
      return currentReviewCount;
    },
    get dirtyCount() {
      return dirtyIds.size;
    },
    get draftVerdict() {
      return draftVerdict;
    },
    get draftFailureStep() {
      return draftFailureStep;
    },
    get draftReason() {
      return draftReason;
    },
    get canRecord() {
      return canRecord;
    },
    get formMessage() {
      return formMessage;
    },
    get saving() {
      return saving;
    },
    get saveResult() {
      return saveResult;
    },
    selectVerdict,
    selectFailureStep,
    setReason,
    recordCurrent,
    serialize,
    save,
  };
}
