<!--
  ComposerGalleryDemo

  The "keeping" beat's evidence: the real community gallery, mounted standalone
  in a bounded product frame. Same engine + BrowsePanel wiring the
  /test/gallery-redesign harness proves, with the drill and the source toggle
  off — this page only shows the community pool.

  The frame owns a fixed height and the panel owns the scroll inside it, so the
  page never scrolls the whole community pool.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: "community",
    sections: false,
    allowSourceToggle: false,
    sources: ["community"],
  });

  let status = $state<"loading" | "ready" | "error">("loading");

  async function load(): Promise<void> {
    status = "loading";
    try {
      // initialize() resolves even on a loader failure — it records the reason
      // on the engine rather than throwing, so the frame reads that.
      await engine.initialize();
      status = engine.error ? "error" : "ready";
    } catch {
      status = "error";
    }
  }

  onMount(() => {
    if (!browser) return;
    // The grid's hover prefetch hydrates a sequence for the viewer, and that
    // path resolves the LOOP detector from the registry. Marketing routes do
    // not mount the app composition root, so this page registers it the same
    // way the standalone /sequence route does.
    registerLoopDetector(loopDetector);
    void load();
    return () => engine.destroy();
  });
</script>

<div class="gallery-frame">
  {#if status === "ready"}
    <BrowsePanel
      {engine}
      layout="fullpage"
      showSidebar={false}
      showFilterBar
      showSourceToggle={false}
      toolbarVariant="embedded"
      eager
      onSelect={(sequence: SequenceData) =>
        void goto(`/sequence/${sequence.id}`)}
    />
  {:else if status === "loading"}
    <div class="gallery-skeleton" aria-hidden="true">
      {#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
        <div class="skeleton-cell" style:--stagger={i}></div>
      {/each}
    </div>
    <span class="sr-only" role="status"
      >{t("composer_demo_gallery_loading")}</span
    >
  {:else}
    <div class="gallery-error" role="alert">
      <p>{t("composer_gallery_demo_failed")}</p>
      <button type="button" onclick={() => void load()}>
        {t("composer_retry_gallery")}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Matches .product-frame in +page.svelte, plus a bounded height so the
     panel's own scroller — not the page — owns the community pool. */
  .gallery-frame {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: var(--composer-gallery-height, 80rem);
    overflow: hidden;
    padding: clamp(0.75rem, 1.7vw, 1.4rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: clamp(1rem, 1.5vw, 1.5rem);
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.94));
    box-shadow: 0 1.5rem 4rem oklch(0.04 0.03 270 / 0.3);
  }

  .gallery-frame :global(.browse-panel) {
    flex: 1;
    min-height: 0;
  }

  /* The skeleton fills the same bounded frame, so nothing moves when the real
     grid replaces it. */
  .gallery-skeleton {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    gap: clamp(0.8rem, 1.4vw, 1.4rem);
    overflow: hidden;
  }

  .skeleton-cell {
    border-radius: 0.9rem;
    background: linear-gradient(
      100deg,
      oklch(0.2 0.03 270 / 0.7) 40%,
      oklch(0.26 0.04 274 / 0.8) 50%,
      oklch(0.2 0.03 270 / 0.7) 60%
    );
    background-size: 200% 100%;
    animation: gallery-shimmer 1.6s ease-in-out infinite;
    animation-delay: calc(var(--stagger) * 90ms);
  }

  @keyframes gallery-shimmer {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -80% 0;
    }
  }

  .gallery-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    color: oklch(0.72 0.02 270);
    font-size: var(--font-size-min, 0.875rem);
  }

  .gallery-error p {
    margin: 0;
  }

  .gallery-error button {
    min-height: max(var(--min-touch-target, 48px), 48px);
    display: inline-flex;
    align-items: center;
    padding: 0.72em 1.15em;
    border: 1px solid var(--theme-stroke-strong, oklch(0.58 0.04 270 / 0.34));
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: var(--theme-card-bg, oklch(0.18 0.025 270 / 0.75));
    color: #fff;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 680;
    cursor: pointer;
  }

  .gallery-error button:hover {
    border-color: oklch(0.72 0.12 277 / 0.65);
  }

  .gallery-error button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-cell {
      animation: none;
    }
  }
</style>
