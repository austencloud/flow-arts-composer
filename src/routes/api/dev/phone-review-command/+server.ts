import { dev } from "$app/env";
import { error, type RequestHandler } from "@sveltejs/kit";
import { commandForClient } from "#lib/shared/dev/phone-review-interactions.js";
import {
  updatePhoneReviewInteractionState,
} from "#lib/server/phone-review-interaction-state.js";

function safeParameter(value: string | null, max: number): value is string {
  return !!value && value.length <= max;
}

export const GET: RequestHandler = async ({ url }) => {
  if (!dev) error(404, "Not found");
  const clientId = url.searchParams.get("clientId");
  const route = url.searchParams.get("route");
  if (!safeParameter(clientId, 80) || !safeParameter(route, 300) || !route.startsWith("/") || route.startsWith("//") || route.includes("#")) {
    error(400, "Invalid review command request");
  }
  const command = await updatePhoneReviewInteractionState((state) => {
    const command = commandForClient(state, clientId, route);
    if (command) command.deliveredAt = new Date().toISOString();
    return command;
  });
  if (!command) return Response.json({ command: null });
  return Response.json({ command });
};
