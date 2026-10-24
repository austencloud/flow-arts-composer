/**
 * Window error report
 *
 * Builds the telemetry record for an uncaught `error` event. PostHog's own
 * exception auto-capture already sees these, but minified errors such as
 * "e is not a function" have reached it with no stack frames, leaving
 * nothing to map back to source. This record keeps the script location
 * (file, line, column), the full stack and the route, so a source-mapped
 * build can name the function.
 */
import type { ShowErrorOptions } from "./error-models.js";

const STACK_LIMIT = 4000;

/** The fields of an ErrorEvent this report reads. */
export interface WindowErrorLike {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}

export function buildWindowErrorReport(
  event: WindowErrorLike,
  pathname: string
): ShowErrorOptions | null {
  const error = event.error instanceof Error ? event.error : undefined;
  const message = error?.message || event.message || "Unknown error";

  // Opaque cross-origin script errors carry no detail at all, and the
  // ResizeObserver loop warning is benign browser noise.
  if (message === "Script error." && !event.filename) return null;
  if (message.includes("ResizeObserver loop")) return null;

  const location = event.filename
    ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
    : null;

  return {
    message: `Uncaught error: ${message.slice(0, 200)}`,
    severity: "error",
    context: {
      module: "global",
      action: "window-error",
      additionalData: {
        url: pathname,
        location,
        errorName: error?.name ?? null,
        stack: error?.stack?.slice(0, STACK_LIMIT) ?? null,
      },
    },
    error,
  };
}
