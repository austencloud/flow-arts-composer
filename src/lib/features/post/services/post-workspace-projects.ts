import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { PostProjectSchema } from "#lib/shared/media-composition/domain/post-project.js";
import { PostPlanSchema } from "#lib/shared/media-composition/domain/post-plan.js";
import {
  readPostDraftRecords,
  type PostDraftRecord,
} from "#lib/shared/media-composition/services/post-draft-storage.js";
import { loadByIdentifier } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";
import { auth } from "#lib/shared/auth/firebase.js";
import { legacyPostOwner } from "#lib/shared/media-composition/services/post-project-store.js";

const SNAPSHOT_PREFIX = "tka:post:sequence:v1:";
const RECENT_KEY = "tka:post:recent:v1";
const SELECTED_KEY = "tka:post:selected:v1";
const PROJECT_PREFIX = "tka:post-studio:project:v2:";
const PLAN_PREFIX = "tka:post-studio:plan:v1:";
const memorySnapshots = new Map<string, SequenceData>();

function accountId(): string | null {
  return auth.currentUser && !auth.currentUser.isAnonymous
    ? auth.currentUser.uid
    : null;
}

function scopedKey(key: string): string {
  const uid = accountId();
  return uid
    ? `${key}:account:${uid}`
    : legacyPostOwner()
      ? `${key}:guest`
      : key;
}

function snapshotKey(sequenceId: string): string {
  return `${scopedKey(SNAPSHOT_PREFIX)}${sequenceId}`;
}

export interface PostProjectChoice {
  sequenceId: string;
  title: string;
  word: string;
  updatedAt: number;
  hasDraft: boolean;
}

interface RecentSequence {
  sequenceId: string;
  title: string;
  word: string;
  openedAt: number;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function recentSequences(): RecentSequence[] {
  try {
    const parsed: unknown = JSON.parse(
      safeStorage()?.getItem(scopedKey(RECENT_KEY)) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is RecentSequence =>
            !!entry &&
            typeof entry === "object" &&
            typeof entry.sequenceId === "string" &&
            typeof entry.title === "string" &&
            typeof entry.word === "string" &&
            typeof entry.openedAt === "number"
        )
      : [];
  } catch {
    return [];
  }
}

export function rememberPostSequence(sequence: SequenceData): void {
  if (!sequence.id) throw new Error("A sequence needs an ID to open in Post.");
  cachePostSequence(sequence);
  const store = safeStorage();
  const recent = [
    {
      sequenceId: sequence.id,
      title:
        sequence.displayName || sequence.name || sequence.word || sequence.id,
      word: sequence.word || "",
      openedAt: Date.now(),
    },
    ...recentSequences().filter((entry) => entry.sequenceId !== sequence.id),
  ].slice(0, 50);
  try {
    store?.setItem(scopedKey(RECENT_KEY), JSON.stringify(recent));
    store?.setItem(scopedKey(SELECTED_KEY), sequence.id);
  } catch {
    // A full sequence may exceed browser quota. Its identity is still saved when possible.
  }
}

/** Cache a cloud source without changing the user's current Post selection. */
export function cachePostSequence(sequence: SequenceData): void {
  if (!sequence.id || !sequence.steps?.length) return;
  memorySnapshots.set(snapshotKey(sequence.id), sequence);
  try {
    safeStorage()?.setItem(snapshotKey(sequence.id), JSON.stringify(sequence));
  } catch {
    // The in-memory snapshot still supports this session.
  }
}

export function selectPostSequence(sequenceId: string): void {
  const store = safeStorage();
  try {
    store?.setItem(scopedKey(SELECTED_KEY), sequenceId);
  } catch {
    /* in-memory navigation still works */
  }
  const recent = recentSequences();
  const selected = recent.find((entry) => entry.sequenceId === sequenceId);
  if (!selected) return;
  try {
    store?.setItem(
      scopedKey(RECENT_KEY),
      JSON.stringify([
        { ...selected, openedAt: Date.now() },
        ...recent.filter((entry) => entry.sequenceId !== sequenceId),
      ])
    );
  } catch {
    /* selection remains in the URL */
  }
}

export function lastSelectedPostSequenceId(): string | null {
  try {
    return safeStorage()?.getItem(scopedKey(SELECTED_KEY)) || null;
  } catch {
    return null;
  }
}

export async function resolvePostSequence(
  sequenceId: string
): Promise<SequenceData | null> {
  const cached = cachedPostSequence(sequenceId);
  if (cached) return cached;
  const loaded = await loadByIdentifier(sequenceId, { wordFallback: false });
  return loaded?.id === sequenceId && loaded.steps?.length ? loaded : null;
}

function cachedPostSequence(sequenceId: string): SequenceData | null {
  const memory = memorySnapshots.get(snapshotKey(sequenceId));
  if (memory?.id === sequenceId && memory.steps?.length) return memory;
  try {
    const raw =
      safeStorage()?.getItem(snapshotKey(sequenceId)) ??
      (!legacyPostOwner() || legacyPostOwner() === accountId()
        ? safeStorage()?.getItem(`${SNAPSHOT_PREFIX}${sequenceId}`)
        : null);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        "id" in parsed &&
        parsed.id === sequenceId &&
        "steps" in parsed &&
        Array.isArray(parsed.steps) &&
        parsed.steps.length > 0
      )
        return parsed as SequenceData;
    }
  } catch {
    /* An invalid snapshot must not open another sequence. */
  }
  return null;
}

