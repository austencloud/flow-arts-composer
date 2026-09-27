import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

import MessageReactions from "./MessageReactions.svelte";

describe("MessageReactions", () => {
  it("keeps every visible reaction independently actionable", async () => {
    const onToggleReaction = vi.fn();

    render(MessageReactions, {
      reactions: [
        { emoji: "💗", userIds: ["one"] },
        { emoji: "😂", userIds: ["one", "two"] },
      ],
      onToggleReaction,
    });

    await page
      .getByRole("button", { name: "React with 💗. Reactions: 1." })
      .click();
    await page
      .getByRole("button", { name: "React with 😂. Reactions: 2." })
      .click();

    expect(onToggleReaction).toHaveBeenNthCalledWith(1, "💗");
    expect(onToggleReaction).toHaveBeenNthCalledWith(2, "😂");
  });

  it("exposes the current user's reaction as a pressed toggle", async () => {
    render(MessageReactions, {
      reactions: [{ emoji: "💗", userIds: ["me"] }],
      currentUserId: "me",
      onToggleReaction: vi.fn(),
    });

    await expect
      .element(page.getByRole("button", { name: "Remove 💗 reaction. Reactions: 1." }))
      .toHaveAttribute("aria-pressed", "true");
  });
});
