<!--
  SendSequenceWorkspace.svelte

  The viewer in send mode. Like Practice, the whole workspace morphs into one
  decision: who gets this. The card the person is sending fills the stage,
  the recipients take the column the inspector normally has, and the note and
  Send sit in a bar across the bottom. Nothing else competes for the room.

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

  const cardUrl = $derived(
    session.previewBlob ? URL.createObjectURL(session.previewBlob) : null
  );
  $effect(() => {
    const url = cardUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
  const word = $derived(session.payload.sequence.word);
  const canSend = $derived(send.canSend && !!delivery);
</script>

<div class="send-workspace" aria-busy={send.sending}>
  <!-- Two boxes: the outer is the container the queries read, the inner is
       the grid they lay out. A container query never matches the container
       itself, only its descendants. -->
  <div class="send-grid">
    <!-- The card IS the thing being sent; the stage shows it as it will arrive.
       Its settings live on the Card pane, not here: choosing who must not
       change what. -->
    <section class="card-stage" aria-label="Card being sent">
      <div class="card-frame">
        {#if cardUrl}
          <img
            src={cardUrl}
            alt={`Choreo card for ${word}`}
            class="card-image"
          />
        {:else if session.previewPending}
          <div class="card-status" role="status">
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            <span>Preparing card…</span>
          </div>
        {:else}
          <div class="card-status" role="status">
            <i class="fas fa-layer-group" aria-hidden="true"></i>
            <span>The card could not be drawn. The sequence still sends.</span>
          </div>
        {/if}
      </div>
    </section>

    <aside class="recipients" aria-label="Recipients">
      <SendDestinationPicker state={send} />
    </aside>

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
</div>

<style>
  .send-workspace {
    /* `size`, not inline-size: the stacked layout caps the card in cqh, and
       the layer above fixes this box's height, so containment costs nothing. */
    container-type: size;
    container-name: send-workspace;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .send-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    /* The bar row is max-content, not auto: an auto row in a definite-height
       grid floors at its items' minimum contribution, which a fr sibling can
       drive to zero. */
    grid-template-rows: minmax(0, auto) minmax(0, 1fr) max-content;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0.75rem;
    box-sizing: border-box;
    overflow: hidden;
  }

  .card-stage {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
  }

  /* Reserved at the card's own 6:5 before the render lands, so the stage does
     not jump when the image replaces the status. Sized from the height the
     stage gives it, so a wide stage never pushes the card past the bar. The
     sharer draws 960px; a third over that reads fine on a wide monitor and
     stops the card being an island on one. */
  .card-frame {
    display: grid;
    place-items: center;
    height: 100%;
    width: auto;
    max-width: min(100%, 1280px);
    aspect-ratio: 6 / 5;
    min-width: 0;
    min-height: 0;
  }

  /* Fills the frame rather than sitting at its natural size, so the frame's
     clamp is the one that decides how large the card draws. */
  .card-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 0.75rem;
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.35);
  }

  .card-status {
    display: grid;
    place-items: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-xl, 1.25rem);
    text-align: center;
  }

  .card-status span {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .recipients {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .send-bar {
    display: flex;
    align-items: end;
    gap: 0.75rem;
    min-width: 0;
  }

  .note-field {
    position: relative;
    display: grid;
    flex: 1;
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
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    min-width: 11rem;
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

  /* Stacked (a phone, or a narrow embed): the card takes what a landscape
     6:5 needs and no more than two fifths of the height, the list scrolls
     under it, the bar stays docked. */
  @container send-workspace (max-width: 55.999rem) {
    .card-stage {
      max-height: 40cqh;
    }

    .card-frame {
      max-height: 40cqh;
    }

    .send-button {
      min-width: 0;
    }
  }

  /* Side by side: the card owns the stage, the recipients take a column at
     the width the viewer's inspector uses, the bar spans both. */
  @container send-workspace (min-width: 56rem) {
    .send-grid {
      grid-template-columns: minmax(0, 1fr) clamp(20rem, 28cqw, 30rem);
      grid-template-rows: minmax(0, 1fr) max-content;
      column-gap: 1rem;
      padding: 1rem;
    }

    .card-stage {
      grid-row: 1;
      grid-column: 1;
    }

    .recipients {
      grid-row: 1;
      grid-column: 2;
    }

    .send-bar {
      grid-row: 2;
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .send-button {
      transition: none;
    }
  }
</style>
