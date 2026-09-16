<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
  import { inboxState } from "../../state/inbox-state.svelte";
  import {
    createSendAttachmentState,
    SEND_MESSAGE_MAX,
  } from "../../state/send-attachment-state.svelte";
  import { getMessageDeliveryContext } from "../../context/message-delivery-context";
  import SendDestinationPicker from "./SendDestinationPicker.svelte";

  interface Props {
    attachment: PendingMessageAttachment;
    /** Prefilled note. Share intake passes the shared text that was not a code. */
    initialNote?: string;
    /**
     * The conversations that accepted it into their outbox, in queue order.
     * Plural because one share can now go to several people; a partial success
     * reports only the durable entries that were created.
     */
    onSent: (conversationIds: string[]) => void;
  }

  let { attachment, initialNote = "", onSent }: Props = $props();

  let hapticService: HapticFeedback | undefined;
  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // A Direct Share tap names the conversation before this sheet ever renders.
  //
  // Reads shareAttachmentConversationId, NOT pendingConversationId. The latter
  // means "navigate to this thread" and InboxDrawer owns it - its effect would
  // pull us out of this sheet and drop the attachment. An earlier revision won
  // that race by claiming the field at init; a dedicated field means there is no
  // race to win.
  const send = createSendAttachmentState(
    {
      getAttachment: () => attachment,
      initialNote,
      onSent: (ids) => onSent(ids),
      onGuestBlocked: () => inboxState.cancelSequenceShare(),
      directShareConversationId: inboxState.shareAttachmentConversationId,
    },
    {
      delivery: getMessageDeliveryContext(),
      getHaptics: () => hapticService,
    }
  );

  // Naming this `payload` is what keeps the payload.* references in this file
  // working across the generalization.
  const payload = $derived(
    attachment.type === "sequence" ? attachment.payload : null
  );
  const image = $derived(attachment.type === "image" ? attachment : null);
  let thumbnailFailed = $state(false);

  const imagePreviewUrl = $derived(
    image ? URL.createObjectURL(image.file) : null
  );
  const sequencePreviewUrl = $derived(
    payload?.sequencePreviewBlob
      ? URL.createObjectURL(payload.sequencePreviewBlob)
      : null
  );
  // While the fresh card is rendering the cloud thumbnail stays out of the
  // frame: it can be a card from an older renderer, and flashing it before the
  // real one lands reads as the wrong card. It is the fallback only once the
  // render has failed.
  const previewPending = $derived(
    !!payload?.sequencePreviewPending && !sequencePreviewUrl
  );
  const previewThumbnailUrl = $derived(
    sequencePreviewUrl ||
      (previewPending ? null : payload?.sequenceThumbnail) ||
      null
  );

  // Revoke on swap and on unmount; a leaked blob: URL pins the whole image in
  // memory for the life of the tab. The send sheet owns both preview URLs so a
  // caller can unmount without breaking a sheet that is already open.
  $effect(() => {
    const urls = [imagePreviewUrl, sequencePreviewUrl].filter(
      (url): url is string => !!url
    );
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  });

  $effect(() => {
    if (previewThumbnailUrl) thumbnailFailed = false;
  });
</script>

<!--
  The container lives on this wrapper, NOT on the sheet.

  An element is never matched by the container query of the container it
  establishes - only its descendants are. With `container-type` on the sheet
  itself, every @container rule targeting `.send-attachment-sheet` (the column
  template, the row template, the column gap) was silently dropped, and the
  two-column layout only appeared because the descendant `grid-column: 2` rules
  created IMPLICIT, auto-sized tracks. It looked right and was unsizable.
