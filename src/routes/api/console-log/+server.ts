import type { RequestHandler } from "./$types";
import { dev } from "$app/env";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "#lib/server/security/rate-limiter.js";

/**
 * Sanitize log input to prevent log injection attacks.
 * Removes newlines, carriage returns, and ANSI escape sequences.
 */
function sanitizeLogInput(input: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiEscapeRegex = /\x1b\[[0-9;]*m/g;
  return input
    .replace(/[\r\n]/g, " ") // Replace newlines with spaces
    .replace(ansiEscapeRegex, "") // Remove ANSI escape sequences
    .slice(0, 1000); // Limit length to prevent log flooding
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // Never expose in production - returns 404 so the endpoint doesn't even appear to exist
  if (!dev) {
    return new Response(null, { status: 404 });
  }

  // Rate limit to prevent log flooding
  const clientIp = getClientAddress();
  const rateCheck = checkRateLimit(
    `console-log:${clientIp}`,
    RATE_LIMITS.GENERAL
  );
  if (!rateCheck.allowed) {
    return rateLimitResponse(rateCheck.resetAt);
  }

  try {
    const body = (await request.json()) as {
      level?: string;
      message?: string;
      timestamp?: string;
    };
    const { level, message, timestamp } = body;

    // Sanitize inputs to prevent log injection
    const safeLevel = sanitizeLogInput(level ?? "LOG");
    const safeMessage = sanitizeLogInput(message ?? "");
    const safeTimestamp = sanitizeLogInput(timestamp ?? "");

    // Format the log message for the server console
    const formattedMessage = `[BROWSER-${safeLevel}] ${safeTimestamp} ${safeMessage}`;

    // Output to server console based on level
    switch (level) {
      case "ERROR":
        console.error(formattedMessage);
        break;
      case "WARN":
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
        break;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[SERVER] Failed to log browser message:", error);
    return Response.json({ success: false }, { status: 500 });
  }
};
