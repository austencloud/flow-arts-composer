import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shareButtonSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/workspace-panel/shared/components/buttons/ShareButton.svelte"
  ),
  "utf8"
);
const shareControlSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/workspace-panel/shared/components/buttons/WorkspaceShareControl.svelte"
  ),
  "utf8"
);
const sharedShareMenuSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/share/components/ShareActionMenu.svelte"
  ),
  "utf8"
);
const sendSequenceStateSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/inbox/state/send-sequence-state.svelte.ts"
  ),
  "utf8"
);

describe("Create workspace share control contract", () => {
  it("uses one Share trigger for the desktop menu and mobile sheet", () => {
    expect(shareControlSource).toContain('testId="workspace-share-button"');
    expect(shareControlSource).toContain('ariaLabel="Share sequence"');
    expect(sharedShareMenuSource).toContain("data-testid={testId}");
    expect(shareControlSource).not.toContain("More share options");
    expect(shareControlSource).not.toContain("workspace-share-options-button");
    expect(shareControlSource).toContain("<ShareActionMenu");
    expect(sharedShareMenuSource).toContain("<DropdownMenu.Root");
    expect(sharedShareMenuSource).toContain("<Drawer");
    expect(sharedShareMenuSource).toContain('role="status"');
    expect(sharedShareMenuSource).toContain('aria-live="polite"');
  });

  it("keeps one ordered action model across both presentations", () => {
    const actionsStart = shareControlSource.indexOf(
      "const actions = $derived.by"
    );
    const actionsEnd = shareControlSource.indexOf(
      "const statusMessage",
      actionsStart
    );
    const actionModel = shareControlSource.slice(actionsStart, actionsEnd);
    const send = actionModel.indexOf('id: "send-sequence"');
    const share = actionModel.indexOf("cardAction");
    const copy = actionModel.indexOf('id: "copy-link"');
    const download = actionModel.indexOf('id: "download-card"');

    expect(send).toBeGreaterThan(-1);
    expect(share).toBeGreaterThan(send);
    expect(copy).toBeGreaterThan(share);
    expect(download).toBeGreaterThan(copy);
    expect(shareControlSource).toContain("Preparing Card…");
    expect(shareControlSource).toContain("Share Card…");
    expect(shareControlSource).toContain("Share Card Unavailable");
    expect(shareControlSource).toContain("Try Preparing Card Again");
    expect(shareControlSource).toContain(
      "getWorkspaceCardMenuAction(cardPhase, canShareCard)"
    );
  });

  it("uses the existing inbox sequence flow for the send action", () => {
    expect(shareControlSource).toContain('label: "Send Sequence"');
    expect(shareControlSource).toContain('icon: "fa-paper-plane"');
    expect(shareButtonSource).toContain(
      'from "$lib/shared/inbox/state/send-sequence-state.svelte"'
    );
    expect(shareButtonSource).toContain(
      "...buildSequenceSharePayload(currentSequence)"
    );
    expect(shareButtonSource).toContain("sequencePreviewBlob: card.blob");
    expect(shareButtonSource).toContain("openSendSequenceSheet({");
  });

  it("gates account-only share actions behind a full account", () => {
    expect(shareButtonSource).toContain(
      "const hasFullAccount = $derived(authState.isFullAccount)"
    );
    expect(shareButtonSource).toContain(
      'authDrawerState.show("signup", "share-sequence")'
    );
    expect(shareButtonSource).toContain("if (!fullAccount || !menuOpen");
    expect(shareButtonSource).toContain(
      "if (!requireFullAccount() || controlDisabled || !sequence || !cardKey)"
    );
    expect(sendSequenceStateSource).toContain("if (!authState.isFullAccount)");
    expect(sendSequenceStateSource).toContain(
      'authDrawerState.show("signup", "share-sequence")'
    );
    expect(shareButtonSource).toContain(
      "if (!requireFullAccount() || controlDisabled) return"
    );
    expect(shareControlSource).toContain("canOpen={true}");
    expect(shareButtonSource).toContain("onDirectOpen={openPostSheet}");
    expect(shareButtonSource).toContain("canCreateLink={hasFullAccount}");
    expect(shareButtonSource).toContain(
      "onSendInTka={hasFullAccount ? sendSequenceToInbox : undefined}"
    );
  });

  it("prepares signed-in actions on open and preserves fresh browser gestures", () => {
    expect(shareButtonSource).toContain(
      "Opening either presentation prepares its signed-in actions"
    );
    expect(shareButtonSource).toContain(".prepareCard(");
    expect(shareButtonSource).toContain(".prepareLink(");

    const handlerStart = shareButtonSource.indexOf(
      "function handleCopyLink(): void"
    );
    // End at the next top-level function so later async helpers in the file
    // cannot leak into the handler under test.
    const nextFunction = /\n {2}(?:async )?function /g;
    nextFunction.lastIndex = handlerStart + 1;
    const handlerEnd = nextFunction.exec(shareButtonSource)?.index ?? -1;
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = shareButtonSource.slice(handlerStart, handlerEnd);

    expect(handler).toContain(
      "navigator.clipboard.writeText(preparedLink.url)"
    );
    expect(handler).not.toContain("await ");
  });

  it("keeps native share failure separate from explicit download", () => {
    const shareStart = shareButtonSource.indexOf("function sharePreparedCard");
    const downloadStart = shareButtonSource.indexOf(
      "async function downloadPreparedCard"
    );
    const shareHandler = shareButtonSource.slice(shareStart, downloadStart);

    expect(shareHandler).toContain("shareBlobNatively(");
    expect(shareHandler).not.toContain("downloadBlobToDisk(");
    expect(shareHandler).toContain('result.status === "canceled"');
  });

  it("uses scoped styling and current accessibility media queries", () => {
    expect(sharedShareMenuSource).toContain(".share-action-trigger");
    expect(sharedShareMenuSource).toContain(
      ".share-action-sheet-item:focus-visible"
    );
    expect(sharedShareMenuSource).toContain("@media (prefers-contrast: more)");
    expect(sharedShareMenuSource).toContain("@media (forced-colors: active)");
    expect(sharedShareMenuSource).toContain(
      "@media (prefers-reduced-motion: reduce)"
    );
    expect(sharedShareMenuSource).not.toContain("prefers-contrast: high");
  });
});
