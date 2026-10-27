import {
  initialize as persistenceInitialize,
  saveCurrentSequenceState,
  loadCurrentSequenceState,
  clearCurrentSequenceState,
} from "#lib/shared/persistence/services/dexie-persistence-service.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import { UserWorkType } from "#lib/shared/persistence/domain/enums/user-work-type.js";
import type { ActiveCreateModule } from "#lib/shared/foundation/ui/ui-types.js";
import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
import {
  commitDraft,
  getDraftHead,
  keepDraftVersion,
  listStoredDraftVersions,
  storeDivergentDraft,
} from "./draft-storage.js";
import type {
  DraftHistory,
  DraftStatus,
  DraftVersion,
  WorkspaceDraftState,
} from "./draft-types.js";

export type {
  DraftHistory,
  DraftStatus,
  DraftVersion,
  WorkspaceDraftState,
} from "./draft-types.js";

type HistoryAdapter = {
  capture(mode: ActiveCreateModule): DraftHistory;
  restore(
    mode: ActiveCreateModule,
    sessionId: string,
    history?: DraftHistory
  ): void;
};
type LocalDraft = {
  workspace: WorkspaceDraftState | null;
  id: string | null;
  sessionId: string | null;
};
const modes: ActiveCreateModule[] = [
  "construct",
  "generate",
  "assemble",
  "spell",
];
const localKey = (mode: ActiveCreateModule) => `tka-${mode}-sequence-state-v1`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const isMode = (value: unknown): value is ActiveCreateModule =>
  typeof value === "string" && modes.includes(value as ActiveCreateModule);
const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
// Whether a workspace holds anything at all. An editor that was never opened
// has no sequence and no start placement.
const holdsWork = (state: WorkspaceDraftState): boolean =>
  state.currentSequence !== null ||
  state.hasStartPlacement ||
  state.selectedStartPlacement !== null;

export class SequencePersister {
  private readonly writerId = newId();
  private readonly revisions = new Map<ActiveCreateModule, number | null>();
  private readonly sessions = new Map<ActiveCreateModule, string>();
  private readonly preparedResumes = new Map<
    ActiveCreateModule,
    DraftVersion
  >();
  private readonly statuses = new Map<ActiveCreateModule, DraftStatus>();
  private readonly listeners = new Map<
    ActiveCreateModule,
    Set<(status: DraftStatus) => void>
  >();
  private readonly queues = new Map<ActiveCreateModule, Promise<unknown>>();
  private readonly pending = new Map<ActiveCreateModule, WorkspaceDraftState>();
  private readonly pendingHistory = new Map<
    ActiveCreateModule,
    DraftHistory | undefined
  >();
  private readonly pendingRecovery = new Map<
    ActiveCreateModule,
    DraftVersion
  >();
  private readonly dirtyGeneration = new Map<ActiveCreateModule, number>();
  private readonly durableGeneration = new Map<ActiveCreateModule, number>();
  private historyAdapter: HistoryAdapter | null = null;

