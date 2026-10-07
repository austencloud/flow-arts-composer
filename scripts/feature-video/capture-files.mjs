/**
 * Where app recordings live in a feature video, and how to tell which take
 * plays one. A capture has an id such as `builder-dckpsi`; each recording of
 * it is `media/captures/<id>.<n>.mp4`, with n counting up so no earlier file
 * is overwritten. The take that plays the latest one keeps its id across
 * re-records, which is what keeps its clips in the post.
 */

const ID = /^[a-z0-9][a-z0-9-]*$/;

export function assertCaptureId(id) {
  if (typeof id !== "string" || !ID.test(id))
    throw new Error(
      `A capture id is lowercase letters, digits and hyphens, like builder-dckpsi. Got "${id}".`
    );
  return id;
}

/** The media-relative path of recording number `n`. */
export function captureFile(id, n) {
  return `captures/${id}.${n}.mp4`;
}

/** The next unused recording for `id`, given the file names already in media/captures. */
export function nextCaptureFile(id, existing) {
  assertCaptureId(id);
  const pattern = new RegExp(`^(?:captures/)?${id}\\.(\\d+)\\.mp4$`);
  let highest = 0;
  for (const name of existing) {
    const match = pattern.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return captureFile(id, highest + 1);
}

/** `captures/a.1.mp4` from a feature video media url, or null for any other url. */
export function mediaRelativePath(url) {
  const marker = "/media/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  return url
    .slice(at + marker.length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

/** The take that plays a recording of capture `id`, or null. */
export function findCaptureTake(takes, id) {
  assertCaptureId(id);
  const pattern = new RegExp(`^captures/${id}\\.\\d+\\.mp4$`);
  return (
    takes.find(
      (take) =>
        take.ref?.kind === "linked" &&
        pattern.test(mediaRelativePath(take.ref.url) ?? "")
    ) ?? null
  );
}
