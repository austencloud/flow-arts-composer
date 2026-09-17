<!--
  SendSequenceWorkspace.svelte

  The viewer's recipient column. In send mode the stage keeps showing the
  view the person is sending from (Card, Motion, side by side, whichever they
  chose) and this column takes the inspector track: the recipients fill it,
  the note and Send sit docked at its foot. Stacked on a phone, the same
  column docks under the stage.

  The selection and delivery rules are SendAttachmentState, shared with the
  inbox drawer's send sheet; this file is only the viewer-sized presentation.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import SendDestinationPicker from "$lib/shared/inbox/components/messages/SendDestinationPicker.svelte";
  import {
    getRegisteredMessageDeliveryState,
    onMessageDeliveryRegistered,
  } from "$lib/shared/inbox/context/message-delivery-context";
  import type { PendingMessageAttachment } from "$lib/shared/inbox/domain/pending-message-attachment";
  import {
    createSendAttachmentState,
    SEND_MESSAGE_MAX,
  } from "$lib/shared/inbox/state/send-attachment-state.svelte";
  import type { SequenceSendSession } from "$lib/shared/inbox/state/send-sequence-state.svelte";
  import { onMount } from "svelte";

  interface Props {
    session: SequenceSendSession;
    /** The outbox accepted it for these conversations, in queue order. */
    onSent: (conversationIds: string[]) => void;
    /** Cancel, or a guest tapping Send: leave send mode. */
    onCancel: () => void;
  }

  let { session, onSent, onCancel }: Props = $props();

  let hapticService: HapticFeedback | undefined;
  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // The drawer registers the one live outbox. The standalone route mounts
  // the drawer lazily (the session asked for it), so the outbox can land
  // after this workspace does; Send stays disabled until it has.
  let delivery = $state.raw(getRegisteredMessageDeliveryState());
  $effect(() =>
    onMessageDeliveryRegistered((state) => {
      delivery = state;
    })
  );

  const attachment = $derived<PendingMessageAttachment>({
    type: "sequence",
    payload: session.payload,
  });

  const send = createSendAttachmentState(
    {
      getAttachment: () => attachment,
      onSent,
      onGuestBlocked: onCancel,
    },
    {
      // Forwarded, not captured: the outbox may register after this mounts.
      delivery: {
        queueMessage: (...args) => {
          if (!delivery) {
            return Promise.reject(
              new Error("Message outbox is not available.")
            );
          }
          return delivery.queueMessage(...args);
        },
      },
      getHaptics: () => hapticService,
    }
  );

  const canSend = $derived(send.canSend && !!delivery);
</script>

<div class="send-workspace" aria-busy={send.sending}>
  <!-- The recipients own the height between the top of the column and the
       bar; the picker scrolls its own list inside that. -->
  <div class="recipients">
    <SendDestinationPicker state={send} />
  </div>

  <div class="send-bar">
    <div class="note-field">
      <textarea
        class="note-input"
        bind:value={send.message}
        aria-label="Note (optional)"
        placeholder="Add a note"
        maxlength={SEND_MESSAGE_MAX}
        rows={1}
        disabled={send.sending}
      ></textarea>
      <span
        class="char-count"
        class:visible={send.message.length > SEND_MESSAGE_MAX * 0.8}
        aria-hidden={send.message.length <= SEND_MESSAGE_MAX * 0.8}
      >
        {send.message.length}/{SEND_MESSAGE_MAX}
      </span>
    </div>
    <button
      type="button"
      class="send-button"
      onclick={send.send}
      disabled={!canSend}
    >
      <i
        class="fas {send.sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}"
        aria-hidden="true"
      ></i>
      <span>{send.sending ? "Sending…" : send.sendLabel}</span>
    </button>
  </div>
</div>

<style>
  /* One column: the recipients take the definite room, the bar is
     max-content so a fr sibling cannot drive it to zero. */
  .send-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) max-content;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 1rem;
    box-sizing: border-box;
    overflow: hidden;
  }

  .recipients {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* The column is a list's width, not a stage's: the note runs the full
     width and Send sits under it, so neither is squeezed beside the other. */
  .send-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.625rem;
    min-width: 0;
  }

  .note-field {
    position: relative;
    display: grid;
    min-width: 0;
  }

  /* One line until typed into; grows to a few, then scrolls. */
  .note-input {
    width: 100%;
    min-height: 3rem;
    max-height: 7.5rem;
    padding: 0.75rem;
    resize: none;
    field-sizing: content;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-base, 1rem);
    line-height: 1.35;
  }

  .note-input::placeholder {
    color: var(--theme-text-dim);
  }

  .note-input:focus {
    border-color: var(--theme-accent, var(--semantic-info));
    outline: none;
    box-shadow: 0 0 0 2px
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 22%,
        transparent
      );
  }

  .note-input:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .char-count {
    position: absolute;
    right: 0.75rem;
    bottom: 0.5rem;
    pointer-events: none;
    visibility: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .char-count.visible {
    visibility: visible;
  }

  .send-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    min-height: 3rem;
    padding: 0.75rem 1.25rem;
    background: var(--theme-accent, var(--semantic-info));
    border: 1px solid transparent;
    border-radius: 0.875rem;
    color: white;
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 800;
    cursor: pointer;
    transition:
      filter var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease,
      opacity var(--duration-fast, 150ms) ease;
  }

  .send-button:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  .send-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .send-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .send-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .send-button {
      transition: none;
    }
  }
</style>
