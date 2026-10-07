import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { isFeatureVideoSlug } from "$lib/shared/media-composition/domain/feature-video";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";

type Command = {
  id: string;
  ready: boolean;
  baseRevision: number;
  baseFingerprint: string;
  baseSnapshot: PostProject;
  project: PostProject;
};
type Result = {
  commandId: string;
  status: "completed" | "failed";
  message: string;
  at: number;
};
type Session = {
  id: string;
  revision: number;
  fingerprint: string;
  snapshot: PostProject;
  seenAt: number;
  /** The feature video this editor has open, when it has one. */
  featureSlug?: string;
  command?: Command;
  result?: Result;
};

const sessions = new Map<string, Session>();
const ACTIVE_MS = 10_000;
const MAX_SESSIONS = 12;
const backupDir = path.join(os.homedir(), ".tka", "post-studio-manifest-edits");

export function fingerprint(project: PostProject): string {
  return createHash("sha256").update(JSON.stringify(project)).digest("hex");
}

export function listPostProjectSessions() {
  const now = Date.now();
  return [...sessions.values()]
    .filter((session) => now - session.seenAt < ACTIVE_MS)
    .map(
      ({
        id,
        revision,
        fingerprint,
        snapshot,
        seenAt,
        featureSlug,
        command,
        result,
      }) => ({
        id,
        sequenceId: snapshot.sequenceId,
        featureSlug: featureSlug ?? null,
        revision,
        fingerprint,
        seenAt,
        pendingCommandId: command?.id ?? null,
        result: result ?? null,
      })
    );
}

export function readPostProjectSession(id: string) {
  const session = sessions.get(id);
  if (!session || Date.now() - session.seenAt >= ACTIVE_MS) return null;
  return {
    id: session.id,
    featureSlug: session.featureSlug ?? null,
    revision: session.revision,
    fingerprint: session.fingerprint,
    snapshot: session.snapshot,
    pendingCommandId: session.command?.id ?? null,
    result: session.result ?? null,
  };
}

export function heartbeatPostProject(input: {
  sessionId: string;
  revision: number;
  snapshot?: unknown;
  featureSlug?: string;
  result?: {
    commandId: string;
    status: "completed" | "failed";
    message: string;
  };
}) {
  if (
    !/^[0-9a-f-]{36}$/i.test(input.sessionId) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    (input.featureSlug !== undefined && !isFeatureVideoSlug(input.featureSlug))
  )
    throw new Error("Invalid editor session.");
  let session = sessions.get(input.sessionId);
  if (session && (session.featureSlug ?? null) !== (input.featureSlug ?? null))
    throw new Error("The editor session changed project.");
  if (input.snapshot !== undefined) {
    const parsed = PostProjectSchema.safeParse(input.snapshot);
    if (!parsed.success) throw new Error("Invalid editor snapshot.");
    if (session && parsed.data.sequenceId !== session.snapshot.sequenceId)
      throw new Error("The editor session changed sequence.");
    const nextFingerprint = fingerprint(parsed.data);
    if (session && input.revision < session.revision)
      throw new Error("Stale editor heartbeat.");
    if (session) {
      session.snapshot = parsed.data;
      session.fingerprint = nextFingerprint;
      session.revision = input.revision;
    } else {
      session = {
        id: input.sessionId,
        revision: input.revision,
        fingerprint: nextFingerprint,
        snapshot: parsed.data,
        seenAt: Date.now(),
        ...(input.featureSlug ? { featureSlug: input.featureSlug } : {}),
      };
      sessions.set(input.sessionId, session);
      if (sessions.size > MAX_SESSIONS) {
        const oldest = [...sessions.values()].sort(
          (a, b) => a.seenAt - b.seenAt
        )[0];
        if (oldest) sessions.delete(oldest.id);
      }
    }
  } else if (!session) {
    throw new Error("The first heartbeat needs a snapshot.");
  }
  session.seenAt = Date.now();
  const pending = session.command;
  if (pending && input.result?.commandId === pending.id) {
    session.result = {
      commandId: pending.id,
      status: input.result.status,
      message: input.result.message.slice(0, 200),
      at: Date.now(),
    };
    session.command = undefined;
  } else if (pending && session.fingerprint === fingerprint(pending.project)) {
    // An applied command survives a lost acknowledgment or page reload.
    session.result = {
      commandId: pending.id,
      status: "completed",
      message: "Applied in editor.",
      at: Date.now(),
    };
    session.command = undefined;
  } else if (
    pending &&
    (session.revision !== pending.baseRevision ||
      session.fingerprint !== pending.baseFingerprint)
  ) {
    session.result = {
      commandId: pending.id,
      status: "failed",
      message: "The editor changed before the edit arrived.",
      at: Date.now(),
    };
    session.command = undefined;
  }
  return {
    command: session.command?.ready ? session.command : null,
    fingerprint: session.fingerprint,
  };
}

