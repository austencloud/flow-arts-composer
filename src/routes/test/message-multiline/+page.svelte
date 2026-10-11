<script lang="ts">
  /**
   * Visual harness for the Inbox multiline rendering contract
   * (`2026-07-23-inbox-multiline-message-rendering-design.md`).
   *
   * Mounts the real MessageBubble against fixtures covering every acceptance
   * criterion, so the `white-space: pre-wrap` behavior can be inspected without
   * sending live messages to another person.
   */
  import MessageBubble from "#lib/shared/inbox/components/messages/MessageBubble.svelte";
  import type { Message } from "#lib/shared/messaging/domain/models/message-models.js";
  import { messageHasSequencePreview } from "#lib/shared/inbox/domain/message-link-parts.js";
  import { createSequencePreviewCoordinator } from "#lib/shared/inbox/state/sequence-preview-coordinator.svelte.js";

  const SELF = "self-user";
  const OTHER = "other-user";

  function msg(
    id: string,
    content: string,
    over: Partial<Message> = {}
  ): Message {
    return {
      id,
      conversationId: "harness",
      senderId: over.senderId ?? SELF,
      senderName: over.senderName ?? "Austen",
      content,
      createdAt: new Date("2026-08-02T12:00:00Z"),
      readBy: [],
      ...over,
    };
  }

  const singleBreak = msg("m1", "Line one\nLine two");
  const blankLine = msg("m2", "First paragraph.\n\nSecond paragraph.");
  const edited = msg(
    "m3",
    "First paragraph.\n\nSecond paragraph.\n\nAdded later.",
    {
      editedAt: new Date("2026-08-02T12:05:00Z"),
    }
  );
  const received = msg("m4", "Line one\nLine two", {
    senderId: OTHER,
    senderName: "Paul",
  });
  const group = msg("m5", "Group line one\nGroup line two", {
    senderId: OTHER,
    senderName: "Paul",
  });
  const longWord = msg(
    "m6",
    "Wrapping check: supercalifragilisticexpialidociousandthensomemoreletters_to_force_overflow_behavior"
  );
  const markup = msg(
    "m7",
    "<b>bold?</b>\n<script>alert(1)<\/script>\n& < > \" '"
  );

  const externalLink = msg(
    "m8",
    "Documentation: linkify.js.org/docs/. You can select this whole sentence."
  );

  const sequenceLink = msg(
    "m9",
    "Got this from Fuse and it is very cool!\nhttps://tkaflowarts.com/sequence/YR0L",
    {
      reactions: [{ emoji: "💗", userIds: [SELF] }],
    }
  );

  const sentSequence = msg("m10", "", {
    attachments: [
      {
        type: "sequence",
        url: "/q/YR0L",
        name: "YR0L",
        metadata: {
          sequenceShortCode: "YR0L",
          sequenceWord: "YR0L",
          sequenceStepCount: 8,
        },
      },
    ],
  });

  const caption = msg(
    "m11",
    "Caption line one\nhttps://example.com/reference",
    {
      attachments: [
        {
          type: "image",
          url: "/favicon.png",
          width: 240,
          height: 240,
        } as never,
      ],
    }
  );

  let narrow = $state(false);

  const cases: Array<{
    label: string;
    m: Message;
    own: boolean;
    group?: boolean;
  }> = [
    {
      label: "1. Single Shift+Enter → one line break",
      m: singleBreak,
      own: true,
    },
    { label: "2. Blank line between paragraphs", m: blankLine, own: true },
    { label: "3. Edited message renders identically", m: edited, own: true },
    { label: "4. Received bubble", m: received, own: false },
    { label: "5. Group bubble", m: group, own: false, group: true },
    { label: "6. Long unbroken text wraps", m: longWord, own: true },
    { label: "7. Markup shown literally (escaped)", m: markup, own: true },
    { label: "8. External URL becomes a link", m: externalLink, own: false },
    {
      label: "9. TKA URL gains a sequence preview",
      m: sequenceLink,
      own: false,
    },
    {
      label: "10. Official send uses the same sequence-card size",
      m: sentSequence,
      own: true,
    },
    {
      label: "11. Attachment caption links and preserves breaks",
      m: caption,
      own: true,
    },
  ];

  const messagesById = new Map(cases.map(({ m }) => [m.id, m] as const));
  const sequencePreviewCoordinator = createSequencePreviewCoordinator({
    isMessageAvailable: (messageId) => {
      const message = messagesById.get(messageId);
      return Boolean(message && messageHasSequencePreview(message));
    },
  });
</script>

<div class="harness" class:narrow>
  <header>
    <h1>Inbox multiline rendering</h1>
    <button onclick={() => (narrow = !narrow)}>
      {narrow ? "Wide" : "Narrow"} bubbles
    </button>
  </header>

  {#each cases as c (c.m.id)}
    <section>
      <h2>{c.label}</h2>
      <div class="stage" data-case={c.m.id}>
        <MessageBubble
          message={c.m}
          isOwn={c.own}
          currentUserId={SELF}
          isGroup={c.group ?? false}
          senderInfo={c.group
            ? ({ id: OTHER, displayName: "Paul" } as never)
            : undefined}
          sequencePlaybackActive={sequencePreviewCoordinator.isPlaybackActive(
            c.m.id
          )}
          sequencePlaybackMounted={sequencePreviewCoordinator.isPlayerMounted(
            c.m.id
          )}
          onSequencePlaybackRequest={() =>
            sequencePreviewCoordinator.requestPlayback(c.m.id)}
        />
      </div>
    </section>
  {/each}
</div>

<style>
  .harness {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: #0d0f14;
    color: #e8ecf3;
    min-height: 100vh;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  h1 {
    font-size: 1.5rem;
    margin: 0;
  }
  h2 {
    font-size: 0.9rem;
    font-weight: 500;
    opacity: 0.7;
    margin: 0 0 0.5rem;
  }
  button {
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 0.5rem;
    border: 1px solid #3a4356;
    background: #1a1f2b;
    color: inherit;
    cursor: pointer;
  }
  .stage {
    max-width: 42rem;
    border: 1px dashed #2a3142;
    border-radius: 0.75rem;
    padding: 0.75rem;
  }
  .narrow .stage {
    max-width: 18rem;
  }
</style>
