import type { BuildModeId } from "#lib/shared/foundation/ui/ui-types.js";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type {
  DraftStatus,
  DraftVersion,
  SequencePersister,
} from "../../services/sequence-persister";
import { distinctVisibleVersions } from "../../services/draft-visible-versions.js";
import {
  removeToast,
  showToast,
} from "#lib/shared/toast/state/toast-state.svelte.js";

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
  const offered = new Map<DraftMode, string>();
  const offerToasts = new Map<DraftMode, string>();
  const unsubscribe = draftModes.map((mode) =>
    deps.persister.subscribeDraftStatus(mode, (status) => {
      statuses[mode] = status;
      const toastId = offerToasts.get(mode);
      if (toastId && !["recovery", "conflict"].includes(status.status)) {
        // Resolved, usually by editing on: the offer no longer applies.
        removeToast(toastId, "programmatic");
        offerToasts.delete(mode);
      }
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

  function observeActiveMode() {
    const mode = draftMode(deps.getActiveMode());
    if (!mode) return;
    const status = statuses[mode];
    if (!status || !["recovery", "conflict"].includes(status.status)) return;
    // Offer once per state, never as a dialog: editing on makes this
    // editor's work the draft and every other version stays in Drafts.
    const key = `${status.sessionId}:${status.status}`;
    if (offered.get(mode) === key) return;
    offered.set(mode, key);
    offerDraft(mode, status);
  }

  function offerDraft(mode: DraftMode, status: DraftStatus) {
    const latest = distinctVisibleVersions(status.candidates)[0];
    const state = deps.getSequenceState(mode);
    const editorEmpty =
      !state.hasStartPlacement && !state.currentSequence?.steps?.length;
    const previous = offerToasts.get(mode);
    if (previous) removeToast(previous, "programmatic");
    const toastId =
      editorEmpty && latest
        ? showToast({
            message: "You have an unfinished draft.",
            // Stays until closed or until building on resolves it, so a slow
            // load cannot time the offer out before anyone sees it.
            duration: 0,
            announcement: "polite",
            action: {
              label: "Resume",
              onClick: () => void resume(mode, latest.id),
            },
          })
        : showToast({
            message:
              status.status === "conflict"
                ? "This draft also changed in another tab. Both versions are in Drafts."
                : "An earlier version of this draft is in Drafts.",
            duration: 8000,
            announcement: "polite",
            action: { label: "Drafts", onClick: deps.openDrafts },
          });
    offerToasts.set(mode, toastId);
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
      offered.delete(dialogMode);
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
      offered.delete(dialogMode);
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
    observeActiveMode,
    recover,
    resume,
    startFresh,
    retry,
    flushPending,
    dispose() {
      unsubscribe.forEach((stop) => stop());
      offerToasts.forEach((id) => removeToast(id, "programmatic"));
    },
  };
}

export type DraftRecoveryController = ReturnType<
  typeof createDraftRecoveryController
>;
