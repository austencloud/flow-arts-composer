/**
 * Is this page showing inside another website's frame?
 *
 * Any site may frame our /embed pages (hooks.server.ts allows it for those
 * routes only). A browser keeps a framed page's storage apart from our own
 * site's, so whatever the page keeps there, a library save or a sign-in, sits
 * where the person can never reach it from our site. Pages use this to leave
 * account actions out when they are framed that way.
 *
 * Only a page on our own origin can read the top page's address, so a frame
 * whose parent refuses the read belongs to another site. `win` is for tests.
 */
export function isEmbeddedInAnotherSite(win?: Window): boolean {
  const current = win ?? (typeof window === "undefined" ? undefined : window);
  if (!current) return false;
  const top = current.top;
  if (!top || top === current.self) return false;
  try {
    void top.location.href;
    return false;
  } catch {
    return true;
  }
}
