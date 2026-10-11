import { encodePropForURL } from "#lib/shared/navigation/services/sequence-encoder.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export interface ScanSequencePropFallback {
  leftPropType: PropType;
  rightPropType: PropType;
}

/**
 * Turn the physical-scan ingress into the one standalone viewer URL.
 *
 * The printed URL stays the attribution boundary. The destination keeps the
 * state needed to reconstruct what the card intended, but removes `v` because
 * `/sequence` is already a viewer and must not open the in-app drawer too.
 */
export function buildScanSequenceDestination(
  shortCode: string,
  scanSearchParams: URLSearchParams,
  propFallback?: ScanSequencePropFallback | null
): string {
  const viewerParams = new URLSearchParams(scanSearchParams);
  viewerParams.delete("v");
  viewerParams.set("from", "scan");
  viewerParams.set("code", shortCode);

  if (!viewerParams.has("bp") && propFallback?.leftPropType) {
    viewerParams.set("bp", encodePropForURL(propFallback.leftPropType));
  }
  if (!viewerParams.has("rp") && propFallback?.rightPropType) {
    viewerParams.set("rp", encodePropForURL(propFallback.rightPropType));
  }

  const query = viewerParams.toString();
  const route = `/sequence/${encodeURIComponent(shortCode)}`;
  return query ? `${route}?${query}` : route;
}

/** A sequence URL only inherits scan analytics when it came through `/q`. */
export function readScanSequenceCode(
  routeId: string,
  searchParams: URLSearchParams
): string | null {
  if (searchParams.get("from") !== "scan") return null;
  const code = searchParams.get("code");
  return code && code === routeId ? code : null;
}
