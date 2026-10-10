import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "#lib/server/dev-loopback.js";
import {
  featureVideoFailure,
  featureVideos,
} from "#lib/server/feature-video-store.js";
import { activeFeatureVideoSession } from "#lib/server/post-project-dev-bridge.js";

/**
 * Dev only: named edits to a feature video on disk. While an editor has the
 * project open, edits go through that editor instead, so its undo history
 * and its next save include them.
 */
export const POST: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const slug = params.slug ?? "";
  const input = await readJsonBody(request, 1_000_000);
  if (!Array.isArray(input.ops)) error(400, "Send ops, a list of named edits.");
  if (activeFeatureVideoSession(slug))
    error(
      409,
      `An editor has ${slug} open; send edits through it (the CLI does this for you).`
    );
  try {
    return Response.json(await featureVideos().applyOps(slug, input.ops));
  } catch (cause) {
    featureVideoFailure(cause);
  }
};
