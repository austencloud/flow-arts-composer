/**
 * One active export intent, one terminal outcome. Tokens make late async work
 * harmless after cancel, mode change, route teardown, or a newer attempt.
 */
export class ExportAttemptGuard {
  #nextToken = 0;
  #activeToken: number | null = null;

  begin(): number | null {
    if (this.#activeToken !== null) return null;
    this.#activeToken = ++this.#nextToken;
    return this.#activeToken;
  }

  get active(): boolean {
    return this.#activeToken !== null;
  }

  get token(): number | null {
    return this.#activeToken;
  }

  isActive(token: number): boolean {
    return this.#activeToken === token;
  }

  finish(token: number): boolean {
    if (!this.isActive(token)) return false;
    this.#activeToken = null;
    return true;
  }

  abandon(): number | null {
    const token = this.#activeToken;
    this.#activeToken = null;
    return token;
  }
}

/**
 * What an export start hands back. `false` means nothing started: the account
 * ask opened instead, the exporter was busy, or the controller wasn't ready.
 * `void` comes from callers that never report, and keeps the old behaviour.
 */
export type ExportStartResult = void | boolean | Promise<boolean | void>;

/**
 * Close an attempt whose start was refused, so the button goes back to rest
 * and nothing later reports it. Without this a guest's Export Video spun
 * forever behind the sign-up box, and closing the viewer then logged a second
 * export (the stale attempt being abandoned) with no tap. Resolves true when
 * it settled the attempt here.
 */
export async function settleRefusedExportStart(
  guard: ExportAttemptGuard,
  token: number,
  start: ExportStartResult,
  onRefused: () => void
): Promise<boolean> {
  let started: boolean | void;
  try {
    started = await start;
  } catch {
    started = false;
  }
  if (started !== false || !guard.isActive(token)) return false;
  onRefused();
  return true;
}