function legacyPlanChoices(): PostProjectChoice[] {
  const store = safeStorage();
  if (!store) return [];
  const choices: PostProjectChoice[] = [];
  try {
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (!key?.startsWith(PLAN_PREFIX)) continue;
      const raw = store.getItem(key);
      if (!raw) continue;
      try {
        const parsed = PostPlanSchema.safeParse(JSON.parse(raw));
        if (
          !parsed.success ||
          key !== `${PLAN_PREFIX}${parsed.data.sequenceId}`
        )
          continue;
        choices.push({
          sequenceId: parsed.data.sequenceId,
          title: parsed.data.sequenceId,
          word: "",
          updatedAt: parsed.data.updatedAt,
          hasDraft: true,
        });
      } catch {
        /* Keep discovering other plans. */
      }
    }
  } catch {
    /* A bad legacy plan leaves valid projects available. */
  }
  return choices;
}

function choicesFromRecords(
  records: readonly PostDraftRecord[]
): Map<string, PostProjectChoice> {
  const choices = new Map<string, PostProjectChoice>();
  for (const record of records) {
    if (
      !record.key.startsWith(PROJECT_PREFIX) ||
      record.key.startsWith(`${PROJECT_PREFIX}previous:`) ||
      record.key.startsWith(`${PROJECT_PREFIX}before-import:`)
    )
      continue;
    try {
      const parsed = PostProjectSchema.safeParse(JSON.parse(record.value));
      if (!parsed.success) continue;
      const project = parsed.data;
      const studioId = project.sequenceId.startsWith("studio-arrangement:");
      const uid = accountId();
      const studioKey =
        studioId && uid
          ? `${PROJECT_PREFIX}account:${uid}:${project.sequenceId}`
          : studioId && legacyPostOwner()
            ? `${PROJECT_PREFIX}guest:${project.sequenceId}`
            : studioId
              ? `${PROJECT_PREFIX}${project.sequenceId}`
              : null;
      const unclaimedStudio =
        studioId &&
        !legacyPostOwner() &&
        record.key === `${PROJECT_PREFIX}${project.sequenceId}`;
      if (
        studioId
          ? record.key !== studioKey && !unclaimedStudio
          : record.key !== `${PROJECT_PREFIX}${project.sequenceId}` &&
            record.key !== `${PROJECT_PREFIX}guest:${project.sequenceId}`
      )
        continue;
      const current = choices.get(project.sequenceId);
      if (current && current.updatedAt >= project.updatedAt) continue;
      choices.set(project.sequenceId, {
        sequenceId: project.sequenceId,
        title: project.sequenceId,
        word: "",
        updatedAt: project.updatedAt,
        hasDraft: true,
      });
    } catch {
      /* One malformed backup cannot hide other projects. */
    }
  }
  return choices;
}

export async function listPostProjects(): Promise<{
  projects: PostProjectChoice[];
  error: string | null;
}> {
  const guestAfterClaim =
    !!legacyPostOwner() &&
    legacyPostOwner() !==
      (auth.currentUser?.isAnonymous ? null : auth.currentUser?.uid);
  let browserRecords: PostDraftRecord[] = [];
  let error: string | null = null;
  try {
    browserRecords = readPostDraftRecords();
  } catch {
    error = "Browser drafts could not be read.";
  }
  let diskRecords: PostDraftRecord[] = [];
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (guestAfterClaim && !accountId())
      throw new Error("Account backups are private.");
    const archive = (async () => {
      const response = await fetch("/_local/post-studio-drafts", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      return response.json() as Promise<unknown>;
    })();
    const body: unknown = await Promise.race([
      archive,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          controller.abort();
          reject(new Error("Backup listing timed out."));
        }, 10_000);
      }),
    ]);
    if (
      !body ||
      typeof body !== "object" ||
      !("records" in body) ||
      !Array.isArray(body.records)
    )
      throw new Error();
    diskRecords = body.records.filter(
      (record: unknown): record is PostDraftRecord =>
        !!record &&
        typeof record === "object" &&
        "key" in record &&
        typeof record.key === "string" &&
        "value" in record &&
        typeof record.value === "string" &&
        (!guestAfterClaim ||
          record.key.startsWith(
            `${PROJECT_PREFIX}account:${accountId()}:studio-arrangement:`
          ))
    );
  } catch {
    error = guestAfterClaim
      ? error
      : [
          error,
          "Computer backups could not be read. Browser projects are shown.",
        ]
          .filter(Boolean)
          .join(" ");
  } finally {
    clearTimeout(deadline);
  }
  const choices = choicesFromRecords([...browserRecords, ...diskRecords]);
  for (const legacy of guestAfterClaim ? [] : legacyPlanChoices()) {
    if (!choices.has(legacy.sequenceId)) choices.set(legacy.sequenceId, legacy);
  }
  for (const recent of guestAfterClaim ? [] : recentSequences()) {
    const draft = choices.get(recent.sequenceId);
    choices.set(recent.sequenceId, {
      sequenceId: recent.sequenceId,
      title: recent.title,
      word: recent.word,
      updatedAt: Math.max(draft?.updatedAt ?? 0, recent.openedAt),
      hasDraft: !!draft,
    });
  }
  for (const choice of choices.values()) {
    if (choice.title !== choice.sequenceId) continue;
    const sequence = cachedPostSequence(choice.sequenceId);
    if (!sequence) continue;
    choice.title =
      sequence.displayName || sequence.name || sequence.word || sequence.id;
    choice.word = sequence.word || "";
  }
  return {
    projects: [...choices.values()]
      .map((choice) => ({
        ...choice,
        title: simplifyRepeatedWord(choice.title),
        word: simplifyRepeatedWord(choice.word),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    error,
  };
}
