import type { SavedFeatureExport } from "#lib/shared/media-composition/domain/feature-video-export.js";
import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";

const ENDPOINT = "/api/dev/post-project";

/** How an editor renders for `post-project.mjs render`. */
export interface PostProjectDevRender {
  /** Renders the post into its feature video's exports/ folder. */
  run(name?: string): Promise<SavedFeatureExport>;
  /** The running render's phase and percent, or null before it starts. */
  progress(): { phase: string; percent: number } | null;
}

export interface PostProjectDevBridgeOptions {
  /** The feature video this editor has open, so the CLI edits through it. */
  featureSlug?: string;
  /** Called after each heartbeat with that project's revision on disk. */
  onFeatureRevision?: (revision: number) => void;
  /** Lets the CLI render through this editor. */
  render?: PostProjectDevRender;
}

type RenderReport =
  | { id: string; state: "rendering"; phase: string; percent: number }
  | ({ id: string; state: "completed"; message: string } & SavedFeatureExport)
  | { id: string; state: "failed"; message: string };

/** Local editor handshake. The server owns queueing; editor state owns applying. */
export function startPostProjectDevBridge(
  editor: {
    readonly snapshot: PostProject;
    readonly saveRevision: number;
    replaceManifestFromDev(
      project: unknown,
      base: PostProject
    ): { ok: boolean; error?: string };
  },
  options: PostProjectDevBridgeOptions = {}
): () => void {
  const sessionId = crypto.randomUUID();
  const abort = new AbortController();
  const seen = new Set<string>();
  /** Renders already started here; the server hands one out more than once. */
  const seenRenders = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sentSnapshot = "";
  let result:
    | { commandId: string; status: "completed" | "failed"; message: string }
    | undefined;
  /** The render running now. */
  let running: string | null = null;
  /** How the last render ended, sent until a heartbeat carries it. */
  let finished: RenderReport | null = null;

  function renderReport(): RenderReport | null {
    if (!running) return finished;
    const progress = options.render?.progress() ?? null;
    return {
      id: running,
      state: "rendering",
      phase: progress?.phase ?? "preparing",
      percent: progress?.percent ?? 0,
    };
  }

  function startRender(id: string, name: string | undefined): void {
    seenRenders.add(id);
    const render = options.render;
    if (!render) {
      finished = { id, state: "failed", message: "This editor cannot render." };
      return;
    }
    running = id;
    void render
      .run(name)
      .then(
        (saved): RenderReport => ({
          id,
          state: "completed",
          message: `Saved ${saved.file}.`,
          file: saved.file,
          path: saved.path,
          bytes: saved.bytes,
        }),
        (cause: unknown): RenderReport => ({
          id,
          state: "failed",
          message:
            cause instanceof Error ? cause.message : "The render failed.",
        })
      )
      .then((report) => {
        finished = report;
        running = null;
      });
  }

  async function poll() {
    if (stopped) return;
    try {
      const snapshot = editor.snapshot;
      const encoded = JSON.stringify(snapshot);
      const includeSnapshot = encoded !== sentSnapshot;
      const report = renderReport();
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId,
          revision: editor.saveRevision,
          ...(options.featureSlug ? { featureSlug: options.featureSlug } : {}),
          ...(includeSnapshot ? { snapshot } : {}),
          ...(result ? { result } : {}),
          ...(report ? { render: report } : {}),
        }),
        signal: abort.signal,
      });
      if (!response.ok)
        throw new Error(`Bridge heartbeat failed: ${response.status}`);
      const data = (await response.json()) as {
        command: {
          id: string;
          baseSnapshot: PostProject;
          project: PostProject;
        } | null;
        featureRevision?: number | null;
        render?: { id?: unknown; name?: unknown };
      };
      if (!data || !("command" in data))
        throw new Error("Invalid bridge response");
      sentSnapshot = encoded;
      result = undefined;
      // The server has heard how the render ended; stop sending it.
      if (report && report === finished) finished = null;
      const command = data.command;
      if (command && !seen.has(command.id)) {
        seen.add(command.id);
        let applied: { ok: boolean; error?: string };
        try {
          applied = editor.replaceManifestFromDev(
            command.project,
            command.baseSnapshot
          );
        } catch (cause) {
          applied = {
            ok: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Editor rejected the edit.",
          };
        }
        result = {
          commandId: command.id,
          status: applied.ok ? "completed" : "failed",
          message: applied.ok
            ? "Applied in editor."
            : (applied.error ?? "Editor rejected the edit."),
        };
      }
      const job = data.render;
      if (
        job &&
        typeof job.id === "string" &&
        !running &&
        !seenRenders.has(job.id)
      )
        startRender(
          job.id,
          typeof job.name === "string" ? job.name : undefined
        );
      if (typeof data.featureRevision === "number")
        options.onFeatureRevision?.(data.featureRevision);
    } catch {
      // A stopped or temporarily unavailable dev server must not affect editing.
      sentSnapshot = "";
    } finally {
      if (!stopped) timer = setTimeout(poll, 1000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    abort.abort();
  };
}
