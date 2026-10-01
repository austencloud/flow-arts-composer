import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

const ENDPOINT = "/api/dev/post-project";

/** Local editor handshake. The server owns queueing; editor state owns applying. */
export function startPostProjectDevBridge(editor: {
  readonly snapshot: PostProject;
  readonly saveRevision: number;
  replaceManifestFromDev(
    project: unknown,
    base: PostProject
  ): { ok: boolean; error?: string };
}): () => void {
  const sessionId = crypto.randomUUID();
  const abort = new AbortController();
  const seen = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sentSnapshot = "";
  let result:
    | { commandId: string; status: "completed" | "failed"; message: string }
    | undefined;

  async function poll() {
    if (stopped) return;
    try {
      const snapshot = editor.snapshot;
      const encoded = JSON.stringify(snapshot);
      const includeSnapshot = encoded !== sentSnapshot;
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId,
          revision: editor.saveRevision,
          ...(includeSnapshot ? { snapshot } : {}),
          ...(result ? { result } : {}),
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
      };
      if (!data || !("command" in data))
        throw new Error("Invalid bridge response");
      sentSnapshot = encoded;
      result = undefined;
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
