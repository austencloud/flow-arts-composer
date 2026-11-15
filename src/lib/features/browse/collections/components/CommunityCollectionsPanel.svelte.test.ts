import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import { flushSync } from "svelte";
import { createBrowseNavigationState } from "#lib/shared/browse/state/browse-navigation-state.svelte.js";
import Harness from "./__tests__/CommunityCollectionsBackHarness.svelte";

vi.mock("../state/community-collections-state.svelte", () => ({
  communityCollectionsState: {
    items: [],
    shelfItems: [],
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

  // Layers of the panel's own list/collection swap (the outer Crossfade).
  const screenLayers = () =>
    [...(document.querySelector(".crossfade")?.children ?? [])].filter(
      (child) => child.classList.contains("layer")
    ).length;

  const detailOf = (contextId: string) =>
    ({
      primary: "explore",
      section: "collections",
      view: "detail",
      ownerId: "owner-1",
      contextId,
    }) as const;
  const list = {
    primary: "explore",
    section: "collections",
    view: "list",
  } as const;

  it("Back takes the collection's buttons out of the bar on the tap, while its page is still leaving", async () => {
    const navigation = createBrowseNavigationState();
    render(Harness, { navigation });

    navigation.navigateTo(detailOf("col-1"), { syncUrl: false });
    flushSync();
    await expect
      .element(page.getByRole("button", { name: "Follow col-1" }))
      .toBeVisible();

    navigation.navigateTo(list, { replace: true, syncUrl: false });
    flushSync();

    // The leaving page is still mounted (its half of the swap is running),
    // but the bar no longer shows its buttons.
    expect(document.querySelector('[data-testid="detail"]')).not.toBeNull();
    expect(page.getByTestId("bar").element().textContent?.trim()).toBe("");
  });

  it("Back pressed halfway through an opening ends on the list, one layer", async () => {
    const navigation = createBrowseNavigationState();
    render(Harness, { navigation });

    navigation.navigateTo(detailOf("col-1"), { syncUrl: false });
    flushSync();
    navigation.navigateTo(list, { replace: true, syncUrl: false });
    flushSync();

    await expect.poll(() => screenLayers()).toBe(1);
    expect(document.querySelector('[data-testid="detail"]')).toBeNull();
    expect(page.getByTestId("bar").element().textContent?.trim()).toBe("");
  });

  it("a second collection opened during a Back ends on that collection alone", async () => {
    const navigation = createBrowseNavigationState();
    render(Harness, { navigation });

    navigation.navigateTo(detailOf("col-1"), { syncUrl: false });
    flushSync();
    await expect
      .element(page.getByTestId("detail"))
      .toHaveTextContent("Detail col-1");

    navigation.navigateTo(list, { replace: true, syncUrl: false });
    flushSync();
    navigation.navigateTo(detailOf("col-2"), { syncUrl: false });
    flushSync();

    await expect
      .poll(() =>
        [...document.querySelectorAll('[data-testid="detail"]')].map(
          (node) => node.textContent
        )
      )
      .toEqual(["Detail col-2 by Collection creator"]);
    await expect.poll(() => screenLayers()).toBe(1);
  });
});
