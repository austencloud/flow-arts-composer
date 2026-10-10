import { env } from "cloudflare:workers";

/**
 * Sets the Worker bindings `workerEnv()` returns, replacing any set before.
 * Server code reads them from `cloudflare:workers` (stubbed in tests by
 * tests/setup/stubs/cloudflare-workers.ts) rather than `event.platform.env`,
 * so a test sets them here instead of on the request event. Call with no
 * argument to clear them.
 */
export function setWorkerEnv(values: Partial<Cloudflare.Env> = {}): void {
  // Cloudflare.Env names fixed bindings; tests clear and refill them by key.
  const target = env as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, values);
}

/**
 * A request carrying Cloudflare's request metadata, as Cloudflare delivers it
 * (`request.cf`).
 */
export function withCf(request: Request, cf: Record<string, unknown>): Request {
  return Object.assign(request, { cf });
}
