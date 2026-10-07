import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";

/** Dev only: the feature videos on this computer, and new ones. */
export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
  try {
    return json(await featureVideos().list());
  } catch (cause) {
    featureVideoFailure(cause);
  }
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request, 64_000);
  if (
    typeof input.slug !== "string" ||
    typeof input.title !== "string" ||
    typeof input.sequenceId !== "string" ||
    (input.canvas !== undefined && typeof input.canvas !== "string")
  )
    error(
      400,
      "Send slug, title and sequenceId as text, and canvas when you want one."
    );
  try {
    const created = await featureVideos().create({
      slug: input.slug,
      title: input.title,
      sequenceId: input.sequenceId,
      ...(typeof input.canvas === "string" ? { canvas: input.canvas } : {}),
    });
    return json(created, { status: 201 });
  } catch (cause) {
    featureVideoFailure(cause);
  }
};
