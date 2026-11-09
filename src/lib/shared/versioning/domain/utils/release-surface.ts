// Where a release note's "Show me" goes, and what greets the reader there.
// Both are decided from the note plus the live registry, never trusted from the
// note alone: an old note can name a tab that was renamed, removed, or is
// closed to this reader, and then it renders as plain text instead of a button
// that leads nowhere.

import type { ChangelogEntry } from "../models/version-models";

export interface ShowMeTarget {
  module: string;
  tab?: string;
  /** Present only for a highlight: what to pulse on arrival. */
  anchor?: string;
  /** Present only for a highlight: the line shown when there is no anchor. */
  callout?: string;
}

/** What the running app can answer about a destination. */
export interface SurfaceChecks {
  /** The module exists, is live here, and this reader may open it. */
  canOpenModule(module: string): boolean;
  /** The tab exists in that module and this reader may open it. */
  canOpenTab(module: string, tab: string): boolean;
}

export function resolveShowMeTarget(
  entry: Pick<
    ChangelogEntry,
    "surface" | "highlight" | "anchor" | "callout"
  >,
  checks: SurfaceChecks
): ShowMeTarget | null {
  const surface = entry.surface;
  if (!surface || surface === "global") return null;
  if (typeof surface.module !== "string" || !surface.module) return null;
  if (!checks.canOpenModule(surface.module)) return null;
  if (surface.tab !== undefined && !checks.canOpenTab(surface.module, surface.tab)) {
    return null;
  }

  const target: ShowMeTarget = { module: surface.module };
  if (surface.tab) target.tab = surface.tab;
  if (entry.highlight === true) {
    if (entry.anchor) target.anchor = entry.anchor;
    if (entry.callout) target.callout = entry.callout;
  }
  return target;
}

export type Arrival<T> =
  | { kind: "pulse"; element: T }
  | { kind: "callout"; text: string }
  | { kind: "none" };

/**
 * The anchor wins when it is on the page; a rotted or missing anchor falls
 * back to the callout; with neither, reaching the tab is the whole greeting.
 */
export function resolveArrival<T>(
  target: Pick<ShowMeTarget, "anchor" | "callout">,
  findAnchor: (anchor: string) => T | null
): Arrival<T> {
  if (target.anchor) {
    const element = findAnchor(target.anchor);
    if (element) return { kind: "pulse", element };
  }
  if (target.callout) return { kind: "callout", text: target.callout };
  return { kind: "none" };
}
