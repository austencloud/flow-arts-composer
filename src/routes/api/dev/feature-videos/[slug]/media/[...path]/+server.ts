import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback } from "#lib/server/dev-loopback.js";
import {
  FeatureMediaError,
  mediaResponse,
  resolveFeatureMediaFile,
} from "#lib/server/feature-video-media.js";
import {
  featureVideoFailure,
  featureVideos,
} from "#lib/server/feature-video-store.js";

/** Dev only: a file from a feature video's media folder, in byte ranges. */
export const GET: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  try {
    const media = await resolveFeatureMediaFile(
      featureVideos().folder(params.slug ?? ""),
      params.path ?? ""
    );
    return mediaResponse(media, request.headers.get("range"));
  } catch (cause) {
    if (cause instanceof FeatureMediaError) error(cause.status, cause.message);
    featureVideoFailure(cause);
  }
};
