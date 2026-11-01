<!--
  Release tour test route: "Show me" on release notes and the arrival that
  follows a highlight's click, on fixture data and without Firestore.

  The What's New sheet opens on a fixture release whose entries cover every
  "Show me" case: a tab a guest can open, an account-only tab, a global note
  and a note pointing at a module that no longer exists. The page below the
  sheet is long on purpose, with a data-release-anchor far down it, so the
  arrival has to scroll. "Arrive here" promises that arrival the way a
  highlight's "Show me" does, without leaving the page; "Arrive with no
  anchor" exercises the callout fallback. `?modal=0` keeps the sheet closed.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import type { AppVersion } from "#lib/shared/versioning/domain/models/version-models.js";
  import { whatsNewState } from "#lib/shared/settings/state/whats-new-state.svelte.js";
  import { releaseTourState } from "#lib/shared/settings/state/release-tour-state.svelte.js";
  import WhatsNewModal from "#lib/shared/settings/components/WhatsNewModal.svelte";
  import ReleaseTourArrival from "#lib/shared/settings/components/ReleaseTourArrival.svelte";
  import ToastContainer from "#lib/shared/toast/components/ToastContainer.svelte";

  const version: AppVersion = {
    version: "0.50.0",
    releasedAt: new Date("2026-11-01T00:00:00Z"),
    feedbackCount: 0,
    feedbackSummary: { bugs: 0, features: 0, general: 0 },
    changelogEntries: [
      {
        category: "added",
        text: "Release notes now take you to the change they describe.",
        surface: { module: "settings", tab: "preferences" },
        highlight: true,
        anchor: "settings-whats-new",
        callout: "Open What's new here any time to catch up.",
      },
      {
        category: "improved",
        text: "Fuse mixes two saved sequences after signing in.",
        surface: { module: "create", tab: "fuse" },
      },
      {
        category: "improved",
        text: "Everything loads a little faster.",
        surface: "global",
      },
      {
        category: "fixed",
        text: "A note about a tab that has since moved on.",
        surface: { module: "mandala", tab: "draw" },
      },
      {
        category: "fixed",
        text: "A note from before notes knew where they pointed.",
      },
    ],
  };

  // An older release, for the catch-up sheet that rolls several together.
  const older: AppVersion = {
    version: "0.49.0",
    releasedAt: new Date("2026-10-20T00:00:00Z"),
    feedbackCount: 0,
    feedbackSummary: { bugs: 0, features: 0, general: 0 },
    changelogEntries: [
      {
        category: "added",
        text: "Settings remember your display choices.",
        surface: { module: "settings", tab: "display" },
      },
      {
        category: "fixed",
        text: "The theme picker no longer flickers.",
        surface: { module: "settings", tab: "theme" },
      },
    ],
  };

  function openRollup() {
    whatsNewState.unseenVersions = [version, older];
    whatsNewState.openRollup();
  }

  onMount(() => {
    if (page.url.searchParams.get("modal") !== "0") {
      whatsNewState.openDetail(version);
    }
  });

  function arriveHere() {
    releaseTourState.setPending({
      moduleId: "settings",
      tabId: "preferences",
      anchor: "release-tour-demo",
      callout: "You would read this if the anchor were gone.",
    });
  }

  function arriveWithoutAnchor() {
    releaseTourState.setPending({
      moduleId: "settings",
      tabId: "preferences",
      anchor: "release-tour-missing",
      callout: "The anchor is gone, so this line says hello instead.",
    });
  }
</script>

<main>
  <h1>Release tour</h1>
  <div class="controls">
    <button type="button" onclick={() => whatsNewState.openDetail(version)}>
      Open What's New
    </button>
    <button type="button" data-open-rollup onclick={openRollup}>
      Open catch-up sheet
    </button>
    <button type="button" data-arrive onclick={arriveHere}>Arrive here</button>
    <button type="button" data-arrive-callout onclick={arriveWithoutAnchor}>
      Arrive with no anchor
    </button>
  </div>

  <div class="filler" aria-hidden="true">
    {#each Array.from({ length: 40 }) as _, i}
      <p>Filler paragraph {i + 1} keeps the anchor well below the fold.</p>
    {/each}
  </div>

  <section class="target" data-release-anchor="release-tour-demo">
    <h2>The anchored change</h2>
    <p>A highlight's "Show me" lands here, scrolled into view and pulsed.</p>
  </section>

  <div class="filler" aria-hidden="true">
    {#each Array.from({ length: 20 }) as _, i}
      <p>Trailing paragraph {i + 1}.</p>
    {/each}
  </div>
</main>

<WhatsNewModal />
<ReleaseTourArrival />
<ToastContainer />

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px;
    color: var(--theme-text, #eee);
    background: var(--theme-panel-bg, #0a0a14);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .filler p {
    margin: 0 0 24px;
    color: var(--theme-text-dim, #999);
  }
  .target {
    padding: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
  }
</style>
