/**
 * `/c/{code}`: the short link for a public collection.
 *
 * Resolves the code to its owner and collection and redirects to the Explore
 * detail route, so the short address and the long one open the same page.
 * Unknown or malformed codes 404; a Firestore outage surfaces as a 503 so a
 * dead link is never mistaken for a missing one.
 */

import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { buildBrowsePath } from "#lib/shared/browse/navigation/browse-route-resolver.js";
import { normalizeCollectionShareCode } from "#lib/shared/library/domain/collection-share-code.js";
import { fetchPublicCollectionLink } from "#lib/shared/library/services/public-collection-link-reader.js";

export const GET: RequestHandler = async ({ params }) => {
  const code = normalizeCollectionShareCode(params.code ?? "");
  if (!code) {
    error(404, "Unknown collection link");
  }

  let link;
  try {
    link = await fetchPublicCollectionLink(code);
  } catch {
    error(503, "Collection links are briefly unavailable");
  }
  if (!link) {
    error(404, "Unknown collection link");
  }

  redirect(
    302,
    buildBrowsePath({
      primary: "explore",
      section: "collections",
      view: "detail",
      ownerId: link.ownerId,
      contextId: link.collectionId,
    })
  );
};
