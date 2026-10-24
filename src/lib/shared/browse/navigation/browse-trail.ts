/**
 * The Browse header's breadcrumb trail.
 *
 * A pure function of the Browse location: Browse, then the sidebar group
 * (Community or Your library), then the destination, then a visual type or a
 * leaf such as a collection's name. Back is always the crumb before the
 * current one, never browser history. Labels come from the same tab and group
 * definitions the sidebar renders, so the two never disagree.
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import {
  BROWSE_GROUPS,
  BROWSE_TABS,
} from "#lib/shared/navigation/config/tab-definitions.js";
import {
  browseDestinationForLocation,
  browseLocationForDestination,
  type BrowseLocation,
  type BrowseVisualType,
} from "./browse-route-resolver.js";

export type BrowseGroupId = "community" | "library";

export type BrowseCrumbTarget =
  | { kind: "home"; group?: BrowseGroupId }
  | { kind: "location"; location: BrowseLocation };

export interface BrowseCrumb {
  /** Stable per trail position; keys the crumb list. */
  id: string;
  label: string;
  /** Where the crumb opens. The current crumb has none. */
  target: BrowseCrumbTarget | null;
}

export interface BrowseTrailInput {
  location: BrowseLocation | null;
  homeOpen: boolean;
  /**
   * The screen's own name for a detail location (a collection's name). Null
   * while it is still loading: the crumb is emitted with an empty label so its
   * slot is reserved.
   */
  leafLabel?: string | null;
}

const VISUAL_TYPE_LABEL: Record<BrowseVisualType, TranslationKey> = {
  tunnels: "browse_home_tunnels",
  mandalas: "browse_home_mandalas",
  scenes: "tab_playground_scenes",
};

function groupLabel(group: BrowseGroupId): string {
  const definition = BROWSE_GROUPS.find((entry) => entry.id === group);
  return definition ? t(definition.labelKey) : group;
}

function destinationLabel(destination: string): string {
  const definition = BROWSE_TABS.find((entry) => entry.id === destination);
  return definition ? t(definition.labelKey) : destination;
}

/** Where the destination crumb opens: the list the current screen sits in. */
function destinationLocation(location: BrowseLocation): BrowseLocation {
  if (location.primary === "you" && location.section === "collections") {
    return { primary: "you", section: "collections", view: "list" };
  }
  return browseLocationForDestination(browseDestinationForLocation(location));
}

function isDetail(location: BrowseLocation): boolean {
  return location.view === "detail" && !!location.contextId;
}

function hasVisualType(location: BrowseLocation): boolean {
  return location.section === "visuals" && !!location.visualType;
}

export function buildBrowseTrail(input: BrowseTrailInput): BrowseCrumb[] {
  const { location, homeOpen, leafLabel = null } = input;
  const crumbs: BrowseCrumb[] = [];
  if (homeOpen || !location) {
    crumbs.push({ id: "home", label: t("module_browse"), target: null });
    return crumbs;
  }

  const group: BrowseGroupId =
    location.primary === "you" ? "library" : "community";
  const destination = browseDestinationForLocation(location);
  const detail = isDetail(location);
  const typed = hasVisualType(location);

  crumbs.push({
    id: "home",
    label: t("module_browse"),
    target: { kind: "home" },
  });
  crumbs.push({
    id: `group:${group}`,
    label: groupLabel(group),
    target: { kind: "home", group },
  });
  crumbs.push({
    id: `destination:${destination}`,
    label: destinationLabel(destination),
    target:
      detail || typed
        ? { kind: "location", location: destinationLocation(location) }
        : null,
  });

  if (typed) {
    const visualType = location.visualType!;
    crumbs.push({
      id: `visual:${visualType}`,
      label: t(VISUAL_TYPE_LABEL[visualType]),
      target: detail
        ? {
            kind: "location",
            location: { ...destinationLocation(location), visualType },
          }
        : null,
    });
  }

  if (detail) {
    const seeded =
      location.filter?.type === "collectionName" ? location.filter.value : "";
    crumbs.push({
      id: "leaf",
      label: leafLabel ?? seeded,
      target: null,
    });
  }

  return crumbs;
}

/** The crumb the back control opens: the last one before the current crumb. */
export function browseBackCrumb(trail: BrowseCrumb[]): BrowseCrumb | null {
  for (let index = trail.length - 2; index >= 0; index -= 1) {
    const crumb = trail[index];
    if (crumb?.target) return crumb;
  }
  return null;
}
