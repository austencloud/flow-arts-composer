/**
 * Classified, auto-retrying, cancellable sequence resolution for the Choreo
 * sheet. Private library first, public gallery fallback, with the auth-settled
 * gate in front so a restored draft never races Firebase session restoration
 * (the six-red-rows bug). Pure DI — the view wires the real loaders.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { LibraryError } from "#lib/shared/library/domain/library-error.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";

export type ResolveFailure =
  | "transient"
  | "permission"
  | "missing"
  | "unreadable";

export interface ResolveOutcome {
  sequence: SequenceData | null;
  source: "private" | "public" | null;
  failure: ResolveFailure | null;
  attempts: number;
}

export interface SheetSequenceResolverDeps {
  /** Private library read. Throws LibraryError / FirestoreError; null = confirmed not in library. */
  loadPrivate: (id: string) => Promise<SequenceData | null>;
  /** Public gallery read. null = confirmed not public; throws only for network-class failures. */
  loadPublic: (id: string) => Promise<SequenceData | null>;
  awaitAuthSettled: () => Promise<void>;
  /** Injectable for fake timers in tests. */
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface SheetSequenceResolver {
  resolve: (id: string, signal: AbortSignal) => Promise<ResolveOutcome>;
}

/** Error classes: unauthorized = genuinely no identity (post-settle) → public-only,
 *  permission = never present as deleted, unreadable = the document is there and
 *  broken (retrying cannot fix it), transient = retry. Unknowns fail open to
 *  transient — never toward "deleted". */
export function classifyResolveError(
  error: unknown
): "unauthorized" | "permission" | "unreadable" | "transient" {
  if (error instanceof LibraryError && error.code === "UNAUTHORIZED")
    return "unauthorized";
  if (error instanceof LibraryError && error.code === "INVALID_DATA")
    return "unreadable";
  if (isPermissionDeniedError(error)) return "permission";
  return "transient";
}

/** The private tier could not be consulted at all. Thrown so the backoff ladder
 *  runs: on a cold load this is the auth/Firestore connection still coming up,
 *  and the next attempt succeeds. Only if the whole ladder is spent does it
 *  become a reported failure — and never "missing", because nothing ever
 *  actually looked. */
class PrivateTierUnavailable extends Error {
  constructor(readonly kind: "unauthorized" | "permission") {
    super(`private tier unavailable (${kind})`);
    this.name = "PrivateTierUnavailable";
  }
}

/** The document was found but produced no steps. Retryable: hydration depends on
 *  pictograph data that can be momentarily absent (an HMR remount drops it), and
 *  the next attempt normally succeeds. Never "missing" — the row exists. */
class StepsUnavailable extends Error {
  constructor() {
    super("sequence document has no steps");
    this.name = "StepsUnavailable";
  }
}

const BACKOFF_MS = [500, 1500, 4000] as const;

function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

function abortError(): DOMException {
  return new DOMException("Sequence resolution aborted", "AbortError");
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function hasSteps(seq: SequenceData | null): seq is SequenceData {
  return seq != null && (seq.steps?.length ?? 0) > 0;
}

export function createSheetSequenceResolver(
  deps: SheetSequenceResolverDeps
): SheetSequenceResolver {
  const delay = deps.delay ?? defaultDelay;
  const inFlight = new Map<string, Promise<ResolveOutcome>>();

  /** One private→public pass. Throws for transient failures (caller retries). */
  async function attempt(
    id: string
  ): Promise<
    | { sequence: SequenceData; source: "private" | "public" }
    | { terminal: "missing" | "unreadable" }
  > {
    // Whether the private tier gave an ANSWER. A read that threw — no identity
    // yet, permission denied, network — answered nothing, and a sheet row must
    // never be called missing on the strength of a question nobody asked.
    let privateAnswered = false;
    let blocked: "unauthorized" | "permission" | null = null;
    // The document came back, but with no steps. It EXISTS — hydration just
    // didn't produce a sequence (the compositional hydrator needs pictograph
    // data that an HMR remount momentarily drops). Absence is the one thing
    // this cannot mean.
    let foundEmpty = false;
    try {
      const own = await deps.loadPrivate(id);
      privateAnswered = true;
      if (hasSteps(own)) return { sequence: own, source: "private" };
      if (own) foundEmpty = true;
    } catch (error) {
      const cls = classifyResolveError(error);
      if (cls === "transient") throw error;
      if (cls === "unreadable") return { terminal: "unreadable" };
      blocked = cls;
    }

    const pub = await deps.loadPublic(id);
    if (hasSteps(pub)) return { sequence: pub, source: "public" };
    if (pub) foundEmpty = true;

    // A document that exists but yielded no steps is retried, not buried: the
    // hydrator usually succeeds on the next pass once its data is back.
    if (foundEmpty) throw new StepsUnavailable();

    // Public didn't have it either. Only now is "missing" honest — and only if
    // the private tier actually looked.
    if (privateAnswered) return { terminal: "missing" };
    throw new PrivateTierUnavailable(blocked ?? "permission");
  }

  async function resolve(
    id: string,
    signal: AbortSignal
  ): Promise<ResolveOutcome> {
    const existing = inFlight.get(id);
    if (existing) return existing;

    const run = (async (): Promise<ResolveOutcome> => {
      await deps.awaitAuthSettled();
      let attempts = 0;
      for (;;) {
        if (signal.aborted) throw abortError();
        attempts++;
        try {
          const result = await attempt(id);
          if ("sequence" in result) {
            return {
              sequence: result.sequence,
              source: result.source,
              failure: null,
              attempts,
            };
          }
          return {
            sequence: null,
            source: null,
            failure: result.terminal,
            attempts,
          };
        } catch (error) {
          if (signal.aborted) throw abortError();
          const backoff = BACKOFF_MS[attempts - 1];
          if (backoff === undefined) {
            // Ladder spent. A private tier that never opened reports as a
            // permission problem; a document that never yielded steps reports as
            // unreadable. Neither is a deleted sequence.
            const failure: ResolveFailure =
              error instanceof PrivateTierUnavailable
                ? "permission"
                : error instanceof StepsUnavailable
                  ? "unreadable"
                  : "transient";
            return { sequence: null, source: null, failure, attempts };
          }
          await delay(jitter(backoff), signal);
        }
      }
    })();

    const tracked = run.finally(() => inFlight.delete(id));
    inFlight.set(id, tracked);
    return tracked;
  }

  return { resolve };
}
