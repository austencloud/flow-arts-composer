import { dev } from "$app/environment";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { parsePhoneReviewClient } from "$lib/shared/dev/phone-review-interactions";
import { updatePhoneReviewInteractionState } from "$lib/server/phone-review-interaction-state";

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) error(403, "Forbidden");
}

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) error(404, "Not found");
  requireSameOrigin(request);

  if (Number(request.headers.get("content-length") ?? 0) > 20_000)
    error(413, "Review report is too large");
  const reader = request.body?.getReader();
  if (!reader) error(400, "Invalid review report");
  const decoder = new TextDecoder();
  let encodedBody = "";
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > 20_000) {
        void reader.cancel();
        error(413, "Review report is too large");
      }
      encodedBody += decoder.decode(value, { stream: true });
    }
    encodedBody += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(encodedBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      error(400, "Invalid review report");
    body = parsed as Record<string, unknown>;
  } catch {
    error(400, "Invalid review report");
  }
  const client = parsePhoneReviewClient(body.client);
  if (!client) error(400, "Invalid review client");

  await updatePhoneReviewInteractionState((state) => {
    state.clients = [
      ...state.clients.filter((known) => known.id !== client.id),
      client,
    ].slice(-20);
    const result = body.result;
    if (result && typeof result === "object") {
      const candidate = result as Record<string, unknown>;
      const command = state.commands.find(
        (queued) =>
          queued.id === candidate.commandId && queued.clientId === client.id
      );
      if (
        command &&
        (candidate.status === "completed" || candidate.status === "failed") &&
        typeof candidate.message === "string" &&
        candidate.message.length > 0 &&
        candidate.message.length <= 160
      )
        command.result = {
          status: candidate.status,
          message: candidate.message,
          completedAt: new Date().toISOString(),
        };
    }
  });
  return json({ ok: true });
};
