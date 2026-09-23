<!--
  ViewerSharePanel.svelte

  Share, as part of the viewer layout rather than a dialog over it. The panel
  takes the inspector track and the stage beside it keeps playing, so the
  person sees exactly what they are sharing while they decide where it goes.
  The rail picks what is shared (Card, 2D, Tunnel, Post Studio, ...); this
  panel only offers where: a link, a file, the OS share sheet, or a friend.

  Download leads: a file is the share most people want, so it is the one
  primary action. Link, the system share sheet, and Publish sit in a row
  under it, and sending to a friend follows below the divider.

  On the 2D animation Download renders right here: the line under it says
  what it will make, Settings opens the Export page that decides that, and
  the button carries the render's progress. Other views still prepare their
  file in the share sheet.
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
    /** What Download makes, e.g. "1080p • 30 fps • ~1m 12s". */
    downloadDetail?: string;
    /** 0-1 while Download's render runs; null when idle. */
    downloadProgress?: number | null;
    downloadDisabled?: boolean;
    /** Opens the settings that shape the file. */
    onDownloadSettings?: () => void;
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
    downloadDetail,
    downloadProgress = null,
    downloadDisabled = false,
    onDownloadSettings,
    onNativeShare,
    onPublish,
    session,
    getViewParams,
    onSent,
    onRequestAccount,
    onClose,
  }: Props = $props();

  const headingId = $props.id();

  const downloadText = $derived(`Download ${downloadLabel.toLowerCase()}`);
  const rendering = $derived(downloadProgress !== null);
  const renderPercent = $derived(
    Math.round(Math.max(0, Math.min(1, downloadProgress ?? 0)) * 100)
  );
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

  <div class="primary-action">
    <PanelButton
      variant="primary"
      fullWidth
      onclick={onDownload}
      disabled={rendering || downloadDisabled}
      ariaBusy={rendering}
    >
      <!-- One cell for both labels, so the button keeps its width while the
           percentage counts up. -->
      <span class="download-label">
        <span
          class="label-state"
          class:shown={!rendering}
          aria-hidden={rendering}
        >
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          {downloadText}
        </span>
        <span
          class="label-state"
          class:shown={rendering}
          aria-hidden={!rendering}
        >
          <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          Rendering <span class="percent">{renderPercent}%</span>
        </span>
      </span>
    </PanelButton>
    {#if downloadDetail}
      <div class="download-detail">
        <span>{downloadDetail}</span>
        {#if onDownloadSettings}
          <button
            type="button"
            class="settings"
            onclick={onDownloadSettings}
            aria-label="Video export settings"
          >
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
            Settings
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <div class="actions" role="group" aria-label="Other ways to share">
    <PanelButton onclick={onCopyLink}>
      <i
        class="fa-solid {linkCopied ? 'fa-check' : 'fa-link'}"
        aria-hidden="true"
      ></i>
      {linkCopied ? "Link copied" : "Copy link"}
    </PanelButton>
    {#if onNativeShare}
      <PanelButton onclick={onNativeShare} ariaLabel="Share to other apps">
        <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
        Other apps
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
        <PanelButton onclick={onRequestAccount}>
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
    grid-template-rows: max-content max-content max-content minmax(0, 1fr);
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

  .primary-action {
    display: grid;
    gap: 0.375rem;
    padding: 0.75rem 1rem 0;
  }

  .download-label {
    display: inline-grid;
  }

  .label-state {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    visibility: hidden;
  }

  .label-state.shown {
    visibility: visible;
  }

  .percent {
    font-variant-numeric: tabular-nums;
  }

  .download-detail {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .download-detail > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0 0.75rem;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    color: var(--theme-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .settings:hover {
    background: var(--theme-card-bg);
  }

  .settings:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  /* Equal tracks, so "Copy link" becoming "Link copied" moves nothing. */
  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 0.5rem;
    padding: 0.5rem 1rem 0;
  }

  /* A neutral divider: sending is its own task, after the file and link. */
  .recipients {
    display: flex;
    min-width: 0;
    min-height: 0;
    margin-top: 1rem;
    border-top: 1px solid var(--theme-stroke);
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
    .close,
    .settings {
      transition: none;
    }
  }
</style>
