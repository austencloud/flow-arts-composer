import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback } from "#lib/server/dev-loopback.js";
import {
  CometMapError,
  buildFeatureCometMap,
} from "#lib/server/feature-video-comet.js";
import { featureVideoFailure } from "#lib/server/feature-video-store.js";

/**
 * Dev only: reads a clip's light map for its comet trails. The body is
 * `{ itemId, sourceUrl, fromSeconds, toSeconds }`; the answer is the map's
 * media URL. A minute of 4K footage takes about a minute.
 */
export const POST: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) error(400, "Send the clip and stretch to read as JSON.");
  try {
    const result = await buildFeatureCometMap(params.slug ?? "", {
      itemId: String(body.itemId ?? ""),
      sourceUrl: String(body.sourceUrl ?? ""),
      fromSeconds: Number(body.fromSeconds),
      toSeconds: Number(body.toSeconds),
    });
    return Response.json(result, { status: 201 });
  } catch (cause) {
    if (cause instanceof CometMapError) error(cause.status, cause.message);
    featureVideoFailure(cause);
  }
};
