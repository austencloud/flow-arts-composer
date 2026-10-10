import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback } from "#lib/server/dev-loopback.js";
import {
  FeatureExportError,
  saveFeatureExport,
} from "#lib/server/feature-video-exports.js";
import {
  featureVideoFailure,
  featureVideos,
} from "#lib/server/feature-video-store.js";
import { defaultFeatureExportName } from "#lib/shared/media-composition/domain/feature-video-export.js";

/**
 * Dev only: keeps a finished render in a feature video's `exports/` folder.
 * The body is the MP4 itself. `?name=` picks the file name; a name an earlier
 * render has gets a number, so no render is ever replaced.
 */
export const POST: RequestHandler = async ({
  request,
  params,
  url,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const slug = params.slug ?? "";
  try {
    const projectDir = featureVideos().folder(slug);
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("video/mp4"))
      error(415, "Send the render as video/mp4.");
    if (!request.body) error(400, "The render was empty.");
    const length = Number(request.headers.get("content-length") ?? "");
    const saved = await saveFeatureExport(projectDir, {
      name: url.searchParams.get("name") ?? defaultFeatureExportName(slug),
      body: request.body,
      ...(length > 0 ? { declaredBytes: length } : {}),
    });
    return Response.json(saved, { status: 201 });
  } catch (cause) {
    if (cause instanceof FeatureExportError) error(cause.status, cause.message);
    featureVideoFailure(cause);
  }
};
