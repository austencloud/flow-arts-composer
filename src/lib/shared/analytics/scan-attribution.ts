import { browser } from "$app/env";
import { captureEvent } from "./services/posthog";
import { removeCurrentUrlParams } from "#lib/shared/navigation/services/url-state.js";

const SCAN_SOURCE_CODE_KEY = "tka_scan_source_code";

export function detectAndCaptureScanEntry(): void {
  if (!browser) return;

  const url = new URL(window.location.href);
  const fromScan = url.searchParams.get("from");
  const code = url.searchParams.get("code");

  if (fromScan !== "scan" || !code) return;

  sessionStorage.setItem(SCAN_SOURCE_CODE_KEY, code);

  captureEvent("scan_app_opened", {
    short_code: code,
  });

  removeCurrentUrlParams(["from", "code"]);
}

export function getScanSourceCode(): string | null {
  if (!browser) return null;
  return sessionStorage.getItem(SCAN_SOURCE_CODE_KEY);
}
