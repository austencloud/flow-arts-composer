<script lang="ts">
  /**
   * Where a "New visitor" push lands: that visitor's PostHog replay, filling
   * the screen. The push already said who and where, so the bar above the
   * player is one line. When more visitors join the same burst, a row of
   * chips under the player switches between them.
   */
  import { goto } from "$app/navigation";
  import {
    getAuthSync,
    getFirestoreInstance,
  } from "#lib/shared/auth/firebase.js";
  import { postHogReplayUrl } from "#lib/shared/analytics/services/posthog.js";
  import { doc, onSnapshot } from "firebase/firestore";
  import { onDestroy, onMount } from "svelte";
  import SessionReplayPanel from "./SessionReplayPanel.svelte";
  import { getPostHogUserAnalytics } from "../get-post-hog-user-analytics";
  import type { PostHogReplayAccessState } from "../services/types";
  import {
    REPLAY_RETRY_LIMIT,
    REPLAY_RETRY_MS,
    visitorsFromNotification,
    type VisitorEntry,
  } from "../domain/visitor-replay";

  interface Props {
    notificationId: string;
  }

  let { notificationId }: Props = $props();

  const INBOX_URL = "/create?sheet=inbox&inboxTab=notifications";

  let visitors = $state<VisitorEntry[]>([]);
  let loaded = $state(false);
  let loadError = $state<string | null>(null);
  let selected = $state(0);

  let replayState = $state<PostHogReplayAccessState | "loading">("loading");
  let embedUrl = $state<string | null>(null);
  let replayMessage = $state<string | null>(null);

  const visitor = $derived(visitors[selected] ?? null);
  const sessionId = $derived(visitor?.postHogSessionId ?? null);
  const postHogUrl = $derived(sessionId ? postHogReplayUrl(sessionId) : null);

  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    const user = getAuthSync().currentUser;
    if (!user) {
      loadError = "Sign in with an admin account to watch this visit.";
      loaded = true;
      return;
    }
    try {
      const firestore = await getFirestoreInstance();
      unsubscribe = onSnapshot(
        doc(firestore, `users/${user.uid}/notifications/${notificationId}`),
        (snapshot) => {
          visitors = snapshot.exists()
            ? visitorsFromNotification(snapshot.data())
            : [];
          if (!snapshot.exists()) {
            loadError = "This visit alert is no longer available.";
          }
          loaded = true;
        },
        (error) => {
          console.error("[VisitorReplay] Failed to read the alert", error);
          loadError = "This visit alert could not be loaded.";
          loaded = true;
        }
      );
    } catch (error) {
      console.error("[VisitorReplay] Firestore unavailable", error);
      loadError = "This visit alert could not be loaded.";
      loaded = true;
    }
  });

  onDestroy(() => unsubscribe?.());

  // Each visitor gets its own request loop; switching or leaving cancels it.
  // While PostHog is still receiving the recording, ask again on a timer so
  // tapping the push the moment it arrives still ends in a playing replay.
  let retryNonce = $state(0);

  $effect(() => {
    const id = sessionId;
    void retryNonce;
    if (!id) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    replayState = "loading";
    embedUrl = null;
    replayMessage = null;

    const ask = async () => {
      attempts += 1;
      try {
        const access = await getPostHogUserAnalytics().getSessionReplayAccess(
          id,
          controller.signal
        );
        if (controller.signal.aborted) return;
        replayState = access.state;
        embedUrl = access.embedUrl;
        const waiting = access.state === "processing";
        replayMessage = !waiting
          ? access.message
          : attempts < REPLAY_RETRY_LIMIT
            ? "The recording is still arriving. This checks again on its own."
            : "PostHog still has no recording of this visit. Some visits go unrecorded, such as very short ones or browsers that block it.";
        if (waiting && attempts < REPLAY_RETRY_LIMIT) {
          timer = setTimeout(ask, REPLAY_RETRY_MS);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        replayState = "error";
        replayMessage =
          error instanceof Error
            ? error.message
            : "PostHog could not prepare this replay.";
      }
    };
    void ask();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  });

  function back() {
    void goto(INBOX_URL);
  }

  function visitorLine(v: VisitorEntry): string {
    const who = v.visitNumber > 1 ? `Visit ${v.visitNumber}` : "New";
    return [who, v.place, `via ${v.source}`, v.device, v.landingPath].join(
      " · "
    );
  }
</script>

<main class="visitor-screen">
  <header class="bar">
    <button type="button" class="icon-button" onclick={back} aria-label="Back">
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    <p class="caption" title={visitor ? visitorLine(visitor) : undefined}>
      {visitor ? visitorLine(visitor) : "Site visitor"}
    </p>
    {#if postHogUrl}
      <a
        class="icon-button"
        href={postHogUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open in PostHog"
        title="Open in PostHog"
      >
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </a>
    {/if}
  </header>

  <div class="player">
    {#if !loaded}
      <SessionReplayPanel fill state="loading" />
    {:else if loadError}
      <div class="notice" role="alert">
        <strong>Visit unavailable</strong>
        <span>{loadError}</span>
      </div>
    {:else if !visitor}
      <div class="notice" role="status">
        <strong>No visitors in this alert</strong>
      </div>
    {:else if !sessionId}
      <div class="notice" role="status">
        <strong>No recording for this visitor</strong>
        <span>
          PostHog never started in their browser (blocked, or they left within a
          few seconds), so there is nothing to replay.
        </span>
      </div>
    {:else}
      <SessionReplayPanel
        fill
        state={replayState}
        {embedUrl}
        message={replayMessage}
        onretry={() => (retryNonce += 1)}
      />
    {/if}
  </div>

  {#if visitors.length > 1}
    <nav class="visitors" aria-label="Visitors in this alert">
      {#each visitors as v, i (i)}
        <button
          type="button"
          class="chip"
          class:active={i === selected}
          aria-pressed={i === selected}
          onclick={() => (selected = i)}
        >
          {v.place} · {v.source}
          {#if !v.postHogSessionId}
            <i class="fas fa-video-slash" aria-label="No recording"></i>
          {/if}
        </button>
      {/each}
    </nav>
  {/if}
</main>

<style>
  .visitor-screen {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100dvh;
    gap: 0.5rem;
    padding: max(0.5rem, env(safe-area-inset-top)) 0.5rem
      max(0.5rem, env(safe-area-inset-bottom));
    overflow: hidden;
    color: var(--theme-text, #f7f7fb);
    background: var(--theme-bg, #0f1015);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .caption {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-button {
    display: inline-grid;
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    place-items: center;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text);
    background: transparent;
    cursor: pointer;
    text-decoration: none;
  }

  .icon-button:hover,
  .icon-button:focus-visible {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  }

  .player {
    min-height: 0;
  }

  .notice {
    display: grid;
    height: 100%;
    place-content: center;
    gap: 0.4rem;
    padding: 1.5rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    text-align: center;
  }

  .notice strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .visitors {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chip {
    flex: none;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text-dim);
    background: transparent;
    font-size: var(--font-size-compact);
    white-space: nowrap;
    cursor: pointer;
  }

  .chip.active {
    border-color: var(--theme-accent);
    color: var(--theme-text);
    background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  }

  .chip i {
    margin-left: 0.3rem;
    opacity: 0.7;
  }
</style>
