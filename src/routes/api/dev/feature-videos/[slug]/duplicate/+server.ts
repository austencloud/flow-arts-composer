import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "#lib/server/dev-loopback.js";
import {
  featureVideoFailure,
  featureVideos,
} from "#lib/server/feature-video-store.js";

/** Dev only: copies a feature video under a new name. */
export const POST: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request, 64_000);
  if (
    typeof input.slug !== "string" ||
    (input.title !== undefined && typeof input.title !== "string") ||
    (input.shareMedia !== undefined && typeof input.shareMedia !== "boolean")
  )
    error(
      400,
      "Send slug, the copy's name, plus title and shareMedia when you want them."
    );
  try {
    const copied = await featureVideos().duplicate(params.slug ?? "", {
      slug: input.slug,
      ...(typeof input.title === "string" ? { title: input.title } : {}),
      ...(input.shareMedia === true ? { shareMedia: true } : {}),
    });
    return Response.json(copied, { status: 201 });
  } catch (cause) {
    featureVideoFailure(cause);
  }
};
