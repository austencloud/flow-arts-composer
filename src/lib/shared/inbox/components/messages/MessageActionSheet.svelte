<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import { getMessagePreviewText } from "../../utils/message-preview";
  import type { Message } from "#lib/shared/messaging/domain/models/message-models.js";

  type Action = () => void | Promise<void>;
  type ReactionAction = (emoji: string) => void | Promise<void>;

  interface Props {
    isOpen?: boolean;
    message: Message;
    isOwn: boolean;
    canEdit: boolean;
    canDelete: boolean;
    showAdminCopy: boolean;
    reactions: readonly string[];
    onReaction: ReactionAction;
    onReply: Action;
    onCopy: Action;
    onCopySelection: (text: string) => void | Promise<void>;
    onCopyForAI: Action;
    onEdit: Action;
    onDelete: Action;
  }

  let {
    isOpen = $bindable(false),
    message,
    isOwn,
    canEdit,
    canDelete,
    showAdminCopy,
    reactions,
    onReaction,
    onReply,
    onCopy,
    onCopySelection,
    onCopyForAI,
    onEdit,
    onDelete,
  }: Props = $props();

  let mode = $state<"actions" | "selection">("actions");
  let headingEl: HTMLHeadingElement | undefined = $state();
  let selectionSurfaceEl: HTMLTextAreaElement | undefined = $state();
  let selectedText = $state("");

  const hasText = $derived(message.content.trim().length > 0);
  const previewText = $derived(
    getMessagePreviewText(message.content, message.attachments)
  );
  const titleId = $derived(`message-action-sheet-title-${message.id}`);
  const sheetClass = $derived(
    `message-action-sheet${mode === "selection" ? " selection-mode" : ""}`
  );

  $effect(() => {
    if (!isOpen) {
      mode = "actions";
      selectedText = "";
    }
  });

  function close(): void {
    isOpen = false;
  }

  function openSelectionMode(): void {
    mode = "selection";
    selectedText = "";
    requestAnimationFrame(() => {
      selectionSurfaceEl?.focus({ preventScroll: true });
    });
  }

  function returnToActions(): void {
    selectionSurfaceEl?.setSelectionRange(0, 0);
    selectedText = "";
    mode = "actions";
    requestAnimationFrame(() => {
      headingEl?.focus({ preventScroll: true });
    });
  }

  function copySelection(): void {
    if (!selectedText) return;
    void onCopySelection(selectedText);
  }

  function updateSelectedText(): void {
    if (!selectionSurfaceEl) return;
    selectedText = message.content
      .slice(selectionSurfaceEl.selectionStart, selectionSurfaceEl.selectionEnd)
      .trim();
  }
</script>

<Drawer
  bind:isOpen
  placement="bottom"
  closeOnBackdrop={true}
  closeOnEscape={true}
  dismissible={true}
  showHandle={true}
  initialFocusElement={headingEl ?? null}
  returnFocusOnClose={true}
  labelledBy={titleId}
  class={sheetClass}
  backdropClass="message-action-sheet-backdrop"
