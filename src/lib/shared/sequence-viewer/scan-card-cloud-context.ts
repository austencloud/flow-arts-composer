/**
 * Scoped flag: when set on a scan-origin /sequence host, descendant
 * ChoreoCards probe the canonical cloud cache before rasterizing. A cell the
 * cloud lacks still renders locally, so a card printed for a prop the QR warm
 * never covered shows its pictographs instead of error tiles.
 * Unset everywhere else (browse gallery, drawer viewer) => probeCloud stays off.
 */
import { getContext, setContext } from "svelte";

const KEY = Symbol("scan-card-cloud-probe");

export function setScanCardCloudProbe(enabled: boolean): void {
  setContext(KEY, enabled);
}

export function getScanCardCloudProbe(): boolean {
  return getContext<boolean>(KEY) ?? false;
}
