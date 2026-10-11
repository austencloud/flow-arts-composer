<script lang="ts">
  import { page } from "$app/state";
  import SessionReplayPanel from "#lib/features/admin/components/SessionReplayPanel.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import type { PostHogReplayAccessState } from "#lib/features/admin/services/types.js";

  const supportedStates = new Set([
    "loading",
    "ready",
    "processing",
    "unavailable",
    "configuration",
    "error",
  ]);
  const requestedState = $derived(page.url.searchParams.get("state"));
  const replayState = $derived(
    supportedStates.has(requestedState ?? "")
      ? (requestedState as PostHogReplayAccessState | "loading")
      : "ready"
  );
  const message = $derived(
    replayState === "processing"
      ? "PostHog has not made this recording available yet. It may still be processing."
      : replayState === "unavailable"
        ? "PostHog no longer has a recording for this session."
        : replayState === "configuration"
          ? "The PostHog key needs session recording and sharing configuration scopes."
          : replayState === "error"
            ? "PostHog could not prepare this replay."
            : null
  );
  let open = $state(true);
</script>

<BaseModal
  bind:open
  size="xl"
  class="session-replay-proof"
  onclose={() => (open = true)}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  {#snippet header()}
    <header class="proof-header">
      <div>
        <span>User detail · Activity</span>
        <h1>Notification replay proof</h1>
      </div>
      <span class="proof-state">{replayState}</span>
    </header>
  {/snippet}

  <main class="proof-shell">
    <div class="session-summary">
      <div>
        <span>Session inspection</span>
        <strong>Today, 12:31 AM</strong>
      </div>
      <div>
        <span>Route</span>
        <strong>Create → Settings</strong>
      </div>
      <div>
        <span>Client</span>
        <strong>Chrome · Windows · Desktop</strong>
      </div>
    </div>

    <SessionReplayPanel
      state={replayState}
      embedUrl={replayState === "ready" ? "/test/session-replay/player" : null}
      {message}
    />
  </main>
</BaseModal>

<style>
  :global(body) {
    background: #060a12;
  }

  .proof-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .proof-header > div {
    display: grid;
    gap: 0.2rem;
  }

  .proof-header h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-lg);
  }

  .proof-header span,
  .session-summary span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .proof-state {
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    text-transform: capitalize;
  }

  .proof-shell {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
  }

  .session-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.625rem;
  }

  .session-summary > div {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-panel-bg);
  }

  .session-summary strong {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 2600px) {
    :global(dialog.session-replay-proof[data-size="xl"]) {
      width: min(92vw, 120rem);
      --font-size-compact: 1rem;
      --font-size-sm: 1.125rem;
      --font-size-lg: 1.5rem;
      --min-touch-target: 3.75rem;
    }

    .proof-header,
    .proof-shell {
      padding: 1.5rem 2rem;
    }
  }

  @media (max-width: 620px) {
    .proof-header,
    .proof-shell {
      padding: 0.75rem;
    }

    .session-summary {
      grid-template-columns: 1fr;
    }
  }

  @media (max-height: 500px) and (min-width: 700px) {
    .proof-header {
      padding-block: 0.5rem;
    }

    .proof-shell {
      padding-block: 0.75rem;
    }
  }
</style>
