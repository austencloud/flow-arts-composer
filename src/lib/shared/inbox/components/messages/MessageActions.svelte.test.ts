import { createRawSnippet } from "svelte";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "#lib/shared/messaging/domain/models/message-models.js";
import { messagingService } from "#lib/shared/messaging/services/messenger.js";
import MessageActions from "./MessageActions.svelte";

const mockLayoutState = vi.hoisted(() => ({ isSideBySideLayout: true }));
const clipboardWrite = vi.fn();

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: clipboardWrite },
});

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

vi.mock("#lib/shared/layout/layout-state.svelte.js", () => ({
  layoutState: mockLayoutState,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    isAuthenticated: true,
    loading: false,
    isAdmin: false,
  },
}));

vi.mock("#lib/shared/messaging/services/messenger.js", () => ({
  messagingService: {
    toggleReaction: vi.fn(),
    deleteMessage: vi.fn(),
  },
}));

vi.mock("../../state/inbox-state.svelte", () => ({
  inboxState: {
    setReplyTo: vi.fn(),
    setEditingMessage: vi.fn(),
  },
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const message: Message = {
  id: "message-1",
  conversationId: "conversation-1",
  senderId: "other-user",
  senderName: "Morgan",
  content: "Selectable text",
  createdAt: new Date("2026-08-12T12:00:00Z"),
  readBy: [],
};

function dispatchTouch(
  target: Element,
  type: "touchstart" | "touchmove" | "touchend",
  touches: Array<{ clientX: number; clientY: number }>
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  target.dispatchEvent(event);
}

describe("MessageActions selection boundary", () => {
  beforeEach(() => {
    mockLayoutState.isSideBySideLayout = true;
    clipboardWrite.mockReset();
    clipboardWrite.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it("keeps the native context menu and text selection inside message copy", () => {
    const children = createRawSnippet(() => ({
      render: () =>
        '<p data-message-selectable="true">Selectable message copy</p>',
    }));

    render(MessageActions, { message, isOwn: false, children });

    const wrapper = document.querySelector<HTMLElement>(".message-wrapper");
    const selectable = document.querySelector<HTMLElement>(
      '[data-message-selectable="true"]'
    );
    expect(wrapper).not.toBeNull();
    expect(selectable).not.toBeNull();
    expect(getComputedStyle(selectable!).userSelect).toBe("text");

    const textMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    selectable!.dispatchEvent(textMenu);
    expect(textMenu.defaultPrevented).toBe(false);

    const bubbleMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    wrapper!.dispatchEvent(bubbleMenu);
    expect(bubbleMenu.defaultPrevented).toBe(true);
  });

  it("opens a contained action sheet from a touch hold and isolates text selection", async () => {
    mockLayoutState.isSideBySideLayout = false;
    const children = createRawSnippet(() => ({
      render: () =>
        '<article role="article"><div data-message-action-anchor="true"><p data-message-selectable="true"><a href="https://example.com" data-message-link="true">Hold this message</a></p></div></article>',
    }));

    render(MessageActions, { message, isOwn: false, children });

    const link = document.querySelector<HTMLAnchorElement>(
      '[data-message-link="true"]'
    );
    const triggerElement = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Actions for message from Morgan"]'
    );
    expect(link).not.toBeNull();
    expect(triggerElement).not.toBeNull();
    const linkActivated = vi.fn();
    link!.addEventListener("click", linkActivated);

    dispatchTouch(link!, "touchstart", [{ clientX: 120, clientY: 220 }]);
    await new Promise((resolve) => setTimeout(resolve, 425));

    const actionSheet = page.getByRole("dialog", { name: "Message actions" });
    await expect.element(actionSheet).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Reply" }))
      .toBeVisible();
    expect(triggerElement!.getAttribute("aria-expanded")).toBe("true");

    // Drawer starts below the viewport and needs one transition to settle.
    // The stable box is the contract that prevents the old clipped popup.
    await new Promise((resolve) => setTimeout(resolve, 425));
    const sheetElement = document.querySelector<HTMLDialogElement>(
      ".message-action-sheet"
    );
    expect(sheetElement).not.toBeNull();
    const bounds = sheetElement!.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);

    dispatchTouch(link!, "touchend", []);
    const postHoldClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    link!.dispatchEvent(postHoldClick);
    expect(postHoldClick.defaultPrevented).toBe(true);
    expect(linkActivated).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Select text" }).click();
    await expect
      .element(page.getByRole("dialog", { name: "Select text" }))
      .toBeVisible();

    const selectionSurface = page.getByRole("textbox", {
      name: "Message text to select",
    });
    await expect.element(selectionSurface).toHaveValue(message.content);
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-message-selection-surface="true"]'
    );
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange(0, 10);
    textarea!.dispatchEvent(new Event("select", { bubbles: true }));

    const copySelection = page.getByRole("button", {
      name: "Copy selection",
    });
    await expect.element(copySelection).toBeEnabled();
    await copySelection.click();
    expect(clipboardWrite).toHaveBeenCalledWith("Selectable");
  });

  it("cancels the touch hold when the conversation starts scrolling", async () => {
    mockLayoutState.isSideBySideLayout = false;
    const children = createRawSnippet(() => ({
      render: () =>
        '<article role="article"><div data-message-action-anchor="true"><p data-message-selectable="true">Scroll past this message</p></div></article>',
    }));

    render(MessageActions, { message, isOwn: false, children });

    const selectable = document.querySelector<HTMLElement>(
      '[data-message-selectable="true"]'
    );
    expect(selectable).not.toBeNull();
    dispatchTouch(selectable!, "touchstart", [{ clientX: 120, clientY: 220 }]);
    dispatchTouch(selectable!, "touchmove", [{ clientX: 121, clientY: 244 }]);
    await new Promise((resolve) => setTimeout(resolve, 425));

    expect(
      document.querySelector<HTMLDialogElement>(".message-action-sheet")
    ).toBeNull();
  });

  it("opens the existing menu and keeps reactions directly actionable", async () => {
    const children = createRawSnippet(() => ({
      render: () =>
        '<article role="article"><div data-message-action-anchor="true"><p data-message-selectable="true">Selectable message copy</p></div></article>',
    }));

    render(MessageActions, { message, isOwn: false, children });

    const trigger = page.getByRole("button", {
      name: "Actions for message from Morgan",
    });
    const triggerElement = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Actions for message from Morgan"]'
    );
    expect(triggerElement).not.toBeNull();
    expect(getComputedStyle(triggerElement!).opacity).toBe("0");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");

    triggerElement!.focus();
    await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).toBeVisible();

    await trigger.click();

    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(page.getByRole("menu", { name: "Message actions" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: "Copy" }))
      .toBeVisible();
    expect(document.querySelector(".reaction-bar")).toBeNull();
    const heartReaction = page.getByRole("menuitem", {
      name: "React with ❤️",
    });
    await expect.element(heartReaction).toBeVisible();

    await heartReaction.click();

    expect(messagingService.toggleReaction).toHaveBeenCalledWith(
      "conversation-1",
      "message-1",
      "❤️"
    );
  });
});