>
  <div class="sheet-content">
    <header class="sheet-header">
      {#if mode === "selection"}
        <button
          type="button"
          class="header-button"
          aria-label={t("inbox_ui_back_to_message_actions")}
          onclick={returnToActions}
        >
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
      {:else}
        <span class="header-button-spacer" aria-hidden="true"></span>
      {/if}

      <div class="sheet-heading">
        <span>{isOwn ? t("inbox_ui_your_message") : message.senderName || t("inbox_message")}</span>
        <h2 id={titleId} bind:this={headingEl} tabindex="-1">
          {mode === "selection" ? t("inbox_ui_select_text") : t("inbox_ui_message_actions")}
        </h2>
      </div>

      <button
        type="button"
        class="header-button"
        aria-label={t("inbox_ui_close_message_actions")}
        onclick={close}
      >
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </header>

    {#if mode === "actions"}
      <div class="message-preview" aria-label={t("inbox_ui_selected_message")}>
        <p>{previewText}</p>
      </div>

      <section
        class="reaction-section"
        aria-labelledby="reaction-label-{message.id}"
      >
        <h3 id="reaction-label-{message.id}">{t("inbox_ui_react")}</h3>
        <div class="reaction-row" role="group" aria-label={t("inbox_ui_react_to_message")}>
          {#each reactions as emoji}
            <button
              type="button"
              class="reaction-button"
              aria-label={t("inbox_react_emoji", { emoji: emoji })}
              onclick={() => onReaction(emoji)}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          {/each}
        </div>
      </section>

      <div class="action-grid" aria-label={t("inbox_ui_message_actions")}>
        <button type="button" class="action-button" onclick={onReply}>
          <i class="fa-solid fa-reply" aria-hidden="true"></i>
          <span>{t("inbox_ui_reply")}</span>
        </button>

        {#if hasText}
          <button type="button" class="action-button" onclick={onCopy}>
            <i class="fa-solid fa-copy" aria-hidden="true"></i>
            <span>{t("inbox_ui_copy")}</span>
          </button>
          <button
            type="button"
            class="action-button"
            onclick={openSelectionMode}
          >
            <i class="fa-solid fa-i-cursor" aria-hidden="true"></i>
            <span>{t("inbox_ui_select_text")}</span>
          </button>
        {/if}

        {#if showAdminCopy}
          <button type="button" class="action-button" onclick={onCopyForAI}>
            <i class="fa-solid fa-robot" aria-hidden="true"></i>
            <span>{t("inbox_ui_copy_for_ai")}</span>
          </button>
        {/if}

        {#if canEdit}
          <button type="button" class="action-button" onclick={onEdit}>
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
            <span>{t("inbox_ui_edit")}</span>
          </button>
        {/if}

        {#if canDelete}
          <button type="button" class="action-button danger" onclick={onDelete}>
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
            <span>{t("inbox_ui_delete")}</span>
          </button>
        {/if}
      </div>
    {:else}
      <div class="selection-workspace">
        <p class="selection-instruction">
          {t("inbox_ui_double_tap_a_word_then_drag_the_handles_to_adjust_the_selection")}
        </p>
        <textarea
          id="message-selection-{message.id}"
          name="message-selection-{message.id}"
          class="selection-surface themed-scrollbar"
          bind:this={selectionSurfaceEl}
          value={message.content}
          readonly
          aria-label={t("inbox_ui_message_text_to_select")}
          data-message-selection-surface="true"
          onselect={updateSelectedText}
        ></textarea>
        <div class="selection-actions">
          <button type="button" class="selection-button" onclick={onCopy}>
            {t("inbox_ui_copy_all")}
          </button>
          <button
            type="button"
            class="selection-button primary"
            disabled={!selectedText}
            onclick={copySelection}
          >
            {t("inbox_ui_copy_selection")}
          </button>
        </div>
      </div>
    {/if}
  </div>
</Drawer>

<style>
  :global(.message-action-sheet) {
    --sheet-bg: var(--theme-panel-bg);
    --sheet-border: 1px solid var(--theme-stroke-strong);
    --sheet-max-height: min(92dvh, 44rem);
  }

  :global(
    dialog.drawer-content.message-action-sheet[data-placement="bottom"]:not(
        .side-by-side-layout
      )
  ) {
    min-height: 0;
  }

  :global(.message-action-sheet.selection-mode) {
    height: min(92dvh, 44rem);
  }

  :global(.message-action-sheet-backdrop) {
    --sheet-backdrop-bg: color-mix(in srgb, black 58%, transparent);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Basis AUTO: the bottom sheet is content-sized (min-height: 0), and a 0%
     basis here makes WebKit size it to the grab handle alone on iPhones.
     See Drawer.css .drawer-inner. */
  .sheet-content {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    gap: 0.875rem;
    overflow-y: auto;
    padding: 0 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
  }

  .sheet-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    grid-template-columns:
      var(--min-touch-target, 44px) minmax(0, 1fr)
      var(--min-touch-target, 44px);
    align-items: center;
    min-height: 3.5rem;
    background: var(--theme-panel-bg);
  }

  .sheet-heading {
    min-width: 0;
    text-align: center;
  }

  .sheet-heading > span {
    display: block;
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sheet-heading h2 {
    margin: 0.125rem 0 0;
    color: var(--theme-text);
    font-size: var(--font-size-lg, 18px);
    line-height: 1.2;
  }

  .sheet-heading h2:focus {
    outline: none;
  }

  .header-button,
  .header-button-spacer {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
  }

  .header-button {
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
  }

  .header-button:hover,
  .header-button:focus-visible {
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
  }

  .header-button:focus-visible,
  .reaction-button:focus-visible,
  .action-button:focus-visible,
  .selection-button:focus-visible,
  .selection-surface:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .message-preview {
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-card-bg);
  }

  .message-preview p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .reaction-section {
    display: grid;
    gap: 0.375rem;
  }

  .reaction-section h3 {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  .reaction-row {
    display: grid;
    grid-template-columns: repeat(
      6,
      minmax(var(--min-touch-target, 44px), 1fr)
    );
    gap: 0.25rem;
  }

  .reaction-button {
    display: grid;
    place-items: center;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 1.3rem;
    cursor: pointer;
  }

  .reaction-button:hover,
  .reaction-button:focus-visible,
  .reaction-button:active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 55%,
      var(--theme-stroke)
    );
    background: var(--theme-card-hover-bg);
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    gap: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
    text-align: left;
  }

  .action-button:hover,
  .action-button:focus-visible {
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 55%,
      var(--theme-stroke)
    );
    background: var(--theme-card-hover-bg);
  }

  .action-button i {
    width: 1.1rem;
    color: var(--theme-accent);
    text-align: center;
  }

  .action-button.danger {
    grid-column: 1 / -1;
    color: var(--semantic-error);
  }

  .action-button.danger i {
    color: currentColor;
  }

  .action-button.danger:hover,
  .action-button.danger:focus-visible {
    border-color: color-mix(
      in srgb,
      var(--semantic-error) 52%,
      var(--theme-stroke)
    );
    background: color-mix(
      in srgb,
      var(--semantic-error) 12%,
      var(--theme-card-bg)
    );
  }

  .selection-workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 0.75rem;
  }

  .selection-instruction {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
    text-align: center;
  }

  .selection-surface {
    box-sizing: border-box;
    flex: 1;
    width: 100%;
    min-height: 10rem;
    overflow-y: auto;
    padding: 1rem;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    line-height: 1.55;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    cursor: text;
    resize: none;
    -webkit-touch-callout: default;
    -webkit-user-select: text;
    user-select: text;
  }

  .selection-surface::selection {
    background: color-mix(in srgb, var(--theme-accent) 42%, transparent);
  }

  .selection-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .selection-button {
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
  }

  .selection-button.primary {
    border-color: var(--theme-accent);
    background: var(--theme-accent);
    color: var(--theme-text-on-accent, white);
  }

  .selection-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (max-height: 500px) {
    :global(.message-action-sheet) {
      --sheet-max-height: 96dvh;
    }

    .sheet-content {
      gap: 0.5rem;
      padding-bottom: calc(0.625rem + env(safe-area-inset-bottom, 0px));
    }

    .sheet-header {
      min-height: 3rem;
    }

    .message-preview {
      padding-block: 0.5rem;
    }

    .message-preview p {
      -webkit-line-clamp: 2;
    }

    .reaction-section {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reaction-button,
    .action-button,
    .selection-button {
      transition: none;
    }
  }
</style>
