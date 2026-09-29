import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import WorkspaceShareControl from "./WorkspaceShareControl.svelte";

type ShareControlProps = ComponentProps<typeof WorkspaceShareControl>;

// Read the labels from the catalog the component renders, so a copy change
// in messages/en.json can't break these order checks. The order is the contract.
function shareActionLabels(): string[] {
  return [
    t("viewer_ui_send_sequence"),
    t("create_workspace_share_card"),
    t("share_copy_link"),
    t("share_download_card"),
  ];
}

function createProps(
  overrides: Partial<ShareControlProps> = {}
): ShareControlProps {
  return {
    useMobileSheet: false,
    disabled: false,
    tooltip: "Share sequence",
    cardPhase: "ready" as const,
    linkPhase: "ready" as const,
    isSharing: false,
    isCopyingLink: false,
    linkCopied: false,
    awaitingFreshGesture: false,
    canShareCard: true,
    onTriggerClick: vi.fn(),
    onShareCard: vi.fn(),
    onSendSequence: vi.fn(),
    onCopyLink: vi.fn(),
    onDownloadCard: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceShareControl", () => {
  it("uses one desktop Share trigger for every outbound action", async () => {
    render(WorkspaceShareControl, createProps());

    expect(
      document.querySelectorAll('[data-testid="workspace-share-button"]')
    ).toHaveLength(1);

    const trigger = page.getByRole("button", { name: t("share_sequence") });
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await expect
      .element(page.getByRole("button", { name: "More share options" }))
      .not.toBeInTheDocument();

    await trigger.click();

    expect(
      Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) =>
        item.textContent?.trim()
      )
    ).toEqual(shareActionLabels());
  });

  it("opens the same share actions without an account gate", async () => {
    render(WorkspaceShareControl, createProps());

    await page.getByRole("button", { name: t("share_sequence") }).click();

    await expect
      .element(page.getByRole("menu", { name: t("share_sequence") }))
      .toBeInTheDocument();
    await expect
      .element(
        page.getByText(t("create_workspace_share_card"), { exact: true })
      )
      .toBeInTheDocument();
  });

  it("uses the same ordered action list in the mobile sheet", async () => {
    const onSendSequence = vi.fn();
    render(
      WorkspaceShareControl,
      createProps({
        useMobileSheet: true,
        onSendSequence,
      })
    );

    const trigger = page.getByRole("button", { name: t("share_sequence") });
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await trigger.click();

    const sheet = page.getByRole("dialog", { name: t("share_sequence") });
    await expect.element(sheet).toBeInTheDocument();

    expect(
      Array.from(document.querySelectorAll(".share-action-sheet-item")).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(shareActionLabels());

    await page.getByRole("button", { name: "Close share options" }).click();
    await expect.element(trigger).toHaveFocus();

    await trigger.click();
    await page
      .getByRole("button", { name: t("viewer_ui_send_sequence") })
      .click();
    expect(onSendSequence).toHaveBeenCalledOnce();
  });
});