/** The newest active editor session holding this feature video, or null. */
export function activeFeatureVideoSession(slug: string): string | null {
  const now = Date.now();
  let newest: Session | undefined;
  for (const session of sessions.values())
    if (
      session.featureSlug === slug &&
      now - session.seenAt < ACTIVE_MS &&
      (!newest || session.seenAt > newest.seenAt)
    )
      newest = session;
  return newest?.id ?? null;
}

export async function queuePostProjectEdit(
  input: {
    sessionId: string;
    baseRevision: number;
    baseFingerprint: string;
    project: unknown;
  },
  directory = backupDir
) {
  const session = sessions.get(input.sessionId);
  if (!session || Date.now() - session.seenAt >= ACTIVE_MS)
    throw new Error("Editor session is not active.");
  if (session.command) throw new Error("An edit is already pending.");
  if (
    session.revision !== input.baseRevision ||
    session.fingerprint !== input.baseFingerprint
  )
    throw new Error("The editor changed since this manifest was read.");
  const parsed = PostProjectSchema.safeParse(input.project);
  if (!parsed.success) throw new Error("Invalid Post Studio manifest.");
  const next = parsed.data;
  if (next.sequenceId !== session.snapshot.sequenceId)
    throw new Error("Wrong sequence.");
  const locked = bridgeLockedChange(session.snapshot, next);
  if (locked)
    throw new Error(`${locked} cannot be changed through the manifest bridge.`);
  const command: Command = {
    id: randomUUID(),
    ready: false,
    baseRevision: session.revision,
    baseFingerprint: session.fingerprint,
    baseSnapshot: session.snapshot,
    project: next,
  };
  // Reserve before waiting on the disk, so concurrent applies cannot pass the same base.
  session.command = command;
  try {
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, `${Date.now()}-${command.id}.json`);
    await fs.writeFile(
      file,
      JSON.stringify({
        commandId: command.id,
        sessionId: session.id,
        snapshot: command.baseSnapshot,
      }),
      { flag: "wx" }
    );
  } catch (cause) {
    if (session.command === command) session.command = undefined;
    throw cause;
  }
  if (
    session.command !== command ||
    session.revision !== command.baseRevision ||
    session.fingerprint !== command.baseFingerprint
  ) {
    if (session.command === command) {
      session.command = undefined;
      session.result = {
        commandId: command.id,
        status: "failed",
        message: "The editor changed before the edit arrived.",
        at: Date.now(),
      };
    }
    throw new Error("The editor changed while the backup was written.");
  }
  command.ready = true;
  session.result = undefined;
  return { commandId: command.id, status: "pending" as const };
}

/**
 * Applies named edits to the editor's current project and queues the result,
 * so a script never has to read, rewrite and echo back the whole manifest.
 * Returns the edit's command id plus a one-line change summary.
 */
export async function queuePostProjectOps(
  input: { sessionId: string; ops: PostProjectOp[] },
  directory = backupDir
) {
  const session = sessions.get(input.sessionId);
  if (!session || Date.now() - session.seenAt >= ACTIVE_MS)
    throw new Error("Editor session is not active.");
  const next = applyPostProjectOps(session.snapshot, input.ops, {
    now: Date.now(),
  });
  if (fingerprint(next) === session.fingerprint)
    return { commandId: null, status: "unchanged" as const };
  return queuePostProjectEdit(
    {
      sessionId: session.id,
      baseRevision: session.revision,
      baseFingerprint: session.fingerprint,
      project: next,
    },
    directory
  );
}

export function postProjectEditStatus(sessionId: string, commandId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.command?.id === commandId) return { status: "pending" as const };
  if (session.result?.commandId === commandId) return { ...session.result };
  return null;
}
