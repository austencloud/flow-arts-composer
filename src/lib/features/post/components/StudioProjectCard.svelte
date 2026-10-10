<script lang="ts">
  import { onMount } from "svelte";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { isTkaWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { StudioLibraryEntry } from "./studio-library-entry.js";
  import type { StudioProjectPreview } from "../services/studio-project-library.js";

  let {
    entry,
    active = false,
    onpreview,
    onopen,
    oncopy,
    disabled = false,
  }: {
    entry: StudioLibraryEntry;
    active?: boolean;
    onpreview: (id: string | null) => void;
    onopen: () => void;
    oncopy?: () => void;
    disabled?: boolean;
  } = $props();
  let host: HTMLElement;
  let video = $state<HTMLVideoElement | null>(null);
  let visible = $state(false);
  let preview = $state.raw<StudioProjectPreview | null>(null);
  let loading = $state(true);
  let failed = $state(false);
  let mediaFailed = $state(false);
  let moving = $state(false);
  let prefersReducedMotion = $state(reducedMotion());
  const labels = {
    tutorial: "Sequence video",
    showcase: "Software showcase",
    arrangement: "Arrangement",
  };
  const duration = $derived(
    preview?.duration
      ? `${Math.floor(preview.duration / 60)}:${String(Math.floor(preview.duration % 60)).padStart(2, "0")}`
      : null
  );
  const format = $derived(
    preview
      ? preview.width === preview.height
        ? "Square"
        : preview.width > preview.height
          ? "Landscape"
          : "Portrait"
      : null
  );
  const canPreview = $derived(
    !!(
      preview?.sequence?.steps?.length ||
      (preview?.cover?.kind === "video" && !mediaFailed)
    )
  );
  const details = $derived(
    [
      format,
      preview?.itemCount ? `${preview.itemCount} clips` : null,
      preview?.kinds?.slice(0, 3).join(", "),
    ]
      .filter(Boolean)
      .join(" · ")
  );

  onMount(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      prefersReducedMotion = motionQuery.matches;
    };
    updateMotion();
    motionQuery.addEventListener("change", updateMotion);
    const observer = new IntersectionObserver(
      ([event]) => {
        visible = !!event?.isIntersecting;
        if (!visible && active) onpreview(null);
      },
      { rootMargin: "120px" }
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", updateMotion);
    };
  });
  $effect(() => {
    if (!visible || preview || failed) return;
    let current = true;
    void import("../services/studio-project-library.js")
      .then((service) =>
        service.loadStudioProjectPreview({
          sequenceId: entry.sequenceId,
          featureSlug: entry.featureSlug,
        })
      )
      .then((result) => {
        if (current) {
          loading = false;
          preview = result;
          failed = !result;
        }
      })
      .catch(() => {
        if (current) {
          loading = false;
          failed = true;
        }
      });
    return () => {
      current = false;
    };
  });
  $effect(() => {
    moving = active && visible && !prefersReducedMotion;
    if (!video) return;
    if (moving) void video.play().catch(() => {});
    else video.pause();
  });
  function activate(): void {
    if (canPreview && !prefersReducedMotion) onpreview(entry.id);
  }
  function seekCover(): void {
    if (video)
      video.currentTime = Math.min(
        preview?.cover?.time ?? 0.1,
        Math.max(0, video.duration - 0.1)
      );
  }
</script>

<article
  bind:this={host}
  class="project-card"
  onmouseleave={() => active && onpreview(null)}
