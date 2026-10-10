import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import UserSearchInput from "./UserSearchInput.svelte";

const mocks = vi.hoisted(() => ({
  searchUsers: vi.fn(),
}));

vi.mock("./services/user-searcher", () => ({
  searchUsers: mocks.searchUsers,
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

describe("UserSearchInput", () => {
  beforeEach(() => {
    mocks.searchUsers.mockReset();
  });

  it("exposes results as a keyboard-operated combobox", async () => {
    const onSelect = vi.fn();
    mocks.searchUsers.mockResolvedValue([
      {
        uid: "user-1",
        displayName: "Alex Rivera",
        username: "alex",
      },
      {
        uid: "user-2",
        displayName: "Ali Chen",
        username: "ali",
      },
    ]);

    render(UserSearchInput, {
      onSelect,
      inlineResults: true,
    });

    const input = page.getByRole("combobox", { name: "Search users" });
    await input.fill("al");
    await new Promise((resolve) => setTimeout(resolve, 350));

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect.element(listbox).toBeInTheDocument();
    await expect.element(input).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(input)
      .toHaveAttribute("aria-controls", listbox.element().id);

    const inputElement = input.element() as HTMLInputElement;
    inputElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      })
    );
    await tick();

    const firstOption = page.getByRole("option", { name: /Alex Rivera/ });
    await expect
      .element(input)
      .toHaveAttribute("aria-activedescendant", firstOption.element().id);
    expect(document.activeElement).toBe(inputElement);

    inputElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      })
    );
    await tick();

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1" })
    );
    await expect.element(input).toHaveAttribute("aria-expanded", "false");
  });

  it("does not replace a newer result set when an older search finishes late", async () => {
    let finishFirstSearch:
      | ((results: Array<{ uid: string; displayName: string }>) => void)
      | undefined;
    mocks.searchUsers
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstSearch = resolve;
          })
      )
      .mockResolvedValueOnce([
        {
          uid: "user-new",
          displayName: "Bowie Stone",
          username: "bowie",
        },
      ]);

    render(UserSearchInput, {
      onSelect: vi.fn(),
      inlineResults: true,
    });

    const input = page.getByRole("combobox", { name: "Search users" });
    await input.fill("al");
    await new Promise((resolve) => setTimeout(resolve, 325));
    await input.fill("bo");
    await new Promise((resolve) => setTimeout(resolve, 350));

    await expect
      .element(page.getByRole("option", { name: /Bowie Stone/ }))
      .toBeInTheDocument();

    finishFirstSearch?.([{ uid: "user-old", displayName: "Alex Rivera" }]);
    await tick();

    expect(
      page.getByRole("option", { name: /Alex Rivera/ }).elements()
    ).toHaveLength(0);
    await expect
      .element(page.getByRole("option", { name: /Bowie Stone/ }))
      .toBeInTheDocument();
  });

  it("cancels a pending search when the query is cleared", async () => {
    const onSelect = vi.fn();
    mocks.searchUsers.mockResolvedValue([
      {
        uid: "user-1",
        displayName: "Alex Rivera",
        username: "alex",
      },
    ]);

    render(UserSearchInput, {
      onSelect,
      inlineResults: true,
    });

    const input = page.getByRole("combobox", { name: "Search users" });
    await input.fill("al");
    await input.fill("");
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(mocks.searchUsers).not.toHaveBeenCalled();
    await expect.element(input).toHaveAttribute("aria-expanded", "false");
    expect(
      page.getByRole("listbox", { name: "Search results" }).elements()
    ).toHaveLength(0);
  });

  it("shows the chosen display name with the unique username", async () => {
    mocks.searchUsers.mockResolvedValue([
      {
        uid: "user-1",
        displayName: "Myst13purple",
        username: "andrewpelarinos",
      },
    ]);

    render(UserSearchInput, {
      onSelect: vi.fn(),
      inlineResults: true,
    });

    const input = page.getByRole("combobox", { name: "Search users" });
    await input.fill("myst");
    await new Promise((resolve) => setTimeout(resolve, 350));

    const option = page.getByRole("option", {
      name: /Myst13purple @andrewpelarinos/,
    });
    await expect.element(option).toBeInTheDocument();
    expect(
      option.element().querySelector(".result-name")?.textContent?.trim()
    ).toBe("Myst13purple");
    expect(
      option.element().querySelector(".result-username")?.textContent?.trim()
    ).toBe("@andrewpelarinos");
  });
});
