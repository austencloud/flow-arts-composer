import { auth } from "$lib/shared/auth/firebase";
import { authedFetch } from "$lib/shared/auth/services/authed-fetch";
import {
  PHYSICAL_CARD_SCHEMA_VERSION,
  isPhysicalCardId,
  type CardScanIngestResponse,
} from "../domain/physical-card";

export interface CardScanInput {
  shortCode: string;
  physicalCardId: string | null;
  deviceId: string;
}

/** The ingest endpoint's refusal, with its machine-readable reason. */
export class CardScanIngestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = "CardScanIngestError";
  }
}

export type ScanPidState = "valid" | "malformed" | "absent";

/**
 * The serialized-card identity a scanned URL carries in `?pid=`.
 *
 * A malformed value is dropped and the scan records as a legacy scan. Sent
 * as-is, it fails the endpoint's pattern and the whole scan is rejected.
 */
export function readScanPhysicalCardId(searchParams: URLSearchParams): {
  physicalCardId: string | null;
  pidState: ScanPidState;
} {
  const value = searchParams.get("pid")?.trim() ?? "";
  if (!value) return { physicalCardId: null, pidState: "absent" };
  return isPhysicalCardId(value)
    ? { physicalCardId: value, pidState: "valid" }
    : { physicalCardId: null, pidState: "malformed" };
}

export async function recordCardScan(
  input: CardScanInput
): Promise<CardScanIngestResponse> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      ...input,
    }),
  };
  const response = auth.currentUser
    ? await authedFetch("/api/physical-cards/scan", init)
    : await fetch("/api/physical-cards/scan", init);

  if (!response.ok) {
    let message = `Scan ingestion failed (${response.status})`;
    let code: string | null = null;
    try {
      const body = (await response.json()) as {
        error?: unknown;
        code?: unknown;
      };
      if (typeof body.error === "string") message = body.error;
      if (typeof body.code === "string") code = body.code;
    } catch {
      // Keep the stable status-based fallback.
    }
    throw new CardScanIngestError(message, response.status, code);
  }

  return (await response.json()) as CardScanIngestResponse;
}

export type CardScanIngestOutcome =
  | {
      outcome: "recorded" | "duplicate";
      scanKind: CardScanIngestResponse["scanKind"];
    }
  | { outcome: "failed"; status: number | null; code: string | null };

/** How long a scan waits for Firebase Auth before recording anonymously. */
export const SCAN_AUTH_WAIT_MS = 1_500;

/**
 * Records one physical scan without holding up the viewer.
 *
 * It waits briefly for Firebase Auth so a signed-in scanner is attributed,
 * then posts the scan. Callers start it and navigate on without awaiting it:
 * when `/q` awaited that auth wait before its handoff, every first scan sat on
 * the loading screen for up to 1.5 s more. Never rejects.
 */
export async function recordCardScanAfterAuth(
  input: CardScanInput,
  waitForAuth: () => Promise<unknown>,
  record: (
    input: CardScanInput
  ) => Promise<CardScanIngestResponse> = recordCardScan,
  authWaitMs: number = SCAN_AUTH_WAIT_MS
): Promise<CardScanIngestOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      waitForAuth(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, authWaitMs);
      }),
    ]);
  } catch {
    // The scan stays anonymous when auth initialization is unavailable.
  } finally {
    clearTimeout(timer);
  }

  try {
    const response = await record(input);
    return {
      outcome: response.duplicate ? "duplicate" : "recorded",
      scanKind: response.scanKind,
    };
  } catch (error) {
    console.error("[q-scan] physical scan ingestion failed:", error);
    return error instanceof CardScanIngestError
      ? { outcome: "failed", status: error.status, code: error.code }
      : { outcome: "failed", status: null, code: null };
  }
}
