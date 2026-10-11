<script lang="ts">
  /**
   * Harness for SendAttachmentSheet at every drawer width.
   *
   * The sheet is only reachable in the real app behind auth + an inbox drawer +
   * a staged attachment, which makes the layout impossible to inspect at the
   * widths that matter. This renders the REAL component (not a mockup) inside a
   * box the same shape the drawer gives it, so the container queries it depends
   * on resolve exactly as they do in production.
   */
  import SendAttachmentSheet from "#lib/shared/inbox/components/messages/SendAttachmentSheet.svelte";
  import { inboxState } from "#lib/shared/inbox/state/inbox-state.svelte.js";
  import type { ConversationPreview } from "#lib/shared/messaging/domain/models/conversation-models.js";
  import type { PendingMessageAttachment } from "#lib/shared/inbox/domain/pending-message-attachment.js";

  const NAMES = [
    "Adam Molski",
    "Flow Taco",
    "Nicholas Leonardi",
    "Cirque Aflame",
    "Rowan Vale",
    "Priya Raman",
  ];

  const conversations: ConversationPreview[] = NAMES.map((name, index) => ({
    id: `conversation-${index}`,
    type: "direct" as const,
    otherParticipant: {
      userId: `u${index}`,
      displayName: name,
      joinedAt: new Date(2026, 0, 15),
    },
    unreadCount: index % 3,
    updatedAt: new Date(2026, 6, 30 - index),
    lastMessage: {
      content: index % 2 ? "Sent an image" : "Check out this sequence",
      senderId: `u${index}`,
      senderName: name,
      createdAt: new Date(2026, 6, 30 - index),
      hasAttachment: true,
    },
  }));

  inboxState.conversations = conversations;

  // A stand-in for the shared photo: a real File, so the sheet's object-URL
  // preview path runs rather than the fallback icon.
  function probeImage(): File {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 2340; // A phone screenshot: the aspect ratio that matters.
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 1080, 2340);
      gradient.addColorStop(0, "#5b5bd6");
      gradient.addColorStop(1, "#12b981");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 2340);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 160px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TKA", 540, 1220);
    }
    // Real PNG bytes, not the data-URL string: a File holding the string is a
    // valid File whose contents are not an image, so the preview silently
    // renders a broken <img> and the layout you are checking is a lie.
    const binary = atob(canvas.toDataURL("image/png").split(",")[1] ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], "screenshot.png", { type: "image/png" });
  }

  const attachment: PendingMessageAttachment = $state.raw({
    type: "image",
    file: probeImage(),
    messageId: "m1",
    attachmentId: "a1",
  });

  // The widths the drawer actually produces. --sheet-width is
  // min(clamp(30rem, 28vw, 64rem), 95vw), and 100% under the 768px seam.
  const WIDTHS = [
    { label: "Phone / drawer full width", width: 375, height: 720 },
    { label: "Z Fold unfolded portrait (707 CSS px)", width: 707, height: 823 },
    // Landscape used to fall past the 768px seam into a 480px side panel; the
    // drawer is full-bleed on any handheld now, so the sheet gets all 823px.
    { label: "Z Fold unfolded landscape (823 CSS px)", width: 823, height: 707 },
    { label: "1920 desktop drawer (537px)", width: 537, height: 900 },
    { label: "2560 desktop drawer (717px)", width: 717, height: 900 },
    { label: "3840 desktop drawer (1024px)", width: 1024, height: 900 },
  ];
</script>

<div class="harness">
  {#each WIDTHS as spec (spec.label)}
    <section>
      <h2>{spec.label} — {spec.width}px</h2>
      <div
        class="drawer-sim"
        style="width: {spec.width}px; height: {spec.height}px;"
      >
        <SendAttachmentSheet {attachment} onSent={() => {}} />
      </div>
    </section>
  {/each}
</div>

<style>
  .harness {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    align-items: start;
    padding: 2rem;
    background: #0f1117;
  }

  h2 {
    margin: 0 0 0.5rem;
    color: #cbd5e1;
    font: 600 0.875rem system-ui, sans-serif;
  }

  .drawer-sim {
    overflow: hidden;
    background: var(--theme-panel-bg, #161a23);
    border: 1px solid #2b3242;
    border-radius: 0.75rem;
  }
</style>
