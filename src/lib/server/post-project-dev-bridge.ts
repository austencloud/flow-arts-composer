import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { isFeatureVideoSlug } from "$lib/shared/media-composition/domain/feature-video";
import {
  FEATURE_EXPORT_NAME_RULE,
  isFeatureExportName,
  isSavedFeatureExport,
  type SavedFeatureExport,
} from "$lib/shared/media-composition/domain/feature-video-export";
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
  /** The last render the CLI asked this editor for. */
  render?: RenderJob;
};

/** A render the CLI asked an editor for, as the bridge last heard of it. */
export interface RenderJob {
  id: string;
  /** The file name the CLI asked for; without one the editor picks it. */
  name?: string;
  state: "queued" | "rendering" | "completed" | "failed";
  /** The exporter's phase while it runs, like "encoding". */
  phase: string | null;
  percent: number;
  message: string;
  /** Where the render landed, once it completed. */
  file?: string;
  path?: string;
  bytes?: number;
  queuedAt: number;
  updatedAt: number;
}

/** What an editor's heartbeat says about the render it was handed. */
export interface PostProjectRenderReport {
  id: string;
  state: "rendering" | "completed" | "failed";
  phase?: string;
  percent?: number;
  message?: string;
  file?: string;
  path?: string;
  bytes?: number;
}

const sessions = new Map<string, Session>();
const ACTIVE_MS = 10_000;
const MAX_SESSIONS = 12;
/** An editor starts a render on the heartbeat after it is queued. */
const RENDER_START_MS = 30_000;
/** A render whose editor has sent nothing for this long has stopped. */
const RENDER_QUIET_MS = 60_000;
const RENDER_MESSAGE_LIMIT = 300;
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
  render?: PostProjectRenderReport;
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
  applyRenderReport(session, input.render);
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
  settleRender(session);
  const job = session.render;
  return {
    command: session.command?.ready ? session.command : null,
    fingerprint: session.fingerprint,
    // Handed out until the editor reports that the render started.
    ...(job?.state === "queued"
      ? { render: { id: job.id, ...(job.name ? { name: job.name } : {}) } }
      : {}),
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
  if (renderBusy(session))
    throw new Error("The editor is rendering. Try again when it finishes.");
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

/**
 * Asks a feature video's editor to render into its exports/ folder. The
 * editor's next heartbeat starts the render and later ones report on it;
 * postProjectRenderStatus answers with what they said.
 */
export function queuePostProjectRender(input: {
  sessionId: string;
  name?: string;
}) {
  const session = sessions.get(input.sessionId);
  if (!session || Date.now() - session.seenAt >= ACTIVE_MS)
    throw new Error("Editor session is not active.");
  if (!session.featureSlug)
    throw new Error("Only a feature video's editor renders to its folder.");
  if (input.name !== undefined && !isFeatureExportName(input.name))
    throw new Error(FEATURE_EXPORT_NAME_RULE);
  if (renderBusy(session))
    throw new Error("A render is already running in this editor.");
  if (session.command)
    throw new Error("An edit is pending. Try again when it finishes.");
  const now = Date.now();
  const job: RenderJob = {
    id: randomUUID(),
    ...(input.name !== undefined ? { name: input.name } : {}),
    state: "queued",
    phase: null,
    percent: 0,
    message: "Waiting for the editor to start the render.",
    queuedAt: now,
    updatedAt: now,
  };
  session.render = job;
  return { renderId: job.id, state: "queued" as const };
}

/** What the editor last said about a render, or null for an unknown one. */
export function postProjectRenderStatus(sessionId: string, renderId: string) {
  const session = sessions.get(sessionId);
  if (!session?.render || session.render.id !== renderId) return null;
  settleRender(session);
  return { ...session.render };
}

/**
 * A heartbeat's render report, checked. Undefined when the heartbeat has none
 * or one the bridge cannot read; a completed report must name the export.
 */
export function readRenderReport(
  value: unknown
): PostProjectRenderReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { id, state, phase, percent, message } = value as Record<
    string,
    unknown
  >;
  if (
    typeof id !== "string" ||
    (state !== "rendering" && state !== "completed" && state !== "failed")
  )
    return undefined;
  let saved: SavedFeatureExport | undefined;
  if (state === "completed") {
    if (!isSavedFeatureExport(value)) return undefined;
    saved = { file: value.file, path: value.path, bytes: value.bytes };
  }
  return {
    id,
    state,
    ...(typeof phase === "string" ? { phase: phase.slice(0, 40) } : {}),
    ...(typeof percent === "number" && Number.isFinite(percent)
      ? { percent: Math.min(100, Math.max(0, percent)) }
      : {}),
    ...(typeof message === "string"
      ? { message: message.slice(0, RENDER_MESSAGE_LIMIT) }
      : {}),
    ...saved,
  };
}

/** Takes the editor's report on the render it was handed, while it runs. */
function applyRenderReport(
  session: Session,
  report: PostProjectRenderReport | undefined
): void {
  const job = session.render;
  if (!report || !job || report.id !== job.id) return;
  if (job.state !== "queued" && job.state !== "rendering") return;
  job.state = report.state;
  job.phase = report.phase ?? null;
  job.percent =
    report.state === "completed" ? 100 : (report.percent ?? job.percent);
  if (report.state === "rendering") job.message = "";
  else
    job.message =
      report.message ?? (report.state === "failed" ? "The render failed." : "");
  if (report.state === "completed") {
    job.file = report.file;
    job.path = report.path;
    job.bytes = report.bytes;
  }
  job.updatedAt = session.seenAt;
}

function failRender(job: RenderJob, message: string, now: number): void {
  job.state = "failed";
  job.message = message;
  job.updatedAt = now;
}

/** Fails a render its editor dropped: never started, or gone silent. */
function settleRender(session: Session, now = Date.now()): void {
  const job = session.render;
  if (job?.state === "queued" && now - job.queuedAt > RENDER_START_MS)
    failRender(
      job,
      "The editor did not start the render. Reload its tab and try again.",
      now
    );
  else if (job?.state === "rendering" && now - session.seenAt > RENDER_QUIET_MS)
    failRender(job, "The editor closed before the render finished.", now);
}

/** True while this editor has a render queued or running. */
function renderBusy(session: Session): boolean {
  settleRender(session);
  const state = session.render?.state;
  return state === "queued" || state === "rendering";
}
