import {
  EditCopyManifestSchema,
  editCopyPaths,
  type PreparedPreviewVideo,
} from "../domain/preview-video";

/**
 * The editing copy `scripts/make-edit-copies.ts` left beside a same-site
 * recording, or null. A copy whose recording has since changed size is
 * ignored, so a replaced recording never plays someone else's frames.
 */
export async function findEditCopy(
  sourceUrl: string,
  signal: AbortSignal,
  request: typeof fetch = fetch
): Promise<PreparedPreviewVideo | null> {
  const paths = editCopyPaths(sourceUrl);
  if (!paths) return null;
  try {
    const response = await request(paths.manifest, {
      signal,
      cache: "no-cache",
    });
    // A site that answers every path with its page is not a description.
    if (!response.ok || !response.headers.get("content-type")?.includes("json"))
      return null;
    const parsed = EditCopyManifestSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const source = await request(sourceUrl, {
      method: "HEAD",
      signal,
      cache: "no-cache",
    });
    if (
      !source.ok ||
      Number(source.headers.get("content-length")) !== parsed.data.source.bytes
    )
      return null;
    const { source: original, copy } = parsed.data;
    return {
      url: paths.video,
      width: copy.width,
      height: copy.height,
      sourceWidth: original.width,
      sourceHeight: original.height,
      durationSeconds: original.durationSeconds,
    };
  } catch {
    return null;
  }
}
