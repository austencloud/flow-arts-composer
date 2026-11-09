/**
 * Firestore + Storage paths for the visual-artifact publication boundary.
 * Keep every consumer on these helpers — path drift between rules, services,
 * and tests is how projection bugs are born (see shared/library/data/
 * firestore-paths.ts for the sequence-side precedent).
 */

export const PUBLIC_ARTIFACTS_COLLECTION = "publicArtifacts";
export const ARTIFACT_PUBLICATION_REQUESTS_COLLECTION =
  "artifactPublicationRequests";

export function getPublicArtifactPath(artifactId: string): string {
  return `${PUBLIC_ARTIFACTS_COLLECTION}/${artifactId}`;
}

export function getPublicArtifactRevisionsPath(artifactId: string): string {
  return `${getPublicArtifactPath(artifactId)}/revisions`;
}

export function getPublicArtifactRevisionPath(
  artifactId: string,
  revisionId: string
): string {
  return `${getPublicArtifactRevisionsPath(artifactId)}/${revisionId}`;
}

export function getArtifactPublicationRequestPath(requestId: string): string {
  return `${ARTIFACT_PUBLICATION_REQUESTS_COLLECTION}/${requestId}`;
}

/**
 * Bumped whenever the poster RENDERERS change in a way that should invalidate
 * already-uploaded images. Posters are served `immutable, max-age=1y`, so a
 * re-render has to land on a new path or cached clients keep the old picture
 * forever. Version 2 raised both the tunnel and mandala posters to 1024px —
 * version 1 tunnels were 200px thumbnails upscaled ~4.8x on a 4K Explore card.
 * Version 3 changed what a tunnel poster DEPICTS: the still is now the tunnel's
 * complete traced figure rather than a frame of one, and the same picture every
 * time (see `tunnel-collection/domain/tunnel-poster-look.ts`).
 * Version 4 brought mandala posters down to the normal line weight, from four
 * times that.
 */
export const ARTIFACT_POSTER_RENDER_VERSION = 4;

/**
 * Storage object for the world-readable discovery poster (webp, ≤200KB).
 * Keyed by render version as well as revision, so re-rendering the same content
 * with the same renderer overwrites in place (no orphans) while a renderer bump
 * writes a genuinely new URL.
 */
export function publicArtifactPosterStoragePath(
  ownerId: string,
  artifactId: string,
  publicRevisionId: string,
  posterVersion: number = ARTIFACT_POSTER_RENDER_VERSION
): string {
  const suffix = posterVersion > 1 ? `_p${posterVersion}` : "";
  return `public-artifacts/${ownerId}/${artifactId}/${publicRevisionId}${suffix}.webp`;
}
