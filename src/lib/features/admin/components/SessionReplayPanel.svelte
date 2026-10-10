<script lang="ts">
  import AdminActionButton from "#lib/shared/admin/components/AdminActionButton.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import type { PostHogReplayAccessState } from "../services/types";

  interface Props {
    state: PostHogReplayAccessState | "loading";
    embedUrl?: string | null;
    message?: string | null;
    onretry?: () => void;
  }

  let {
    state,
    embedUrl = null,
    message = null,
    onretry = () => {},
  }: Props = $props();
</script>

<section class="replay-panel" aria-labelledby="session-replay-title">
  <header class="replay-heading">
    <div>
      <span class="replay-kicker">PostHog</span>
      <h5 id="session-replay-title">Session replay</h5>
    </div>
    {#if state === "ready"}
      <span class="ready-badge">
        <i class="fas fa-circle-play" aria-hidden="true"></i>
        Ready
      </span>
    {/if}
  </header>

  {#if state === "ready" && embedUrl}
    <div class="replay-frame ready-frame">
      <iframe
        src={embedUrl}
        title="PostHog session replay"
        allow="fullscreen"
        allowfullscreen
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
  {:else}
    <div
      class="replay-frame replay-state"
      class:configuration={state === "configuration"}
      class:error={state === "error"}
      role={state === "error" || state === "configuration" ? "alert" : "status"}
      aria-live="polite"
    >
      {#if state === "loading"}
        <ProgressRing percent={-1} size={34} strokeWidth={3} />
        <div>
          <strong>Loading recording</strong>
          <span>Requesting the secure PostHog player.</span>
        </div>
      {:else if state === "processing"}
        <i class="fas fa-hourglass-half state-icon" aria-hidden="true"></i>
        <div>
          <strong>Replay isn't ready yet</strong>
          <span
            >{message || "PostHog may still be processing this session."}</span
          >
        </div>
        <AdminActionButton
          variant="secondary"
          icon="fa-rotate-right"
          onclick={onretry}>Retry</AdminActionButton
        >
      {:else if state === "unavailable"}
        <i class="fas fa-video-slash state-icon" aria-hidden="true"></i>
        <div>
          <strong>No replay for this session</strong>
          <span>{message || "PostHog did not return a recording."}</span>
        </div>
      {:else if state === "configuration"}
        <i class="fas fa-key state-icon" aria-hidden="true"></i>
        <div>
          <strong>Replay access needs PostHog scopes</strong>
          <span>{message}</span>
          <code
            >session_recording:read · sharing_configuration:read ·
            sharing_configuration:write</code
          >
        </div>
        <AdminActionButton
          variant="secondary"
          icon="fa-rotate-right"
          onclick={onretry}>Retry</AdminActionButton
        >
      {:else}
        <i class="fas fa-circle-exclamation state-icon" aria-hidden="true"></i>
        <div>
          <strong>Replay failed to load</strong>
          <span>{message || "PostHog could not prepare this replay."}</span>
        </div>
        <AdminActionButton
          variant="secondary"
          icon="fa-rotate-right"
          onclick={onretry}>Retry</AdminActionButton
        >
      {/if}
    </div>
  {/if}
</section>

<style>
  .replay-panel {
    container-type: inline-size;
    display: grid;
    gap: 0.625rem;
  }

  .replay-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .replay-heading > div {
    display: grid;
    gap: 0.2rem;
  }

  .replay-kicker {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .replay-heading h5 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .ready-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--semantic-success) 14%, transparent);
    color: var(--semantic-success);
    font-size: var(--font-size-compact);
    font-weight: 650;
  }

  .replay-frame {
    width: 100%;
    height: clamp(20rem, min(52cqi, 58dvh), 52rem);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--theme-background) 88%, black);
  }

  .ready-frame iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #0f172a;
  }

  .replay-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1.5rem;
    color: var(--theme-text-dim);
    text-align: left;
  }

  .replay-state > div {
    display: grid;
    max-width: 34rem;
    gap: 0.35rem;
  }

  .replay-state strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .replay-state span,
  .replay-state code {
    font-size: var(--font-size-compact);
    line-height: 1.5;
  }

  .replay-state code {
    overflow-wrap: anywhere;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .state-icon {
    color: var(--theme-accent);
    font-size: 1.4rem;
  }

  .replay-state.configuration .state-icon {
    color: var(--semantic-warning);
  }

  .replay-state.error .state-icon {
    color: var(--semantic-error);
  }

  @container (max-width: 34rem) {
    .replay-state {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .replay-panel * {
      scroll-behavior: auto !important;
    }
  }
</style>
