<!--
  Release notes preview: the draft notes in the real Release Notes view and
  What's New sheet, examples included, before anything is released.

  Reads `changelog.json` (the release manifest) and the composed examples
  from the release media output folder through /api/dev/release-media, and
  points each example's CDN address at that local copy. The notes go through
  AppVersionSchema like a Firestore version does, so a bad example drops
  here the same way it would in the app. `?modal=1` opens What's New on load.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { AppVersionSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";
  import type { AppVersion } from "#lib/shared/versioning/domain/models/version-models.js";
  import { whatsNewState } from "#lib/shared/settings/state/whats-new-state.svelte.js";
  import VersionDetailContent from "#lib/shared/settings/components/tabs/release-notes/VersionDetailContent.svelte";
  import WhatsNewModal from "#lib/shared/settings/components/WhatsNewModal.svelte";

  const CDN = /^https:\/\/assets\.tkaflowarts\.com\/email\/releases\/[\d.]+\//;
  const versionName = page.url.searchParams.get("version") ?? "0.49.0";

  let version = $state<AppVersion | null>(null);
  let problem = $state<string | null>(null);

  // The local copy is served over plain http, which the schema rightly
  // refuses, so the schema checks the real addresses and the swap comes after.
  const local = (address: string | undefined) =>
    address?.replace(CDN, `${page.url.origin}/api/dev/release-media?file=`);

  async function load() {
    const response = await fetch("/api/dev/release-media?file=changelog.json");
    if (!response.ok) throw new Error(`changelog.json: ${response.status}`);
    const entries = (await response.json()) as { text: string }[];
    const parsed = AppVersionSchema.parse({
      id: versionName,
      version: versionName,
      releasedAt: new Date().toISOString(),
      highlights: entries[0] ? [entries[0].text] : [],
      changelogEntries: entries,
    });
    return {
      version: parsed.version,
      releasedAt: parsed.releasedAt,
      feedbackCount: parsed.feedbackCount,
      feedbackSummary: parsed.feedbackSummary,
      highlights: parsed.highlights,
      changelogEntries: parsed.changelogEntries?.map((entry) =>
        entry.media
          ? {
              ...entry,
              media: {
                ...entry.media,
                image: local(entry.media.image)!,
                video: local(entry.media.video),
                poster: local(entry.media.poster),
              },
            }
          : entry
      ),
    } as AppVersion;
  }

  onMount(async () => {
    try {
      version = await load();
      if (page.url.searchParams.get("modal") === "1")
        whatsNewState.open(version);
    } catch (cause) {
      problem = cause instanceof Error ? cause.message : String(cause);
    }
  });
</script>

<main>
  {#if problem}
    <p role="alert">{problem}</p>
  {:else if version}
    <button
      onclick={() => version && whatsNewState.open(version)}
      data-open-whats-new
    >
      Open What's New
    </button>
    <VersionDetailContent {version} showCloseButton={false} />
  {:else}
    <p>Loading the draft notes…</p>
  {/if}
</main>

<WhatsNewModal />

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px;
    min-height: 100vh;
    color: var(--theme-text);
    background: var(--theme-panel-bg, #0a0a14);
  }
  button {
    margin-bottom: 16px;
  }
</style>
