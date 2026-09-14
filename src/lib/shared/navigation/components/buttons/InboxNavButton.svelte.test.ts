import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, expect, it, vi } from "vitest";
import InboxNavButton from "./InboxNavButton.svelte";

const { open } = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("$lib/shared/inbox/state/inbox-state.svelte", () => ({
  inboxState: { totalUnreadCount: 2, open },
}));
vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

beforeEach(() => open.mockClear());

it("opens once per native Enter or Space activation with a single keyboard target", async () => {
  render(InboxNavButton);
  const button = page.getByRole("button", {
    name: "Open inbox, 2 unread",
    exact: true,
  });
  button.element().focus();
  await userEvent.keyboard("{Enter}");
  expect(open).toHaveBeenCalledTimes(1);
  await userEvent.keyboard(" ");
  expect(open).toHaveBeenCalledTimes(2);
  expect(
    document.querySelectorAll("button, [role=button][tabindex='0']")
  ).toHaveLength(1);
});
