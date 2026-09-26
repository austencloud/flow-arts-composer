/**
 * A serialized card's printed props, read back at scan time.
 *
 * Serialized QRs encode only `tka.run/{code}?pid={id}`. The card's prop pair
 * lives on `physicalCards/{id}`, which only the server can read. Cards printed
 * before that change still carry `bp`/`rp` in the URL, and those always win:
 * the record only fills a hand the URL does not name.
 */
import { parsePropsFromURL } from "$lib/shared/navigation/services/sequence-encoder";
import {
  isPhysicalCardId,
  isShortCode,
  readPhysicalCardPropType,
} from "../domain/physical-card";
import type { ScanPropCandidate } from "./scan-prop-resolver";

/** Public, read-only lookup of one card's props. Answers only code + pid. */
export const PHYSICAL_CARD_PROPS_PATH = "/api/physical-cards/props";

/**
 * The physical ID whose record a scan needs, or null. Null when the URL has no
 * valid `pid`, or already names both props (every card printed before props
 * moved to the record).
 */
export function physicalCardIdNeedingProps(
  shortCode: string,
  searchParams: URLSearchParams
): string | null {
  if (!isShortCode(shortCode)) return null;
  const physicalCardId = searchParams.get("pid")?.trim() ?? "";
  if (!isPhysicalCardId(physicalCardId)) return null;
  const urlProps = parsePropsFromURL(searchParams);
  return urlProps.leftPropType && urlProps.rightPropType
    ? null
    : physicalCardId;
}

/**
 * The prop candidate a physical card record contributes, shaped like the URL's
 * (`catDogMode` only when both hands are known). Null when it stores neither.
 */
export function physicalCardPropCandidate(
  leftValue: unknown,
  rightValue: unknown
): ScanPropCandidate | null {
  const leftPropType = readPhysicalCardPropType(leftValue);
  const rightPropType = readPhysicalCardPropType(rightValue);
  if (!leftPropType && !rightPropType) return null;
  return {
    ...(leftPropType && { leftPropType }),
    ...(rightPropType && { rightPropType }),
    ...(leftPropType &&
      rightPropType && { catDogMode: leftPropType !== rightPropType }),
  };
}

export function physicalCardPropsUrl(
  shortCode: string,
  physicalCardId: string,
  origin = ""
): string {
  const query = new URLSearchParams({ code: shortCode, pid: physicalCardId });
  return `${origin}${PHYSICAL_CARD_PROPS_PATH}?${query}`;
}

export interface FetchPhysicalCardPropsOptions {
  /** Empty for same-origin; the installed app passes the site's origin. */
  origin?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_500;

/**
 * Browser-side read of a card's props. Never rejects: a missing record, an
 * old server, or no connection resolves null and the viewer falls back to the
 * shortcode's props, exactly as a card without props does.
 */
export async function fetchPhysicalCardProps(
  shortCode: string,
  physicalCardId: string,
  options: FetchPhysicalCardPropsOptions = {}
): Promise<ScanPropCandidate | null> {
  const {
    origin = "",
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      physicalCardPropsUrl(shortCode, physicalCardId, origin),
      { signal: controller.signal, headers: { accept: "application/json" } }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      leftPropType?: unknown;
      rightPropType?: unknown;
    };
    return physicalCardPropCandidate(body?.leftPropType, body?.rightPropType);
  } catch (error) {
    console.warn("[physical-card-props] lookup failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
