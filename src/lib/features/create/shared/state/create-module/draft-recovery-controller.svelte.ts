import type { BuildModeId } from "#lib/shared/foundation/ui/ui-types.js";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type {
  DraftStatus,
  DraftVersion,
  SequencePersister,
} from "../../services/sequence-persister";
import { distinctVisibleVersions } from "../../services/draft-visible-versions.js";

export const draftModes = ["construct", "generate", "assemble"] as const;
export type DraftMode = (typeof draftModes)[number];

export function draftMode(mode: string): DraftMode | null {
  if (mode === "spell") return "generate";
  return draftModes.includes(mode as DraftMode) ? (mode as DraftMode) : null;
}

export function createDraftRecoveryController(deps: {
  persister: SequencePersister;
  getActiveMode: () => BuildModeId;
  getSequenceState: (mode: DraftMode) => SequenceState;
  onRestored: (mode: DraftMode) => void;
  openDrafts: () => void;
}) {
  const statuses = $state<Partial<Record<DraftMode, DraftStatus>>>({});
  let open = $state(false);
  let busy = $state(false);
  let versions = $state<DraftVersion[]>([]);
  let dialogMode = $state<DraftMode>("construct");
  let message = $state<string | null>(null);
  let dialogKind = $state<"recovery" | "conflict" | "history">("history");
  const unsubscribe = draftModes.map((mode) =>
    deps.persister.subscribeDraftStatus(mode, (status) => {
      statuses[mode] = status;
      if (open && dialogMode === mode && status.candidates.length) {
        versions = distinctVisibleVersions(status.candidates);
      }
    })
  );

  function snapshotEditor(mode: DraftMode) {
    const state = deps.getSequenceState(mode);
    return {
      currentSequence: state.currentSequence,
      selectedStartPlacement: state.selectedStartPlacement,
      hasStartPlacement: state.hasStartPlacement,
      activeBuildSection: mode,
    };
  }

  async function preserveCurrentEditor(
    mode: DraftMode,
    retainCandidateId?: string
  ): Promise<boolean> {
    if (!deps.persister.hasUncommittedEditorChanges(mode)) return true;
    const preserved = await deps.persister.preserveEditorSnapshot(
      snapshotEditor(mode),
      retainCandidateId
    );
    if (preserved) return true;
    message =
      "Your latest edits are still changing. Try again before choosing a draft.";
    versions = distinctVisibleVersions(await deps.persister.listDrafts(mode));
    return false;
  }

  async function showDrafts(mode = draftMode(deps.getActiveMode())) {
    if (!mode || busy) return;
    dialogMode = mode;
    message = null;
    const status = deps.persister.getDraftStatus(mode);
    dialogKind =
      status.status === "conflict" || status.status === "recovery"
        ? status.status
        : "history";
    open = true;
    busy = true;
    try {
      if (status.status === "saving") {
        await deps.getSequenceState(mode).saveCurrentState(mode);
      }
      if (!(await preserveCurrentEditor(mode))) return;
      versions = distinctVisibleVersions(await deps.persister.listDrafts(mode));
    } catch {
      message =
        "Your latest edits could not be saved. Try again before choosing a draft.";
    } finally {
      busy = false;
    }
  }

  async function recover(id: string): Promise<boolean> {
    if (busy) return false;
    busy = true;
    message = null;
    try {
      if (!(await preserveCurrentEditor(dialogMode, id))) return false;
      deps.getSequenceState(dialogMode).cancelPendingSave();
      const workspace = await deps.persister.recoverDraft(dialogMode, id);
      if (!workspace) {
        message =
          "This version could not be opened. Review the saved versions and try again.";
        versions = distinctVisibleVersions(
          await deps.persister.listDrafts(dialogMode)
        );
        return false;
      }
      deps.getSequenceState(dialogMode).restoreDraftState(workspace);
      deps.onRestored(dialogMode);
      open = false;
      return true;
    } catch {
      message =
        "This version could not be opened. Your drafts are still available.";
      return false;
    } finally {
      busy = false;
    }
  }

  async function resume(mode: DraftMode, id: string): Promise<boolean> {
    if (busy) return false;
    dialogMode = mode;
    dialogKind = "history";
    const restored = await recover(id);
    if (!restored) open = true;
    return restored;
  }

  async function startFresh() {
    if (busy) return;
    busy = true;
    message = null;
    try {
      if (!(await preserveCurrentEditor(dialogMode))) return;
      deps.getSequenceState(dialogMode).cancelPendingSave();
      await deps.persister.startFreshDraft(dialogMode);
      if (deps.persister.getDraftStatus(dialogMode).status !== "idle") {
        message =
          "A new draft could not be started. Your saved work is still available.";
        return;
      }
      deps.getSequenceState(dialogMode).restoreDraftState({
        currentSequence: null,
        selectedStartPlacement: null,
        hasStartPlacement: false,
        activeBuildSection: dialogMode,
      });
      deps.onRestored(dialogMode);
      open = false;
    } catch {
      message =
        "Your latest edits could not be saved. Try again before starting a new draft.";
    } finally {
      busy = false;
    }
  }

  async function retry() {
    const mode = draftMode(deps.getActiveMode());
    if (!mode || busy) return;
    busy = true;
    try {
      // Capture the editor again so Retry includes edits made after the failure.
      await deps.getSequenceState(mode).saveCurrentState(mode);
    } finally {
      busy = false;
    }
  }

  function flushPending() {
    for (const mode of draftModes) {
      if (statuses[mode]?.status === "saving") {
        void deps.getSequenceState(mode).saveCurrentState(mode);
      } else if (deps.persister.hasUncommittedEditorChanges(mode)) {
        void deps.persister
          .preserveEditorSnapshot(snapshotEditor(mode))
          .catch(() => undefined);
      }
    }
  }

  return {
    get mode() {
      return draftMode(deps.getActiveMode());
    },
    get status() {
      const mode = draftMode(deps.getActiveMode());
      return mode ? statuses[mode] : undefined;
    },
    get hasUnresolvedDraft() {
      return Object.values(statuses).some(
        (s) => s && ["recovery", "conflict"].includes(s.status)
      );
    },
    get hasUnsavedChanges() {
      return draftModes.some((mode) => {
        const status = statuses[mode];
        return (
          deps.persister.hasUncommittedEditorChanges(mode) ||
          (!!status && ["saving", "error"].includes(status.status))
        );
      });
    },
    get open() {
      return open;
    },
    get busy() {
      return busy;
    },
    get versions() {
      return versions;
    },
    get dialogMode() {
      return dialogMode;
    },
    get dialogKind() {
      return dialogKind;
    },
    get message() {
      return message;
    },
    close() {
      if (!busy) open = false;
    },
    showDrafts,
    recover,
    resume,
    startFresh,
    retry,
    flushPending,
    dispose() {
      unsubscribe.forEach((stop) => stop());
    },
  };
}

export type DraftRecoveryController = ReturnType<
  typeof createDraftRecoveryController
>;