>
  <button
    class="open-project"
    type="button"
    {disabled}
    onclick={onopen}
    onmouseenter={activate}
    onfocus={activate}
    onblur={() => active && onpreview(null)}
    aria-label={`Open ${entry.title}`}
  >
    <div class="cover">
      {#if preview?.cover && !mediaFailed}
        {#if preview.cover.kind === "image"}
          <img
            src={preview.cover.url}
            alt=""
            loading="lazy"
            onerror={() => (mediaFailed = true)}
          />
        {:else}
          <!-- svelte-ignore a11y_media_has_caption This muted decorative preview has its title and contents below. -->
          <video
            bind:this={video}
            src={preview.cover.url}
            muted
            playsinline
            loop
            preload="metadata"
            onloadedmetadata={seekCover}
            onerror={() => (mediaFailed = true)}
          ></video>
        {/if}
        <span class="preview-label"
          >{moving
            ? preview.cover.kind === "video"
              ? "Playing source clip"
              : "Sequence preview"
            : "Source preview"}</span
        >
      {:else if preview?.sequence?.steps?.length}
        <div class="sequence-cover">
          {#await import("#lib/shared/browse/components/PropAwareThumbnail.svelte") then module}
            <module.default
              sequence={preview.sequence}
              allowQR={false}
              shareRender={false}
            />
          {/await}
        </div>
        <span class="preview-label"
          >{moving ? "Sequence preview" : "Source sequence"}</span
        >
      {:else}
        <div class="unavailable">
          <i
            class={entry.kind === "arrangement"
              ? "fas fa-table-cells"
              : "fas fa-film"}
            aria-hidden="true"
          ></i>
          <span
            >{loading
              ? "Loading preview…"
              : preview?.itemCount === 0
                ? "Empty timeline"
                : "Preview unavailable"}</span
          >
        </div>
      {/if}
      {#if moving && preview?.sequence?.steps?.length && (preview.cover?.kind !== "video" || mediaFailed)}
        <div class="animation-cover">
          {#await import("#lib/shared/browse/components/hover-preview/CardHoverPreviewLayer.svelte") then module}
            <module.default sequence={preview.sequence} instant />
          {/await}
        </div>
      {/if}
      {#if duration}<span class="duration">{duration}</span>{/if}
    </div>
    <div class="card-text">
      <span class="kind">{labels[entry.kind]}</span>
      <div class="title" title={entry.title}>
        {#if isTkaWord(entry.title)}<TKAWordGlyph
            word={entry.title}
            height={24}
            darkMode
          />{:else}{entry.title}{/if}
      </div>
      <span class="details">{details}</span>
    </div>
  </button>
  <div class="card-footer">
    <time datetime={new Date(entry.updatedAt).toISOString()}
      >{new Date(entry.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}</time
    >
    {#if oncopy}<button
        class="copy"
        type="button"
        {disabled}
        onclick={oncopy}
        aria-label={`Make a copy of ${entry.title}`}
        ><i class="far fa-copy" aria-hidden="true"></i> Make a copy</button
      >{/if}
  </div>
</article>

<style>
  .project-card {
    min-width: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-card-bg);
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: progress;
    opacity: 0.6;
  }
  .open-project {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    text-align: left;
    background: transparent;
  }
  .open-project:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -3px;
  }
  .project-card:has(.open-project:hover),
  .project-card:focus-within {
    border-color: var(--theme-text-secondary);
  }
  .cover {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background: var(--theme-bg);
    isolation: isolate;
  }
  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .sequence-cover {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 32px;
  }
  .sequence-cover :global(.thumbnail-container) {
    max-height: 100%;
  }
  .animation-cover {
    position: absolute;
    inset: 0;
    background: var(--theme-bg);
  }
  .unavailable {
    display: grid;
    place-content: center;
    justify-items: center;
    height: 100%;
    gap: 14px;
    color: var(--theme-text-secondary);
    font-size: 14px;
  }
  .unavailable i {
    font-size: 30px;
    opacity: 0.55;
  }
  .duration,
  .preview-label {
    position: absolute;
    bottom: 10px;
    padding: 4px 7px;
    border-radius: 4px;
    background: #14161dee;
    color: #fff;
    font-size: 12px;
    line-height: 1.2;
    z-index: 2;
  }
  .duration {
    right: 10px;
    font-variant-numeric: tabular-nums;
  }
  .preview-label {
    left: 10px;
  }
  .card-text {
    display: grid;
    gap: 8px;
    padding: 16px 16px 8px;
  }
  .kind {
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  .title {
    font-size: 17px;
    font-weight: 650;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-height: 25px;
  }
  .details {
    font-size: 12px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
    min-height: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px 8px 16px;
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  .copy {
    border: 0;
    border-radius: 6px;
    background: transparent;
    min-height: 44px;
    padding: 8px;
    font-size: 12px;
  }
  .copy:hover {
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }
  .copy:focus-visible {
    outline: 2px solid var(--theme-accent);
  }
</style>
