import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "#lib/server/dev-loopback.js";
import {
  FeatureVideoError,
  featureVideoFailure,
  featureVideos,
} from "#lib/server/feature-video-store.js";

/** Dev only: one feature video, read whole and saved whole. */
export const GET: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  try {
    return Response.json(await featureVideos().read(params.slug ?? ""));
  } catch (cause) {
    featureVideoFailure(cause);
  }
};

/**
 * Saves the whole post. A save from an older revision gets 409 with the
 * revision now on disk, so the editor can load it instead.
 */
export const PUT: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request);
  if (
    typeof input.baseRevision !== "number" ||
    !Number.isSafeInteger(input.baseRevision)
  )
    error(400, "Send baseRevision, the revision this edit started from.");
  try {
    return Response.json(
      await featureVideos().write(params.slug ?? "", {
        baseRevision: input.baseRevision,
        project: input.project,
      })
    );
  } catch (cause) {
    if (cause instanceof FeatureVideoError && cause.status === 409)
      return Response.json(
        { message: cause.message, revision: cause.revision },
        { status: 409 }
      );
    featureVideoFailure(cause);
  }
};