  private currentMode(): ActiveCreateModule {
    return isMode(navigationState.currentSection)
      ? navigationState.currentSection
      : "construct";
  }
  private session(mode: ActiveCreateModule): string {
    let session = this.sessions.get(mode);
    if (!session) {
      session = newId();
      this.sessions.set(mode, session);
    }
    return session;
  }
  getSessionId(mode: ActiveCreateModule): string {
    return this.session(mode);
  }
  getDraftStatus(mode: ActiveCreateModule): DraftStatus {
    return (
      this.statuses.get(mode) ?? {
        status: "idle",
        savedAt: null,
        error: null,
        candidates: [],
        sessionId: this.session(mode),
      }
    );
  }
  subscribeDraftStatus(
    mode: ActiveCreateModule,
    listener: (status: DraftStatus) => void
  ): () => void {
    const listeners = this.listeners.get(mode) ?? new Set();
    listeners.add(listener);
    this.listeners.set(mode, listeners);
    listener(this.getDraftStatus(mode));
    return () => {
      listeners.delete(listener);
    };
  }
  private setStatus(
    mode: ActiveCreateModule,
    update: Partial<DraftStatus>
  ): void {
    const status = {
      ...this.getDraftStatus(mode),
      ...update,
      sessionId: this.session(mode),
    };
    this.statuses.set(mode, status);
    this.listeners.get(mode)?.forEach((listener) => listener(status));
  }
  markDirty(mode: ActiveCreateModule): void {
    this.dirtyGeneration.set(mode, (this.dirtyGeneration.get(mode) ?? 0) + 1);
    const current = this.getDraftStatus(mode).status;
    if (
      current === "recovery" ||
      current === "conflict" ||
      this.pendingRecovery.has(mode)
    )
      return;
    this.setStatus(mode, { status: "saving", error: null });
  }
  hasUncommittedEditorChanges(mode: ActiveCreateModule): boolean {
    return (
      (this.dirtyGeneration.get(mode) ?? 0) >
      (this.durableGeneration.get(mode) ?? 0)
    );
  }
  async preserveEditorSnapshot(
    state: WorkspaceDraftState,
    retainCandidateId?: string
  ): Promise<boolean> {
    const mode = state.activeBuildSection;
    if (!this.hasUncommittedEditorChanges(mode)) return true;
    const generation = this.dirtyGeneration.get(mode) ?? 0;
    const version = this.makeVersion(
      mode,
      state,
      this.historyAdapter?.capture(mode)
    );
    return this.enqueue(mode, async () => {
      await storeDivergentDraft(version, this.writerId, retainCandidateId);
      this.durableGeneration.set(mode, generation);
      this.setStatus(mode, { candidates: await this.listDrafts(mode) });
      return !this.hasUncommittedEditorChanges(mode);
    });
  }
  setHistoryAdapter(adapter: HistoryAdapter): void {
    this.historyAdapter = adapter;
  }
  async initialize(): Promise<void> {
    await persistenceInitialize();
  }
  async waitForPendingSaves(): Promise<void> {
    // Failed primary writes can still have a durable recovery copy to list.
    await Promise.allSettled([...this.queues.values()]);
  }
  private enqueue<T>(
    mode: ActiveCreateModule,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.queues.get(mode) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(mode, next);
    return next;
  }
  private makeVersion(
    mode: ActiveCreateModule,
    workspace: WorkspaceDraftState,
    history?: DraftHistory
  ): DraftVersion {
    return {
      id: newId(),
      sessionId: this.session(mode),
      mode,
      savedAt: Date.now(),
      workspace: clone(workspace),
      ...(history ? { history: clone(history) } : {}),
    };
  }
  private async writePrimary(version: DraftVersion): Promise<void> {
    await saveCurrentSequenceState(version.workspace);
    const key = localKey(version.mode);
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<
      string,
      unknown
    >;
    localStorage.setItem(
      key,
      JSON.stringify({
        ...raw,
        draftId: version.id,
        draftSessionId: version.sessionId,
      })
    );
  }
  async saveCurrentState(state: WorkspaceDraftState): Promise<void> {
    return this.saveSnapshot(
      state,
      this.historyAdapter?.capture(state.activeBuildSection)
    );
  }
  private async saveSnapshot(
    state: WorkspaceDraftState,
    history?: DraftHistory
  ): Promise<void> {
    const mode = state.activeBuildSection;
    const snapshot = clone(state);
    this.pending.set(mode, snapshot);
    this.pendingHistory.set(mode, history);
    this.markDirty(mode);
    const generation = this.dirtyGeneration.get(mode) ?? 0;
    return this.enqueue(mode, async () => {
      if (!this.revisions.has(mode) && !holdsWork(snapshot)) {
        // This page never opened the mode (no load, new session or fresh
        // draft read its head) and its editor is empty, yet a mode switch
        // still saves the mode being left. Committing would overwrite the
        // stored draft with nothing, and the unread revision made it look
        // like another tab's (production 2026-10-24 to 10-27: a reload onto
        // the Create front door, then a pick of Generate).
        if (this.pending.get(mode) === snapshot) {
          this.pending.delete(mode);
          this.pendingHistory.delete(mode);
        }
        this.durableGeneration.set(mode, generation);
        this.setStatus(mode, { status: "idle", error: null });
        return;
      }
      try {
        const current = this.getDraftStatus(mode).status;
        if (
          current === "recovery" ||
          current === "conflict" ||
          this.pendingRecovery.has(mode)
        ) {
          await this.takeOverDraft(mode);
        }
        const version = this.makeVersion(mode, snapshot, history);
        // An ordinary reread never grants this editor permission to replace another tab's changes.
        const result = await commitDraft(
          mode,
          this.revisions.get(mode) ?? null,
          version,
          version,
          this.writerId
        );
        if (!result.accepted) {
          this.revisions.set(mode, result.revision);
          this.durableGeneration.set(mode, generation);
          this.setStatus(mode, {
            status: "conflict",
            error: "Another tab changed this draft.",
            candidates: await this.listDrafts(mode),
          });
          // This editor's work is kept in its conflict slot; its next save
          // takes the draft over.
          throw new Error("Another tab changed this draft.");
        }
        this.revisions.set(mode, result.revision);
        await this.writePrimary(version);
        this.durableGeneration.set(mode, generation);
        if (
          this.pending.get(mode) === snapshot &&
          !this.hasUncommittedEditorChanges(mode)
        ) {
          this.pending.delete(mode);
          this.pendingHistory.delete(mode);
          this.setStatus(mode, {
            status: "saved",
            savedAt: version.savedAt,
            error: null,
            candidates: [],
          });
        } else if (
          ["recovery", "conflict"].includes(this.getDraftStatus(mode).status)
        ) {
          // Newer edits are queued; this editor already owns the draft.
          this.setStatus(mode, { status: "saving", error: null });
        }
      } catch (error) {
        if (this.getDraftStatus(mode).status !== "conflict") {
          this.setStatus(mode, { status: "error", error: errorText(error) });
        }
        throw error;
      }
    });
  }
  /**
   * Editing while another version is waiting makes this editor's work the
   * draft. Nobody has to choose first: the waiting versions stay listed in
   * Drafts, because commitDraft keeps the replaced head in its session slot.
   */
  private async takeOverDraft(mode: ActiveCreateModule): Promise<void> {
    const head = await getDraftHead(mode);
    const retry = this.pendingRecovery.get(mode);
    if (retry) await keepDraftVersion(retry);
    if (!head) {
      // A legacy backup is only listed while no head exists.
      const backup = await this.legacyBackup(mode);
      if (backup) await keepDraftVersion(backup);
    }
    // Sharing the head's session would push its version out of the slot.
    if (head?.version?.sessionId === this.session(mode)) {
      this.sessions.set(mode, newId());
    }
    this.revisions.set(mode, head?.revision ?? null);
    this.pendingRecovery.delete(mode);
    this.preparedResumes.delete(mode);
  }
  async retrySave(mode: ActiveCreateModule): Promise<void> {
    const pending = this.pending.get(mode);
    if (pending)
      await this.saveSnapshot(pending, this.pendingHistory.get(mode));
  }
  private async readLocal(mode: ActiveCreateModule): Promise<LocalDraft> {
    let raw: Record<string, unknown> | null = null;
    try {
      const text = localStorage.getItem(localKey(mode));
      raw = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      /* The legacy loader discards a damaged copy. */
    }
    const loaded = await loadCurrentSequenceState(mode);
    return {
      workspace: loaded ? { ...loaded, activeBuildSection: mode } : null,
      id: typeof raw?.draftId === "string" ? raw.draftId : null,
      sessionId:
        typeof raw?.draftSessionId === "string" ? raw.draftSessionId : null,
    };
  }
  private async legacyBackup(
    mode: ActiveCreateModule
  ): Promise<DraftVersion | null> {
    if (mode !== "construct") return null;
    const rows = await db.userWork
      .where("[type+tabId]")
      .equals([UserWorkType.SEQUENCE_DRAFT, "create"])
      .sortBy("lastModified");
    const row = rows.at(-1);
    const data = row?.data as
      | { sessionId?: unknown; sequenceData?: unknown }
      | undefined;
    if (
      typeof data?.sessionId !== "string" ||
      !data.sequenceData ||
      typeof data.sequenceData !== "object" ||
      !Array.isArray((data.sequenceData as { steps?: unknown }).steps)
    )
      return null;
    return {
      id: `legacy-create-${row?.id ?? data.sessionId}`,
      sessionId: data.sessionId,
      mode,
      savedAt: row?.lastModified?.getTime() ?? Date.now(),
      workspace: {
        currentSequence:
          data.sequenceData as WorkspaceDraftState["currentSequence"],
        selectedStartPlacement: null,
        hasStartPlacement: false,
        activeBuildSection: mode,
      },
    };
  }
  async listDrafts(mode: ActiveCreateModule): Promise<DraftVersion[]> {
    const versions = await listStoredDraftVersions(mode);
    const retry = this.pendingRecovery.get(mode);
    if (retry && !versions.some((version) => version.id === retry.id))
      versions.push(retry);
    let hasHead = true;
    try {
      hasHead = !!(await getDraftHead(mode));
    } catch {
      // A damaged head must not hide the independently stored versions.
    }
    if (!hasHead) {
      const backup = await this.legacyBackup(mode);
      if (backup) versions.push(backup);
    }
    return versions.sort((a, b) => b.savedAt - a.savedAt);
  }
  async loadCurrentState(mode?: string): Promise<WorkspaceDraftState | null> {
    const target = isMode(mode) ? mode : this.currentMode();
    // A load reads the head and the primary copy across several awaits. Run
    // it in the mode's queue so an autosave cannot land between those reads
    // and make this editor look like another tab.
    return this.enqueue(target, () => this.loadQueued(target));
  }
  private async loadQueued(
    target: ActiveCreateModule
  ): Promise<WorkspaceDraftState | null> {
    try {
      const head = await getDraftHead(target);
      const local = await this.readLocal(target);
      const originalRevision = this.revisions.get(target);
      if (!this.revisions.has(target))
        this.revisions.set(target, head?.revision ?? null);
      const revisionMoved =
        originalRevision !== undefined &&
        originalRevision !== (head?.revision ?? null);
      if (
        revisionMoved &&
        head?.version &&
        head.version.sessionId === this.sessions.get(target)
      ) {
        // This editor's own session wrote the newer head (a save from before
        // a reload, or a remounted editor). It is not another tab: adopt it.
        this.revisions.set(target, head.revision);
      } else if (revisionMoved) {
        const pending = this.pending.get(target);
        if (pending)
          await storeDivergentDraft(
            this.makeVersion(target, pending, this.pendingHistory.get(target)),
            this.writerId
          );
        this.revisions.set(target, head?.revision ?? null);
        this.setStatus(target, {
          status: "conflict",
          error: "Another tab changed this draft.",
          candidates: await this.listDrafts(target),
        });
        return null;
      }
      if (head && !head.version) {
        this.historyAdapter?.restore(target, this.session(target));
        this.setStatus(target, {
          status: "idle",
          savedAt: null,
          error: null,
          candidates: [],
        });
        return null;
      }
      if (head?.version && local.workspace && local.id === head.version.id) {
        this.sessions.set(target, head.version.sessionId);
        this.historyAdapter?.restore(
          target,
          head.version.sessionId,
          head.version.history
        );
        this.setStatus(target, {
          status: "saved",
          savedAt: head.version.savedAt,
          error: null,
          candidates: [],
        });
        return local.workspace;
      }
      if (head?.version) {
        if (local.workspace && local.id !== head.version.id) {
          await storeDivergentDraft(
            {
              id: local.id ?? newId(),
              sessionId: local.sessionId ?? newId(),
              mode: target,
              savedAt: Date.now(),
              workspace: clone(local.workspace),
            },
            this.writerId
          );
        }
        this.setStatus(target, {
          status: local.workspace ? "conflict" : "recovery",
          savedAt: head.version.savedAt,
          error: null,
          candidates: await this.listDrafts(target),
        });
        return null;
      }
      if (local.workspace) {
        this.historyAdapter?.restore(target, this.session(target));
        this.setStatus(target, {
          status: "idle",
          savedAt: null,
          error: null,
          candidates: [],
        });
        return local.workspace;
      }
      const backup = await this.legacyBackup(target);
      if (!backup) this.historyAdapter?.restore(target, this.session(target));
      this.setStatus(target, {
        status: backup ? "recovery" : "idle",
        candidates: backup ? [backup] : [],
        error: null,
      });
      return null;
    } catch (error) {
      this.setStatus(target, {
        status: "error",
        error: errorText(error),
        candidates: await listStoredDraftVersions(target).catch(() => []),
      });
      return null;
    }
  }
  async prepareDraftResume(
    mode: ActiveCreateModule,
    id: string
  ): Promise<void> {
    this.preparedResumes.delete(mode);
    const chosen = (await this.listDrafts(mode)).find(
      (version) => version.id === id
    );
    // Initialization can autosave equivalent state with a new ID. Hold the
    // selected version until recovery accepts it, before those effects start.
    if (chosen) this.preparedResumes.set(mode, clone(chosen));
  }
  async recoverDraft(
    mode: ActiveCreateModule,
    id: string
  ): Promise<WorkspaceDraftState | null> {
    return this.enqueue(mode, async () => {
      const prepared = this.preparedResumes.get(mode);
      const chosen =
        prepared?.id === id
          ? prepared
          : (await this.listDrafts(mode)).find((version) => version.id === id);
      if (!chosen) return null;
      try {
        if (!this.revisions.has(mode)) {
          const head = await getDraftHead(mode);
          this.revisions.set(mode, head?.revision ?? null);
        }
        const accepted: DraftVersion = {
          ...clone(chosen),
          id: newId(),
          savedAt: Date.now(),
        };
        const result = await commitDraft(
          mode,
          this.revisions.get(mode) ?? null,
          accepted,
          accepted,
          this.writerId
        );
        if (!result.accepted) {
          this.revisions.set(mode, result.revision);
          this.pendingRecovery.set(mode, chosen);
          this.setStatus(mode, {
            status: "conflict",
            error: "Another tab changed this draft.",
            candidates: await this.listDrafts(mode),
          });
          return null;
        }
        this.revisions.set(mode, result.revision);
        await this.writePrimary(accepted);
        this.sessions.set(mode, chosen.sessionId);
        this.historyAdapter?.restore(mode, chosen.sessionId, chosen.history);
        this.pending.delete(mode);
        this.pendingHistory.delete(mode);
        this.pendingRecovery.delete(mode);
        this.preparedResumes.delete(mode);
        this.durableGeneration.set(mode, this.dirtyGeneration.get(mode) ?? 0);
        this.setStatus(mode, {
          status: "saved",
          savedAt: accepted.savedAt,
          error: null,
          candidates: [],
        });
        return clone(chosen.workspace);
      } catch (error) {
        this.pendingRecovery.set(mode, chosen);
        try {
          await storeDivergentDraft(chosen, this.writerId);
        } catch {
          // The current editor can still retry the selected version.
        }
        this.setStatus(mode, {
          status: "error",
          error: errorText(error),
          candidates: await this.listDrafts(mode),
        });
        return null;
      }
    });
  }
  async startFreshDraft(
    mode: ActiveCreateModule
  ): Promise<WorkspaceDraftState | null> {
    return this.enqueue(mode, async () => {
      try {
        const result = await commitDraft(
          mode,
          this.revisions.get(mode) ?? null,
          null,
          undefined,
          this.writerId
        );
        if (!result.accepted) {
          this.revisions.set(mode, result.revision);
          this.setStatus(mode, {
            status: "conflict",
            error: "Another tab changed this draft.",
            candidates: await this.listDrafts(mode),
          });
          return null;
        }
        this.revisions.set(mode, result.revision);
        await clearCurrentSequenceState(mode);
        const sessionId = newId();
        this.sessions.set(mode, sessionId);
        this.preparedResumes.delete(mode);
        this.historyAdapter?.restore(mode, sessionId);
        this.pending.delete(mode);
        this.pendingHistory.delete(mode);
        this.pendingRecovery.delete(mode);
        this.durableGeneration.set(mode, this.dirtyGeneration.get(mode) ?? 0);
        this.setStatus(mode, {
          status: "idle",
          savedAt: null,
          error: null,
          candidates: [],
        });
        return null;
      } catch (error) {
        this.setStatus(mode, { status: "error", error: errorText(error) });
        return null;
      }
    });
  }
  async beginNewSession(mode: ActiveCreateModule): Promise<void> {
    this.preparedResumes.delete(mode);
    await this.enqueue(mode, async () => {
      const head = await getDraftHead(mode);
      this.revisions.set(mode, head?.revision ?? null);
      const sessionId = newId();
      this.sessions.set(mode, sessionId);
      this.historyAdapter?.restore(mode, sessionId);
      this.pending.delete(mode);
      this.pendingHistory.delete(mode);
      this.pendingRecovery.delete(mode);
      this.durableGeneration.set(mode, this.dirtyGeneration.get(mode) ?? 0);
      this.setStatus(mode, {
        status: "idle",
        savedAt: null,
        error: null,
        candidates: [],
      });
    });
  }
  async clearCurrentState(mode?: string): Promise<void> {
    const target = isMode(mode) ? mode : this.currentMode();
    await this.startFreshDraft(target);
    const status = this.getDraftStatus(target);
    if (status.status === "error" || status.status === "conflict") {
      throw new Error(status.error ?? "Could not clear draft");
    }
  }
  async hasSavedState(mode?: string): Promise<boolean> {
    return (await this.loadCurrentState(mode)) !== null;
  }
  async getLastSaveTimestamp(mode?: string): Promise<number | null> {
    const target = isMode(mode) ? mode : this.currentMode();
    return (await getDraftHead(target))?.version?.savedAt ?? null;
  }
}

export const sequencePersister = new SequencePersister();
