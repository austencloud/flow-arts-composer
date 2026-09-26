import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getFirestoreRest } from "$lib/server/firestore/firestore-rest";
import { readPhysicalCardProps } from "$lib/server/physical-cards/physical-card-props";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import {
  isPhysicalCardId,
  isShortCode,
} from "$lib/shared/qr/domain/physical-card";

/**
 * GET /api/physical-cards/props?code={code}&pid={id}
 *
 * The one public projection of a physical card record: the prop pair printed
 * on it. The installed app needs it because a serialized QR no longer carries
 * `bp`/`rp`, and `physicalCards` is closed to browsers. Answers only when the
 * card belongs to that code, and returns nothing else from the record.
 *
 * `*` CORS is deliberate: the app calls from its own origin, the request is a
 * credential-free simple GET, and the answer is what the card shows anyone
 * holding it.
 */
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" } as const;

function failure(error: string, code: string, status: number): Response {
  return json(
    { error, code },
    { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}

export const GET: RequestHandler = async (event) => {
  const blocked = await withRateLimit(event, RATE_LIMITS.GENERAL, "ip");
  if (blocked) return blocked;

  const shortCode = event.url.searchParams.get("code") ?? "";
  const physicalCardId = event.url.searchParams.get("pid") ?? "";
  if (!isShortCode(shortCode) || !isPhysicalCardId(physicalCardId)) {
    return failure("Invalid card identity", "invalid_request", 400);
  }

  try {
    const props = await readPhysicalCardProps(
      getFirestoreRest(event.platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON),
      shortCode,
      physicalCardId
    );
    if (!props) {
      return failure("No props recorded for this card", "no_card_props", 404);
    }
    return json(
      {
        leftPropType: props.leftPropType ?? null,
        rightPropType: props.rightPropType ?? null,
      },
      {
        headers: {
          ...CORS_HEADERS,
          // Issued once and never rewritten, so a scanner may reuse it.
          "Cache-Control": "public, max-age=86400",
        },
      }
    );
  } catch (error) {
    console.error("[physical-card-props] lookup failed:", error);
    return failure("Card props are unavailable", "card_props_failed", 500);
  }
};
