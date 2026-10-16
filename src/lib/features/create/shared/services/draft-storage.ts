import { db } from "#lib/shared/persistence/database/tka-database.js";
import { UserWorkType } from "#lib/shared/persistence/domain/enums/user-work-type.js";
import type { UserWorkData } from "#lib/shared/persistence/domain/models/user-work-data.js";
import type { ActiveCreateModule } from "#lib/shared/foundation/ui/ui-types.js";
import type { DraftVersion } from "./draft-types.js";

interface DraftHead {
  revision: number;
  version: DraftVersion | null;
}

type DraftRecord =
  | { kind: "head"; head: DraftHead }
  | { kind: "version"; version: DraftVersion };

const tabKey = (mode: ActiveCreateModule, suffix: string) =>
  `create-draft-v2:${mode}:${suffix}`;

function contentKey(version: DraftVersion): string {
  // IDs and save times change on retry; the editor state and undo history do not.
  return JSON.stringify([
    version.workspace,
    version.history?.undo ?? [],
    version.history?.redo ?? [],
  ]);
}

async function getRecord(tabId: string): Promise<UserWorkData | undefined> {
  return db.userWork
    .where("[type+tabId]")
    .equals([UserWorkType.SEQUENCE_DRAFT, tabId])
    .first();
}

async function putRecord(tabId: string, data: DraftRecord): Promise<void> {
  const existing = await getRecord(tabId);
  if (existing?.id !== undefined) {
    await db.userWork.update(existing.id, { data });
  } else {
    await db.userWork.add({
      type: UserWorkType.SEQUENCE_DRAFT,
      tabId,
      data,
      lastModified: new Date(),
      version: 2,
    });
  }
}

function validVersion(
  value: unknown,
  mode: ActiveCreateModule
): value is DraftVersion {
  if (!value || typeof value !== "object") return false;
  const version = value as Partial<DraftVersion>;
  const workspace = version.workspace;
  const sequence = workspace?.currentSequence;
  const validSequence =
    sequence === null ||
    (!!sequence &&
      typeof sequence === "object" &&
      typeof sequence.id === "string" &&
      typeof sequence.name === "string" &&
      Array.isArray(sequence.steps));
  return (
    typeof version.id === "string" &&
    typeof version.sessionId === "string" &&
    version.mode === mode &&
    typeof version.savedAt === "number" &&
    !!workspace &&
    typeof workspace.hasStartPlacement === "boolean" &&
    workspace.activeBuildSection === mode &&
    validSequence &&
    (workspace.selectedStartPlacement === null ||
      typeof workspace.selectedStartPlacement === "object") &&
    (!version.history ||
      (Array.isArray(version.history.undo) &&
        Array.isArray(version.history.redo)))
  );
}

function readHead(
  row: UserWorkData | undefined,
  mode: ActiveCreateModule
): DraftHead | null {
  if (!row) return null;
  const data = row.data as { kind?: unknown; head?: Partial<DraftHead> } | null;
  if (
    data?.kind !== "head" ||
    !data.head ||
    typeof data.head.revision !== "number" ||
    !Number.isSafeInteger(data.head.revision) ||
    data.head.revision < 1 ||
    (data.head.version !== null && !validVersion(data.head.version, mode))
  ) {
    throw new Error(`Stored ${mode} draft head is damaged`);
  }
  return data.head as DraftHead;
}

export async function getDraftHead(
  mode: ActiveCreateModule
): Promise<DraftHead | null> {
  return readHead(await getRecord(tabKey(mode, "head")), mode);
}

export async function listStoredDraftVersions(
  mode: ActiveCreateModule
): Promise<DraftVersion[]> {
  const rows = await db.userWork
    .where("type")
    .equals(UserWorkType.SEQUENCE_DRAFT)
    .toArray();
  const prefix = tabKey(mode, "");
  const versions = rows.flatMap((row) => {
    if (!row.tabId?.startsWith(prefix)) return [];
    const data = row.data as DraftRecord;
    if (data?.kind === "head")
      return data.head?.version && validVersion(data.head.version, mode)
        ? [{ version: data.head.version, isHead: true }]
        : [];
    return data?.kind === "version" && validVersion(data.version, mode)
      ? [{ version: data.version, isHead: false }]
      : [];
  });
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  return versions
    .sort(
      (a, b) =>
        b.version.savedAt - a.version.savedAt ||
        Number(b.isHead) - Number(a.isHead)
    )
    .filter(({ version }) => {
      const content = contentKey(version);
      if (seenIds.has(version.id) || seenContent.has(content)) return false;
      seenIds.add(version.id);
      seenContent.add(content);
      return true;
    })
    .map(({ version }) => version);
}

export async function commitDraft(
  mode: ActiveCreateModule,
  expectedRevision: number | null,
  version: DraftVersion | null,
  conflictVersion?: DraftVersion,
  writerId?: string
): Promise<{ accepted: boolean; revision: number; head: DraftHead | null }> {
  return db.transaction("rw", db.userWork, async () => {
    const head = readHead(await getRecord(tabKey(mode, "head")), mode);
    if ((head?.revision ?? null) !== expectedRevision) {
      if (conflictVersion && writerId) {
        // One latest snapshot per writer is enough to keep its divergent work safe.
        await putRecord(tabKey(mode, `conflict:${writerId}`), {
          kind: "version",
          version: conflictVersion,
        });
      }
      return { accepted: false, revision: head?.revision ?? 0, head };
    }

    if (head?.version && version) {
      // Keep one successful predecessor. Normal editing cannot grow this without bound.
      if (contentKey(head.version) !== contentKey(version)) {
        await putRecord(tabKey(mode, "previous"), {
          kind: "version",
          version: head.version,
        });
      }
      if (head.version.sessionId !== version.sessionId) {
        // Starting a different session keeps the work it replaced available
        // even after the new session has saved several more edits.
        await putRecord(tabKey(mode, "archive"), {
          kind: "version",
          version: head.version,
        });
      }
    }
    if (!version) {
      if (head?.version) {
        await putRecord(tabKey(mode, "archive"), {
          kind: "version",
          version: head.version,
        });
      }
      const previous = await getRecord(tabKey(mode, "previous"));
      if (previous?.id !== undefined) await db.userWork.delete(previous.id);
    }
    const next = { revision: (head?.revision ?? 0) + 1, version };
    await putRecord(tabKey(mode, "head"), { kind: "head", head: next });
    return { accepted: true, revision: next.revision, head: next };
  });
}

export async function storeDivergentDraft(
  version: DraftVersion,
  writerId: string,
  retainCandidateId?: string
): Promise<void> {
  await db.transaction("rw", db.userWork, async () => {
    if (retainCandidateId) {
      const existing = await getRecord(
        tabKey(version.mode, `conflict:${writerId}`)
      );
      const prior = existing?.data as DraftRecord | undefined;
      if (prior?.kind === "version" && prior.version.id === retainCandidateId) {
        await putRecord(tabKey(version.mode, `review:${writerId}`), prior);
      }
    }
    await putRecord(tabKey(version.mode, `conflict:${writerId}`), {
      kind: "version",
      version,
    });
  });
}
