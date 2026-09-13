// Deliberately the params module, not the codec: this file runs in the root
// layout's `afterNavigate`, and the codec's fflate compression stack has no
// business on every route's hydration path. See viewer-url-state-params.ts.
import { VIEWER_STATE_PARAM_NAMES } from "$lib/shared/sequence-viewer/services/viewer-url-state-params";

interface RouteScopedParameter {
  name: string;
  /** `url` is the destination being cleaned; read other params from it. */
  isValidForPath: (pathname: string, url: URL) => boolean;
}

const startsWith = (prefix: string) => (pathname: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isAtlasPath = (pathname: string) =>
  startsWith("/atlas")(pathname) || startsWith("/glossary")(pathname);

// Routes whose own page mounts a sequence viewer without needing `?v=`.
const isViewerRoute = (pathname: string) =>
  startsWith("/sequence")(pathname) || startsWith("/from/spiroanim")(pathname);

/**
 * Viewer-state params (`pane`, `split`, `fx`, `cols`, `s`) describe an OPEN
 * sequence viewer. The overlay host rides on top of any app route, so identity
 * — `?v=` — is what says a viewer belongs here, not the path.
 *
 * Without this scope they outlive the viewer: every path change copies the
 * whole query string onto the destination (`navigation-coordinator`
 * `pushHistoryState`, `browse-navigation-state` `writeLocation`), so state left
 * over from a closed viewer rides along forever. A browse URL then LOOKS like a
 * viewer deep link and opens the plain gallery, because the params it carries
 * name a pane and an effect but no sequence.
 */
const isViewerStateValid = (pathname: string, url: URL) =>
  isViewerRoute(pathname) || url.searchParams.has("v");

const ROUTE_SCOPED_PARAMETERS: readonly RouteScopedParameter[] = [
  {
    name: "letter",
    isValidForPath: (pathname) =>
      isAtlasPath(pathname) || pathname === "/browse/explore/sequences",
  },
  { name: "grid", isValidForPath: isAtlasPath },
  { name: "variation", isValidForPath: isAtlasPath },
  { name: "leftTurns", isValidForPath: isAtlasPath },
  { name: "rightTurns", isValidForPath: isAtlasPath },
  { name: "leftRotation", isValidForPath: isAtlasPath },
  { name: "rightRotation", isValidForPath: isAtlasPath },
  // Preserve published legacy links until the route parser normalizes them.
  { name: "blueTurns", isValidForPath: isAtlasPath },
  { name: "redTurns", isValidForPath: isAtlasPath },
  { name: "blueRotation", isValidForPath: isAtlasPath },
  { name: "redRotation", isValidForPath: isAtlasPath },
  {
    name: "scan",
    isValidForPath: (pathname) =>
      startsWith("/browse/you/collections")(pathname) ||
      startsWith("/browse/library")(pathname) ||
      startsWith("/browse/collections")(pathname),
  },
  { name: "handoff", isValidForPath: startsWith("/compose") },
  { name: "feedback", isValidForPath: startsWith("/feedback") },
  { name: "openFeedback", isValidForPath: startsWith("/feedback") },
  { name: "theme", isValidForPath: startsWith("/settings/theme") },
  { name: "pack", isValidForPath: startsWith("/choreo_card/releaser") },
  { name: "room", isValidForPath: startsWith("/museum") },
  { name: "inspectUser", isValidForPath: startsWith("/admin/users") },
  { name: "inspectSession", isValidForPath: startsWith("/admin/users") },
  ...VIEWER_STATE_PARAM_NAMES.map((name) => ({
    name,
    isValidForPath: isViewerStateValid,
  })),
];

const ONE_REQUEST_PARAMETERS = ["fresh", "from", "code", "section"] as const;

export function pruneRouteScopedParams(url: URL, pathname: string): void {
  for (const parameter of ROUTE_SCOPED_PARAMETERS) {
    if (!parameter.isValidForPath(pathname, url)) {
      url.searchParams.delete(parameter.name);
    }
  }
}

export function pruneParamsForNavigation(url: URL, pathname: string): void {
  for (const name of ONE_REQUEST_PARAMETERS) {
    url.searchParams.delete(name);
  }

  pruneRouteScopedParams(url, pathname);
}
