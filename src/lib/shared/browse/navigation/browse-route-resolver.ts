export const BROWSE_NAV_SCHEMA_VERSION = 2;

export type BrowsePrimary = "explore" | "you";
export type BrowseExploreSection = "sequences" | "collections" | "visuals";
export type BrowseYouSection =
  | "sequences"
  | "visuals"
  | "videos"
  | "collections";
export type BrowseSection = BrowseExploreSection | BrowseYouSection;
export type BrowseView = "list" | "detail";
export type BrowseVisualType = "tunnels" | "mandalas" | "scenes";

export interface BrowseFilter {
  type: string;
  value: string;
  displayName?: string;
}

export interface BrowseLocation {
  primary: BrowsePrimary;
  section: BrowseSection;
  view: BrowseView;
  contextId?: string;
  ownerId?: string;
  visualType?: BrowseVisualType;
  filter?: BrowseFilter;
}

export interface ResolvedBrowseRoute {
  location: BrowseLocation;
  canonicalPath: string;
  isLegacy: boolean;
  externalRedirect?: string;
}

export interface PersistedBrowseNavigation {
  schemaVersion: typeof BROWSE_NAV_SCHEMA_VERSION;
  history: BrowseLocation[];
  currentIndex: number;
}

const DEFAULT_LOCATION: BrowseLocation = {
  primary: "explore",
  section: "sequences",
  view: "list",
};

const VISUAL_TYPES = new Set<BrowseVisualType>([
  "tunnels",
  "mandalas",
  "scenes",
]);

function safeDecode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function asVisualType(value: string | undefined): BrowseVisualType | undefined {
  return value && VISUAL_TYPES.has(value as BrowseVisualType)
    ? (value as BrowseVisualType)
    : undefined;
}

function cleanPath(pathname: string): string {
  const withoutApp = pathname.startsWith("/app/")
    ? pathname.slice(4)
    : pathname === "/app"
      ? "/"
      : pathname;
  return `/${
    withoutApp
      .split("?")[0]
      ?.split("#")[0]
      ?.replace(/^\/+|\/+$/g, "") ?? ""
  }`;
}

/**
 * The address of a public collection that anyone can open, signed in or not.
 *
 * Always the production site: a link is for someone else, and a dev or
 * native-app origin would hand them a page they cannot reach. The path is the
 * same one Explore > Collections navigates to, so the link lands on the exact
 * read-only detail view the owner sees there.
 */
export const PUBLIC_SITE_URL = "https://tkaflowarts.com";

export function buildPublicCollectionUrl(
  ownerId: string,
  collectionId: string
): string {
  return `${PUBLIC_SITE_URL}${buildBrowsePath({
    primary: "explore",
    section: "collections",
    view: "detail",
    ownerId,
    contextId: collectionId,
  })}`;
}

export function buildBrowsePath(location: BrowseLocation): string {
  if (location.primary === "explore") {
    if (location.section === "collections") {
      if (location.ownerId && location.contextId) {
        return `/browse/explore/collections/${encodeURIComponent(location.ownerId)}/${encodeURIComponent(location.contextId)}`;
      }
      return "/browse/explore/collections";
    }

    // The type segment is OPTIONAL: Explore > Visuals shows every type at
    // once, and a named type is a deep-link filter. A detail id can therefore
    // sit directly under /visuals — ids never collide with the type names
    // because asVisualType() only matches the fixed set.
    if (location.section === "visuals") {
      const base = location.visualType
        ? `/browse/explore/visuals/${location.visualType}`
        : "/browse/explore/visuals";
      return location.contextId
        ? `${base}/${encodeURIComponent(location.contextId)}`
        : base;
    }

    return "/browse/explore/sequences";
  }

  if (location.section === "visuals") {
    return location.visualType
      ? `/browse/you/visuals/${location.visualType}`
      : "/browse/you/visuals/tunnels";
  }

  if (location.section === "videos") return "/browse/you/videos";

  if (location.section === "collections") {
    if (location.ownerId && location.contextId) {
      return `/browse/you/collections/${encodeURIComponent(location.ownerId)}/${encodeURIComponent(location.contextId)}`;
    }
    if (location.contextId) {
      return `/browse/you/collections/${encodeURIComponent(location.contextId)}`;
    }
    return "/browse/you/collections";
  }

  return "/browse/you/sequences";
}

function resolved(
  location: BrowseLocation,
  incomingPath: string,
  externalRedirect?: string
): ResolvedBrowseRoute {
  const canonicalPath = buildBrowsePath(location);
  return {
    location,
    canonicalPath,
    isLegacy: cleanPath(incomingPath) !== canonicalPath,
    externalRedirect,
  };
}

