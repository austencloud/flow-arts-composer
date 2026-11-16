import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import AccountValueRow from "./AccountValueRow.svelte";
import MyPropsCard from "../account/MyPropsCard.svelte";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PropPreferenceState } from "#lib/shared/community/state/prop-preference-state.svelte.js";

// Account > Personal details on a phone. A visitor pressed "Display name" and
// then their prop chips, and nothing happened: only the small pen and the
// small Change button were controls, and a press on a chip selected its word.
// The whole value row and the whole row of chips are now the controls.

describe("Account value row", () => {
  it("is one control named for the edit; a press on the label starts editing", async () => {
    const onEdit = vi.fn();
    render(AccountValueRow, {
      label: "Display name",
      value: "Rowan Vale",
      onEdit,
    });

    const row = page.getByRole("button", { name: "Edit display name" });
    await expect.element(row).toBeInTheDocument();
    expect(page.getByRole("button").all()).toHaveLength(1);

    await page.getByText("Display name").click();
    await page.getByText("Rowan Vale").click();
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("stays plain text when there is nothing to edit", async () => {
    render(AccountValueRow, { label: "Password", value: "Enabled" });
    expect(page.getByRole("button").all()).toHaveLength(0);
  });
});

describe("Prop chips", () => {
  const propState = {
    propsISpinWith: [PropType.STAFF, PropType.CLUB],
    favoriteProp: PropType.STAFF,
    favoriteCatdog: null,
    loading: false,
    saving: false,
    error: null,
  } as unknown as PropPreferenceState;

  it("open the prop editor and cannot be selected as text", async () => {
    const onOpenPropEditor = vi.fn();
    render(MyPropsCard, { propState, onOpenPropEditor });

    const chips = page
      .getByRole("button", { name: /props you spin/i })
      .filter({ hasText: /staff/i });
    await expect.element(chips).toBeInTheDocument();
    expect(getComputedStyle(chips.element()).userSelect).toBe("none");

    await chips.click();
    expect(onOpenPropEditor).toHaveBeenCalledOnce();
  });
});
