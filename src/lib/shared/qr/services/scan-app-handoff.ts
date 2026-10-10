import {
  buildAppBridgePath,
  resolveEscapeTarget,
} from "#lib/shared/auth/services/escape-target.js";

/**
 * The scan page is the first stop for a printed card. Its Open TKA action
 * carries the same card into the installed app without losing prop overrides,
 * the physical-card identity, or any attribution attached to the scan URL.
 */
export function buildScanAppHandoffPath(
  shortCode: string,
  scanSearchParams: URLSearchParams
): string {
  const viewerParams = new URLSearchParams(scanSearchParams);
  viewerParams.delete("demo");
  viewerParams.set("from", "scan");
  viewerParams.set("code", shortCode);
  viewerParams.set("v", shortCode);

  return buildAppBridgePath(`/browse/gallery?${viewerParams.toString()}`);
}

/**
 * Android gets a package-pinned intent so a same-site browser navigation
 * cannot swallow the app launch. Other browsers follow the bridge as a normal
 * web link and still reach the full viewer destination.
 */
export function buildScanAppHandoffHref(
  shortCode: string,
  scanSearchParams: URLSearchParams,
  options: { android: boolean; origin: string }
): string {
  const bridgePath = buildScanAppHandoffPath(shortCode, scanSearchParams);
  if (!options.android) return bridgePath;

  const target = resolveEscapeTarget({
    platform: "android",
    iosMajorVersion: null,
    appLaunched: true,
    currentUrl: new URL(bridgePath, options.origin).href,
  });
  return target.url ?? bridgePath;
}
