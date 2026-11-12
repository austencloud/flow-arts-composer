import type { LayoutLoad } from "./$types";

// Module paths are client-only SPA - same as /app
export const ssr = false;
export const prerender = false;

// A link that opens the app on a sequence (`?v=<code>`) starts the code
// lookup and the viewer's download here, while the app boots, instead of
// after it (viewer-link-prefetch.ts).
export const load: LayoutLoad = ({ url }) => {
  if (typeof window === "undefined") return;
  const code = url.searchParams.get("v");
  if (!code) return;
  void import("#lib/shared/sequence-viewer/services/viewer-link-prefetch.js")
    .then(({ prefetchViewerLink }) => prefetchViewerLink(code))
    .catch(() => {
      // The drawer host resolves the code itself.
    });
};
