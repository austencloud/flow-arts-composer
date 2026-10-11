import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CollectionPickerContent from "./CollectionPickerContent.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";

// Isolate the picker from the Firestore-backed singleton: the UI contract under
// test is "given these collections + selection, render the right pressed state
// and emit the right ids on toggle". Membership persistence is covered by the
// state's own logic test.
const stub = vi.hoisted(() => ({
  collections: [] as LibraryCollection[],
  loading: false,
  addMany: vi.fn(),
  createAndAddMany: vi.fn(),
}));
vi.mock("#lib/features/library/state/collections-state.svelte.js", () => ({
  collectionsState: {
    get collections() {
      return stub.collections;
    },
    get loading() {
      return stub.loading;
    },
    ensureStarted() {},
    isIn: () => false,
    create: vi.fn(),
    createAndAdd: vi.fn(),
    createAndAddMany: stub.createAndAddMany,
    addMany: stub.addMany,
    toggle: vi.fn(),
  },
}));

function col(
  id: string,
  name: string,
  opts: Partial<LibraryCollection> = {}
): LibraryCollection {
  return {
    id,
    name,
    ownerId: "u1",
    sequenceIds: [],
    sequenceCount: 0,
    isPublic: false,
    sortOrder: 0,
    icon: "fa-folder",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...opts,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stub.loading = false;
  stub.addMany.mockResolvedValue(true);
  stub.collections = [
    col("fav", "Favorites", {
      systemType: "favorites",
      icon: "fa-heart",
      color: "#ef4444",
      sortOrder: -1000,
    }),
    col("c1", "Poi Combos", { sequenceCount: 3 }),
    col("c2", "Teaching", { sequenceCount: 0 }),
  ];
});

describe("CollectionPickerContent (bulk mode)", () => {
  it("shows mixed membership and adds the whole selection with one action", async () => {
    stub.collections = [
      col("c1", "Poi Combos", {
        sequenceIds: ["s1"],
        sequenceCount: 1,
      }),
    ];
    const onBulkComplete = vi.fn();
    render(CollectionPickerContent, {
      mode: "bulk",
      sequenceIds: ["s1", "s2", "s3"],
      onBulkComplete,
    });

    await expect.element(page.getByText("1 of 3 already here")).toBeVisible();
    await page
      .getByRole("button", { name: /Poi Combos, 1 of 3 already here/ })
      .click();

    expect(stub.addMany).toHaveBeenCalledWith(["s1", "s2", "s3"], "c1");
    expect(onBulkComplete).toHaveBeenCalledOnce();
  });

  it("keeps the picker open when the bulk write is rejected", async () => {
    stub.addMany.mockResolvedValue(false);
    const onBulkComplete = vi.fn();
    render(CollectionPickerContent, {
      mode: "bulk",
      sequenceIds: ["s1", "s2"],
      onBulkComplete,
    });

    await page.getByRole("button", { name: /Teaching/ }).click();
    expect(onBulkComplete).not.toHaveBeenCalled();
  });

  it("disables a collection that already contains the whole selection", async () => {
    stub.collections = [
      col("c1", "Poi Combos", {
        sequenceIds: ["s1", "s2"],
        sequenceCount: 2,
      }),
    ];
    const onBulkComplete = vi.fn();
    render(CollectionPickerContent, {
      mode: "bulk",
      sequenceIds: ["s1", "s2"],
      onBulkComplete,
    });

    await expect
      .element(
        page.getByRole("button", {
          name: /Poi Combos, all 2 already here/,
        })
      )
      .toBeDisabled();
    expect(stub.addMany).not.toHaveBeenCalled();
    expect(onBulkComplete).not.toHaveBeenCalled();
  });
});

describe("CollectionPickerContent (select mode)", () => {
  it("presses only the chips whose collection is selected", async () => {
    render(CollectionPickerContent, {
      mode: "select",
      selectedIds: ["c1"],
      onChange: vi.fn(),
    });

    await expect
      .element(page.getByRole("button", { name: /Poi Combos/ }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: /Teaching/ }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("emits the id list with the collection added on toggle", async () => {
    const onChange = vi.fn();
    render(CollectionPickerContent, {
      mode: "select",
      selectedIds: [],
      onChange,
    });

    await page.getByRole("button", { name: /Teaching/ }).click();
    expect(onChange).toHaveBeenCalledWith(["c2"]);
  });

  it("emits the id list with the collection removed when it was selected", async () => {
    const onChange = vi.fn();
    render(CollectionPickerContent, {
      mode: "select",
      selectedIds: ["c1"],
      onChange,
    });

    await page.getByRole("button", { name: /Poi Combos/ }).click();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("reveals the name input when 'New collection' is pressed", async () => {
    render(CollectionPickerContent, {
      mode: "select",
      selectedIds: [],
      onChange: vi.fn(),
    });

    await page.getByRole("button", { name: "New collection" }).click();
    await expect
      .element(page.getByRole("textbox", { name: "New collection name" }))
      .toBeVisible();
  });

  it("has no AAA a11y violations", async () => {
    render(CollectionPickerContent, {
      mode: "select",
      selectedIds: ["c1"],
      onChange: vi.fn(),
    });
    await expectNoA11yViolations();
  });
});
