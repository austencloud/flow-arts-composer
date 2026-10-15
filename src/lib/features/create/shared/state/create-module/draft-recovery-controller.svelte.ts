import type { BuildModeId } from "#lib/shared/foundation/ui/ui-types.js";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type {
  DraftStatus,
  DraftVersion,
  SequencePersister,
} from "../../services/sequence-persister";

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
}) {
  let statuses = $state<Partial<Record<DraftMode, DraftStatus>>>({});
  let open = $state(false);
  let busy = $state(false);
  let versions = $state<DraftVersion[]>([]);
  let dialogMode = $state<DraftMode>("construct");
  let message = $state<string | null>(null);
  let dialogKind = $state<"recovery" | "conflict" | "history">("history");
  const offered = new Map<DraftMode, string>();
  const unsubscribe = draftModes.map((mode) =>
    deps.persister.subscribeDraftStatus(mode, (status) => {
      statuses[mode] = status;
      if (open && dialogMode === mode && status.candidates.length) {
        versions = status.candidates;
      }
    })
  );

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
      versions = await deps.persister.listDrafts(mode);
    } catch {
      message = "Saved drafts could not be read. Try again.";
    } finally {
      busy = false;
    }
  }

  function observeActiveMode() {
    const mode = draftMode(deps.getActiveMode());
    if (!mode) return;
    const status = statuses[mode];
    if (!status || !["recovery", "conflict"].includes(status.status)) return;
    // Dismissing a warning does not resolve it, but it should not trap someone
    // in a dialog every time their in-memory sequence changes.
    const key = `${status.sessionId}:${status.status}`;
    if (offered.get(mode) === key) return;
    offered.set(mode, key);
    void showDrafts(mode);
  }

  async function recover(id: string) {
    if (busy) return;
    busy = true;
    message = null;
    try {
      deps.getSequenceState(dialogMode).cancelPendingSave();
      const workspace = await deps.persister.recoverDraft(dialogMode, id);
      if (!workspace) {
        message =
          "This version could not be opened. Review the saved versions and try again.";
        versions = await deps.persister.listDrafts(dialogMode);
        return;
      }
      deps.getSequenceState(dialogMode).restoreDraftState(workspace);
      deps.onRestored(dialogMode);
      open = false;
      offered.delete(dialogMode);
    } catch {
      message =
        "This version could not be opened. Your drafts are still available.";
    } finally {
      busy = false;
    }
  }

  async function startFresh() {
    if (busy) return;
    busy = true;
    message = null;
    try {
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
      return Object.values(statuses).some(
        (s) => s && ["saving", "error"].includes(s.status)
      );
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
