<!--
  ViewerSharePanel.svelte

  Share, as part of the viewer layout rather than a dialog over it. The panel
  takes the inspector track and the stage beside it keeps playing, so the
  person sees exactly what they are sharing while they decide where it goes.
  The rail picks what is shared (Card, 2D, Tunnel, Post Studio, ...); this
  panel only offers where: a link, a file, the OS share sheet, or a friend.

  Files still prepare in the share sheet: rendering a card or a video needs
  its preview and settings, which is more than a column holds.
-->
<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { SequenceSendSession } from "$lib/shared/inbox/state/send-sequence-state.svelte";
  import SendSequenceWorkspace from "./SendSequenceWorkspace.svelte";

  interface Props {
    /** The view on stage, as the rail names it. */
    subject: { label: string; icon: string };
    /** What Download produces from that view, e.g. "Card image" or "Video". */
    downloadLabel: string;
    linkCopied: boolean;
    onCopyLink: () => void;
    onDownload: () => void;
    /** Omitted where the browser has no share sheet. */
    onNativeShare?: () => void;
    /** Omitted while social publishing is unavailable. */
    onPublish?: () => void;
    /** Null for a guest: the recipients need an account. */
    session: SequenceSendSession | null;
    getViewParams: () => string | undefined;
    onSent: (conversationIds: string[]) => void;
    onRequestAccount: () => void;
    onClose: () => void;
  }

  let {
    subject,
    downloadLabel,
    linkCopied,
    onCopyLink,
    onDownload,
    onNativeShare,
    onPublish,
    session,
    getViewParams,
    onSent,
    onRequestAccount,
    onClose,
  }: Props = $props();

  const headingId = $props.id();
</script>

<section class="share-panel" aria-labelledby={headingId}>
  <header class="panel-head">
    <div class="title-group">
      <h2 id={headingId}>Share</h2>
      <p class="subject" aria-live="polite">
        <i class="fa-solid {subject.icon}" aria-hidden="true"></i>
        <span>{subject.label}</span>
      </p>
    </div>
    <button
      type="button"
      class="close"
      data-escape-shortcut
      data-escape-shortcut-label="Share"
      onclick={onClose}
      aria-label="Close share"
      title="Close share"
    >
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  <div class="actions" role="group" aria-label="Share options">
    <PanelButton onclick={onCopyLink}>
      <i
        class="fa-solid {linkCopied ? 'fa-check' : 'fa-link'}"
        aria-hidden="true"
      ></i>
      {linkCopied ? "Link copied" : "Copy link"}
    </PanelButton>
    <PanelButton onclick={onDownload} ariaLabel={`Download ${downloadLabel}`}>
      <i class="fa-solid fa-download" aria-hidden="true"></i>
      {downloadLabel}
    </PanelButton>
    {#if onNativeShare}
      <PanelButton onclick={onNativeShare} ariaLabel="More ways to share">
        <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
        More
      </PanelButton>
    {/if}
    {#if onPublish}
      <PanelButton onclick={onPublish}>
        <i class="fa-solid fa-bullhorn" aria-hidden="true"></i>
        Publish
      </PanelButton>
    {/if}
  </div>

  <div class="recipients">
    {#if session}
      <!-- Keyed: a finished send hands over a fresh session, which clears the
           picked people and the note without closing the panel. -->
      {#key session}
        <SendSequenceWorkspace
          {session}
          {onSent}
          onCancel={onClose}
          {getViewParams}
        />
      {/key}
    {:else}
      <div class="guest-send">
        <h3>Send to a friend</h3>
        <p>Friends open it on this same view, in Flow Arts Composer.</p>
        <PanelButton variant="primary" onclick={onRequestAccount}>
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          Sign up to send
        </PanelButton>
      </div>
    {/if}
  </div>
</section>

<style>
  /* Header and actions take what they need; the recipients take the rest and
     scroll inside it, so the note and Send stay docked at the foot. */
  .share-panel {
    container-type: inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: max-content max-content minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.75rem 0 1rem;
  }

  .title-group {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    min-width: 0;
  }

  h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 800;
  }

  /* Follows the rail live: switching views while the panel is open changes
     what the link, the file, and the message carry. */
  .subject {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
  }

  .subject span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    color: var(--theme-text-dim);
    font-size: 1.05rem;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .close:hover {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .close:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0;
  }

  .recipients {
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  .guest-send {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 0.625rem;
    width: 100%;
    padding: 1.25rem 1rem 1rem;
  }

  .guest-send h3 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    font-weight: 800;
  }

  .guest-send p {
    margin: 0 0 0.25rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
  }

  @media (prefers-reduced-motion: reduce) {
    .close {
      transition: none;
    }
  }
</style>
