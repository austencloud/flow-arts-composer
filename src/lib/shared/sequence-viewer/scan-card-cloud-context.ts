/**
 * Scoped flag: when set on a scan-origin /sequence host, descendant
 * ChoreoCards probe the canonical cloud cache for scan-origin cards. A shop
 * demo may render a missing cell locally; a real scanner stays cloud-only.
 * Unset everywhere else (browse gallery, drawer viewer) => probeCloud stays off.
 */
import { getContext, setContext } from "svelte";

const KEY = Symbol("scan-card-cloud-probe");

export interface ScanCardCloudPolicy {
  probeCloud: boolean;
  cloudOnly: boolean;
}

export function resolveScanCardCloudPolicy(
  scanOrigin: boolean,
  isDemo: boolean
): ScanCardCloudPolicy {
  return {
    probeCloud: scanOrigin,
    cloudOnly: scanOrigin && !isDemo,
  };
}

/**
 * The cloud cache only holds the printed card, which shows both hands. When the
 * scanner hides a hand, no published cell matches, so those cells must render
 * locally instead of failing. Hand-path records embed their motion data and
 * always render locally.
 */
export function scanCellsAreCloudOnly(
  policy: ScanCardCloudPolicy,
  view: {
    handPathMode: boolean;
    showLeftMotion: boolean;
    showRightMotion: boolean;
  }
): boolean {
  return (
    policy.cloudOnly &&
    !view.handPathMode &&
    view.showLeftMotion &&
    view.showRightMotion
  );
}

export function setScanCardCloudProbe(enabled: boolean, isDemo = false): void {
  setContext(KEY, resolveScanCardCloudPolicy(enabled, isDemo));
}

export function getScanCardCloudPolicy(): ScanCardCloudPolicy {
  return (
    getContext<ScanCardCloudPolicy>(KEY) ??
    resolveScanCardCloudPolicy(false, false)
  );
}

export function getScanCardCloudProbe(): boolean {
  return getScanCardCloudPolicy().probeCloud;
}