export function resolveBrowsePathname(
  pathname: string
): ResolvedBrowseRoute | null {
  const normalized = cleanPath(pathname);
  const parts = normalized.replace(/^\//, "").split("/").filter(Boolean);

  if (parts[0] === "library") {
    const collectionId = safeDecode(parts[1]);
    return resolved(
      collectionId
        ? {
            primary: "you",
            section: "collections",
            view: "detail",
            contextId: collectionId,
          }
        : { primary: "you", section: "sequences", view: "list" },
      normalized
    );
  }

  if (parts[0] !== "browse") return null;

  const first = parts[1];
  if (first === "hall-of-shame") {
    return resolved(DEFAULT_LOCATION, normalized, "/hall-of-shame");
  }

  if (!first || first === "gallery") {
    return resolved(DEFAULT_LOCATION, normalized);
  }

  if (first === "discover" || first === "community") {
    return resolved(
      { primary: "explore", section: "collections", view: "list" },
      normalized
    );
  }

  if (first === "library") {
    const collectionId = safeDecode(parts[2]);
    return resolved(
      collectionId
        ? {
            primary: "you",
            section: "collections",
            view: "detail",
            contextId: collectionId,
          }
        : { primary: "you", section: "sequences", view: "list" },
      normalized
    );
  }

  if (first === "collections") {
    const collectionId = safeDecode(parts[2]);
    return resolved(
      collectionId
        ? {
            primary: "you",
            section: "collections",
            view: "detail",
            contextId: collectionId,
          }
        : { primary: "explore", section: "collections", view: "list" },
      normalized
    );
  }

  if (first === "explore") {
    const section = parts[2];
    if (!section || section === "sequences") {
      return resolved(DEFAULT_LOCATION, normalized);
    }
    if (section === "collections") {
      const ownerId = safeDecode(parts[3]);
      const collectionId = safeDecode(parts[4]);
      return resolved(
        ownerId && collectionId
          ? {
              primary: "explore",
              section: "collections",
              view: "detail",
              ownerId,
              contextId: collectionId,
            }
          : { primary: "explore", section: "collections", view: "list" },
        normalized
      );
    }
    if (section === "visuals") {
      const visualType = asVisualType(parts[3]);
      // With a type segment the id follows it; without one the id (if any)
      // takes its place, and the destination shows every type.
      const publicationId = safeDecode(visualType ? parts[4] : parts[3]);
      return resolved(
        {
          primary: "explore",
          section: "visuals",
          view: publicationId ? "detail" : "list",
          ...(visualType && { visualType }),
          contextId: publicationId,
        },
        normalized
      );
    }
    return resolved(DEFAULT_LOCATION, normalized);
  }

  if (first === "you") {
    const section = parts[2];
    if (!section || section === "sequences") {
      return resolved(
        { primary: "you", section: "sequences", view: "list" },
        normalized
      );
    }
    if (section === "videos") {
      return resolved(
        { primary: "you", section: "videos", view: "list" },
        normalized
      );
    }
    if (section === "visuals") {
      const visualType = asVisualType(parts[3]) ?? "tunnels";
      return resolved(
        {
          primary: "you",
          section: "visuals",
          view: "list",
          visualType,
        },
        normalized
      );
    }
    if (section === "collections") {
      const firstId = safeDecode(parts[3]);
      const secondId = safeDecode(parts[4]);
      return resolved(
        secondId
          ? {
              primary: "you",
              section: "collections",
              view: "detail",
              ownerId: firstId,
              contextId: secondId,
            }
          : firstId
            ? {
                primary: "you",
                section: "collections",
                view: "detail",
                contextId: firstId,
              }
            : { primary: "you", section: "collections", view: "list" },
        normalized
      );
    }
    return resolved(
      { primary: "you", section: "sequences", view: "list" },
      normalized
    );
  }

  return resolved(DEFAULT_LOCATION, normalized);
}

function migrateLegacyLocation(value: unknown): BrowseLocation | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  const tab = typeof legacy.tab === "string" ? legacy.tab : "gallery";
  const view = legacy.view === "detail" ? "detail" : "list";
  const contextId =
    typeof legacy.contextId === "string" ? legacy.contextId : undefined;
  const filter =
    legacy.filter && typeof legacy.filter === "object"
      ? (legacy.filter as BrowseFilter)
      : undefined;

  if (tab === "gallery") {
    return {
      primary: "explore",
      section: "sequences",
      view,
      contextId,
      filter,
    };
  }

  if (tab === "discover" || tab === "community") {
    return { primary: "explore", section: "collections", view: "list" };
  }

  if (tab === "collections" && view === "list" && !contextId) {
    return { primary: "explore", section: "collections", view: "list" };
  }

  if (tab === "library" || tab === "collections") {
    return contextId
      ? {
          primary: "you",
          section: "collections",
          view: "detail",
          contextId,
          filter,
        }
      : { primary: "you", section: "sequences", view: "list" };
  }

  return null;
}

function isCurrentLocation(value: unknown): value is BrowseLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as Partial<BrowseLocation>;
  return (
    (location.primary === "explore" || location.primary === "you") &&
    typeof location.section === "string" &&
    (location.view === "list" || location.view === "detail")
  );
}

export function migratePersistedBrowseNavigation(
  value: unknown
): PersistedBrowseNavigation | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const rawHistory = Array.isArray(data.history) ? data.history : [];
  const history =
    data.schemaVersion === BROWSE_NAV_SCHEMA_VERSION
      ? rawHistory.filter(isCurrentLocation)
      : rawHistory
          .map(migrateLegacyLocation)
          .filter((location): location is BrowseLocation => location !== null);

  if (history.length === 0) return null;
  const rawIndex =
    typeof data.currentIndex === "number" ? data.currentIndex : 0;

  return {
    schemaVersion: BROWSE_NAV_SCHEMA_VERSION,
    history,
    currentIndex: Math.max(0, Math.min(rawIndex, history.length - 1)),
  };
}

export function browseLocationsEqual(
  first: BrowseLocation,
  second: BrowseLocation
): boolean {
  return (
    buildBrowsePath(first) === buildBrowsePath(second) &&
    first.filter?.type === second.filter?.type &&
    first.filter?.value === second.filter?.value
  );
}

export function defaultBrowseLocation(): BrowseLocation {
  return { ...DEFAULT_LOCATION };
}

export function normalizeBrowsePrimary(
  sectionId: string | undefined
): BrowsePrimary {
  return sectionId === "you" || sectionId === "library" ? "you" : "explore";
}