-->
<div class="sheet-shell">
  <div
    class="send-attachment-sheet"
    class:destination-selected={send.hasDestination}
    aria-busy={send.sending}
  >
    <!-- The card IS the preview. The title says "Send sequence" and the card
         shows the word, so a caption repeating both only stole height from
         the card it captioned. -->
    <article class="sequence-preview" aria-label="Attachment being shared">
      <div class="preview-thumbnail">
        {#if payload && previewThumbnailUrl && !thumbnailFailed}
          <img
            src={previewThumbnailUrl}
            alt=""
            class="thumbnail-img"
            onerror={() => {
              thumbnailFailed = true;
            }}
          />
        {:else if imagePreviewUrl}
          <img src={imagePreviewUrl} alt="" class="thumbnail-img" />
        {:else if previewPending}
          <div class="thumbnail-fallback" role="status">
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            <span>Preparing card…</span>
          </div>
        {:else}
          <div class="thumbnail-fallback" aria-hidden="true">
            <i class="fas {image ? 'fa-image' : 'fa-layer-group'}"></i>
          </div>
        {/if}
      </div>
    </article>

    <div class="destination-column">
      <SendDestinationPicker state={send} collapseOnSelect />
    </div>

    <div class="message-section">
      <textarea
        id="sequence-share-message"
        class="message-input"
        bind:value={send.message}
        aria-label="Note (optional)"
        placeholder="Add a note (optional)"
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
      disabled={!send.canSend}
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
  .sheet-shell {
    container-type: inline-size;
    display: grid;
    height: 100%;
    min-height: 0;
  }

  .send-attachment-sheet {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    gap: 0.875rem;
    height: 100%;
    min-height: 0;
    padding: 1rem;
    color: var(--theme-text);
  }

  .sequence-preview {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    justify-self: center;
    width: fit-content;
    max-width: 100%;
    min-height: 0;
    margin: 0;
    padding: 0.5rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
  }

  /* No fixed aspect ratio: the card sets its own shape and the box fits it.
     A forced 4:3 box cropped every card taller than a postcard. The single-
     column form caps the height so a 16-step card does not push the
     recipients below the fold; the two-column form removes the cap and lets
     the card fill its column instead. */
  .preview-thumbnail {
    --preview-cap: min(14rem, 32dvh);
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 0;
    max-height: var(--preview-cap);
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-panel-bg) 82%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
  }

  /* The box above is auto-height here, so a 100% max-height on the image
     resolves to none; the image repeats the cap. Modes that give the box a
     definite height switch it back to 100%. */
  .thumbnail-img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: var(--preview-cap);
    object-fit: contain;
  }

  .thumbnail-fallback {
    display: grid;
    place-items: center;
    gap: 0.5rem;
    /* The frame hugs its content, so the icon needs a box of its own. */
    min-width: 8rem;
    min-height: 6rem;
    padding: 0.75rem;
    color: var(--theme-text-dim);
    font-size: clamp(
      var(--font-size-xl, 1.25rem),
      6cqw,
      var(--font-size-3xl, 1.875rem)
    );
  }

  .thumbnail-fallback span {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .send-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .message-section {
    position: relative;
    display: grid;
  }

  /* One line until typed into; grows to a few, then scrolls. The note is
     optional and rarely used, so it no longer owns whatever height the card
     and the recipients leave over. */
  .message-input {
    width: 100%;
    min-height: 2.75rem;
    max-height: 7.5rem;
    padding: 0.75rem;
    resize: none;
    field-sizing: content;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-base, 1rem);
    line-height: 1.35;
  }

  .message-input::placeholder {
    color: var(--theme-text-dim);
  }

  .message-input:focus {
    border-color: var(--theme-accent, var(--semantic-info));
    outline: none;
    box-shadow: 0 0 0 2px
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 22%,
        transparent
      );
  }

  .message-input:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  /* Overlaid in the corner of the input: only shown near the limit, so it
     must not reserve a row of its own the rest of the time. */
  .char-count {
    position: absolute;
    right: 0.75rem;
    bottom: 0.5rem;
    pointer-events: none;
    visibility: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .char-count.visible {
    visibility: visible;
  }

  .send-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 3rem;
    padding: 0.75rem 1rem;
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

  /* The recipients column is a grid child of the sheet, so the picker's own
     rows and collapse rules must reach the sheet's tracks. */
  .destination-column {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
  }

  /* Narrow layout: choosing a destination collapses the picker's browser
     (its default), which leaves the destination section short while it still
     holds the sheet's 1fr row, so the space the list used to occupy became a
     void between the recipients and the note. Hand the slack to the note
     instead.

     Bounded by an explicit max-width rather than left to be overridden by the
     two-column block: both selectors carry one class plus Svelte's scope
     class, so they tie on specificity and the winner is decided by source
     order alone. That tie resolved the wrong way here and silently flattened
     the note in the wide layout. */
  @container (max-width: 41.999rem) {
    .destination-selected {
      grid-template-rows: minmax(0, 1fr) auto auto auto;
    }

    .destination-selected .preview-thumbnail {
      max-height: none;
      height: 100%;
    }

    .destination-selected .thumbnail-img {
      max-height: 100%;
    }
  }

  /*
    Two columns once the sheet itself is wide enough to hold them.
    A CONTAINER query, not a media query: this sheet lives in a drawer whose
    width is set by --sheet-width, so viewport width says nothing useful about
    how much room it actually has.

    42rem (672px) is where the split starts paying off, and it lands on the
    real hardware seams:
      - Galaxy Z Fold unfolded is a 707x823 CSS viewport (1856x2160 @ 420dpi),
        under the 768px mobile seam, so the drawer is already full-width -
        44.2rem of sheet, and previously one narrow column down the middle.
      - 2560 desktop -> drawer 717px (44.8rem) -> two columns.
      - 3840 desktop -> drawer 1024px (64rem)  -> two columns.
      - 1920 desktop -> drawer  537px (33.6rem) -> stays single, correctly.
  */
  @container (min-width: 42rem) {
    .send-attachment-sheet {
      /* The recipient list needs a conversation's width and no more; every
         extra pixel goes to the card. */
      grid-template-columns: minmax(0, 1fr) clamp(20rem, 38%, 26rem);
      /* Card, note, send, then whatever is left. The recipients column spans
         every row, so the slack lands under the send button instead of
         between it and the card. */
      grid-template-rows: auto auto auto minmax(0, 1fr);
      column-gap: 1rem;
    }

    /* Left column: what you are sending, and the act of sending it. The
       frame hugs the card rather than stretching to the row: a portrait card
       in a 300px column is width-bound at ~400px tall, and a 1100px frame
       around it read as a broken image. */
    .sequence-preview {
      grid-row: 1;
      grid-column: 1;
      align-self: start;
    }

    .preview-thumbnail {
      /* Whatever height the header, note, and Send do not need. 18rem is
         their combined height with the sheet's padding and gaps. */
      --preview-cap: max(14rem, calc(100dvh - 18rem));
    }

    .message-section {
      grid-row: 2;
      grid-column: 1;
    }

    .send-button {
      grid-row: 3;
      grid-column: 1;
    }

    /* Right column: who it goes to, full height, always visible. The two
       custom properties hand the picker its list back once a destination is
       chosen; see SendDestinationPicker. */
    .destination-column {
      --destination-rows-selected: auto auto minmax(0, 1fr);
      --destination-browser-display: block;
      grid-row: 1 / -1;
      grid-column: 2;
    }
  }

  @media (max-height: 31rem) {
    .send-attachment-sheet {
      gap: 0.375rem;
      padding: 0.375rem 0.5rem 0.5rem;
    }

    .sequence-preview {
      padding: 0.25rem 0.5rem;
    }

    /* A wide-AND-short window (e.g. 2560x400) satisfies the two-column
       container query as well as this block. A short card strip is all the
       room there is; the grid-area overrides below do the rest. */
    .preview-thumbnail {
      --preview-cap: 4.5rem;
      height: auto;
    }

    .message-input {
      min-height: 2.75rem;
      max-height: 3.5rem;
      padding-block: 0.5rem;
    }

    .send-button {
      min-height: var(--min-touch-target, 44px);
      padding-block: 0.5rem;
    }
  }

  @media (max-height: 31rem) and (min-width: 40rem) {
    .send-attachment-sheet {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto minmax(0, 1fr) auto;
      column-gap: 0.5rem;
    }

    .sequence-preview,
    .destination-column {
      grid-column: 1 / -1;
    }

    .destination-column {
      grid-row: 2;
    }

    .message-section {
      grid-column: 1;
      grid-row: 3;
    }

    .send-button {
      grid-column: 2;
      grid-row: 3;
      align-self: end;
      width: auto;
      min-width: 10rem;
    }
  }

  @media (max-height: 31rem) and (max-width: 39.999rem) {
    .send-attachment-sheet {
      grid-template-rows: auto auto auto auto;
      height: auto;
      min-height: 100%;
      overflow-y: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .send-button {
      transition: none;
    }
  }
</style>
