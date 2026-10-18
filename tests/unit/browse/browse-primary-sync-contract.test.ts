/**
 * Static contract test for BrowseModule's outer-tab -> inner-route sync.
 *
 * BrowseModule declares a `$effect` that pushes the global navigation's active
 * tab into Browse's own route state. Svelte 5 flushes user
 * effects in source order, and that effect is declared above `onMount`, so on a
 * cold load it runs BEFORE `browseNavigationState.initialize()` has read the
 * URL. While `currentLocation` is still null the `activePrimary` derived falls
 * back to its "explore" default; comparing the nav tab against that default
 * made every direct hit on /browse/you/* look like a primary change, and the
 * resulting `selectPrimary("you")` rewrote the address bar to
 * /browse/you/sequences before `initialize()` ever saw the real path. Reloading
 * or bookmarking /browse/you/visuals/tunnels, /browse/you/videos, and
 * /browse/you/collections all threw the user back to Sequences.
 *
 * The effect must therefore bail until the route state has a location, and
 * compare against the resolved destination rather than the derived default.
 *
 * If this test fails, keep the guard — do not loosen the assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const BROWSE_MODULE =
  "src/lib/features/browse/shared/components/BrowseModule.svelte";

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/** The effect body that syncs the global nav tab into Browse's route state. */
function primarySyncEffect(source: string): string {
  const start = source.indexOf("const navTab = navigationState.activeTab;");
  expect(
    start,
    "BrowseModule no longer reads navigationState.activeTab into a primary-sync effect"
  ).toBeGreaterThan(-1);
  const end = source.indexOf("});", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("BrowseModule primary-sync contract", () => {
  const effect = primarySyncEffect(read(BROWSE_MODULE));

  it("bails out until the route state has resolved a location", () => {
    expect(effect).toMatch(
      /const location = browseNavigationState\.currentLocation;\s*if \(!location\) return;/
    );
  });

  it("compares the nav tab against the resolved location, not the derived default", () => {
    expect(effect).toContain(
      "browseDestinationForLocation(location) !== navTab"
    );
    expect(
      effect,
      "activePrimary defaults to 'explore' before initialize() runs, so it cannot gate selectPrimary"
    ).not.toContain("activePrimary");
  });

  it("selects a destination only when the outer tab genuinely changes", () => {
    expect(effect).toContain("navTab === observedNavTab");
    expect(effect).toContain("browseLocationForDestination(navTab");
  });

  it("leaves browser history writes to the sidebar coordinator", () => {
    // The coordinator pushes the new destination after its View Transition.
    // An earlier Browse replace would overwrite the entry Back must restore.
    expect(effect).toContain("{ replace: true, syncUrl: false }");
  });
});
