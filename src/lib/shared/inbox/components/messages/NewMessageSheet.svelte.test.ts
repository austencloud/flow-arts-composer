import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewMessageSheet from "./NewMessageSheet.svelte";

const mocks = vi.hoisted(() => ({
  getFollowing: vi.fn(),
  getOrCreateConversation: vi.fn(),
  getOrCreateGroupConversation: vi.fn(),
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { user: { uid: "current-user" } },
}));

vi.mock("#lib/shared/community/services/user-repository.js", () => ({
  getFollowing: mocks.getFollowing,
}));

vi.mock("#lib/shared/messaging/services/conversation-manager.js", () => ({
  conversationService: {
    getOrCreateConversation: mocks.getOrCreateConversation,
    getOrCreateGroupConversation: mocks.getOrCreateGroupConversation,
  },
}));

vi.mock("../../state/inbox-state.svelte", () => ({
  inboxState: { conversations: [] },
}));

describe("NewMessageSheet group creation", () => {
  beforeEach(() => {
    mocks.getFollowing.mockReset();
    mocks.getFollowing.mockResolvedValue([
      { id: "user-1", displayName: "Alex Rivera", username: "alex" },
      { id: "user-2", displayName: "Bowie Stone", username: "bowie" },
    ]);
    mocks.getOrCreateConversation.mockReset();
    mocks.getOrCreateGroupConversation.mockReset();
    mocks.getOrCreateGroupConversation.mockResolvedValue({
      conversation: { id: "group-1" },
      isNew: true,
    });
  });

  it("requires a name and at least two other participants", async () => {
    const onConversationCreated = vi.fn();

    render(NewMessageSheet, {
      groupMode: true,
      onConversationCreated,
      onCancel: vi.fn(),
    });

    await page.getByRole("button", { name: /Alex Rivera @alex/ }).click();

    const groupName = page.getByRole("textbox", { name: /Group name/ });
    const startGroup = page.getByRole("button", { name: "Start Group" });
    await groupName.fill("Fire Jam");
    await expect.element(startGroup).toBeDisabled();

    await page.getByRole("button", { name: /Bowie Stone @bowie/ }).click();
    await expect.element(startGroup).toBeEnabled();
    await startGroup.click();

    await vi.waitFor(() => {
      expect(mocks.getOrCreateGroupConversation).toHaveBeenCalledWith(
        ["user-1", "user-2"],
        "Fire Jam"
      );
    });

    expect(mocks.getOrCreateConversation).not.toHaveBeenCalled();
    expect(onConversationCreated).toHaveBeenCalledWith("group-1");
  });
});
