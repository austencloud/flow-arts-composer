/**
 * Records a printed-card scan that Android opened in the installed app.
 *
 * With the app installed, Android App Links hand `https://tka.run/{code}` and
 * `https://tkaflowarts.com/q/{code}` straight to the app, so `/q` never runs
 * and never records the scan. This is the app's side of the same fact: the
 * same card link, the same dedupe window, and the same ingest endpoint and
 * client as `/q`, posted to the site because the app's bundle is local.
 *
 * The caller starts it without awaiting it, so the viewer never waits on the
 * network. A refused or failed request resolves as a `failed` outcome and is
 * only logged; nothing is shown to the person scanning.
 */

import { getDeviceId } from "$lib/shared/foundation/services/device-id";
import { scanLinkCode } from "$lib/shared/platform/services/native-deep-link-target";
import { isScannableShortCode } from "../domain/physical-card";
import { claimScanVisit } from "../utils/scan-detection";
import {
  NATIVE_APP_SCAN_TRANSPORT,
  readScanPhysicalCardId,
  recordCardScan,
  recordCardScanAfterAuth,
  type CardScanIngestOutcome,
  type ScanPidState,
} from "./card-scan-ingest";

export interface CardScanLink {
  /** Exactly as printed. Legacy mixed-case codes are distinct documents. */
  shortCode: string;
  physicalCardId: string | null;
  pidState: ScanPidState;
}

/**
 * The scan a link carries, or null when the link is not a printed-card scan:
 * an app route, the `/store/open` handoff after a browser scan, an inline
 * `s~` payload, or the embedded `?demo=1` preview. `/q` skips the same cases.
 */
export function readCardScanLink(url: string): CardScanLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const shortCode = scanLinkCode(parsed);
  if (!shortCode || !isScannableShortCode(shortCode)) return null;
  if (parsed.searchParams.get("demo") === "1") return null;

  const { physicalCardId, pidState } = readScanPhysicalCardId(
    parsed.searchParams
  );
  return { shortCode, physicalCardId, pidState };
}

export interface NativeCardScanDeps {
  deviceId: () => string;
  waitForAuth: () => Promise<unknown>;
}

const defaultDeps: NativeCardScanDeps = {
  deviceId: getDeviceId,
  waitForAuth: async () => {
    const { awaitAuthSettled } =
      await import("$lib/shared/auth/state/auth-state.svelte");
    await awaitAuthSettled();
  },
};

/**
 * Records the scan behind a link the app was opened with. Returns null when
 * the link is not a scan or the same card was already recorded moments ago.
 */
export async function recordNativeCardScan(
  url: string,
  deps: NativeCardScanDeps = defaultDeps
): Promise<CardScanIngestOutcome | null> {
  const scan = readCardScanLink(url);
  if (!scan) return null;
  if (!claimScanVisit(scan.shortCode, scan.physicalCardId)) return null;

  return recordCardScanAfterAuth(
    {
      shortCode: scan.shortCode,
      physicalCardId: scan.physicalCardId,
      deviceId: deps.deviceId(),
    },
    deps.waitForAuth,
    (input) => recordCardScan(input, NATIVE_APP_SCAN_TRANSPORT)
  );
}
