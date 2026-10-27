import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import { flushSync } from "svelte";
import { createBrowseNavigationState } from "#lib/shared/browse/state/browse-navigation-state.svelte.js";
import Harness from "./__tests__/CommunityCollectionsBackHarness.svelte";

vi.mock("../state/community-collections-state.svelte", () => ({
  communityCollectionsState: {
    items: [],
    loading: false,
    error: null,
    ensureLoaded: () => Promise.resolve(),
    invalidate: () => {},
  },
}));

vi.mock("./CollectionDetailView.svelte", async () => ({
  default: (await import("./__tests__/CollectionDetailStandIn.svelte")).default,
}));

describe("CommunityCollectionsPanel", () => {
  it("survives going back from a collection while the header bar still shows its actions", async () => {
    const navigation = createBrowseNavigationState();
    render(Harness, { navigation });

    navigation.navigateTo(
      {
        primary: "explore",
        section: "collections",
        view: "detail",
        ownerId: "owner-1",
        contextId: "col-1",
      },
      { syncUrl: false }
    );
    flushSync();
    await expect
      .element(page.getByTestId("detail"))
      .toHaveTextContent("Detail col-1");
    await expect
      .element(page.getByRole("button", { name: "Follow col-1" }))
      .toBeVisible();

    // The browser's Back button: the route owner replaces the location with
    // the list. The bar's snippet re-runs before the panel unmounts the detail.
    navigation.navigateTo(
      { primary: "explore", section: "collections", view: "list" },
      { replace: true, syncUrl: false }
    );
    expect(() => flushSync()).not.toThrow();

    await expect.element(page.getByTestId("detail")).not.toBeInTheDocument();
    expect(page.getByTestId("bar").element().textContent?.trim()).toBe("");
  });
});
