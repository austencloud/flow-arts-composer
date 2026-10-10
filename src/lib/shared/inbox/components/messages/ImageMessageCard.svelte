<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getBlob, ref } from "firebase/storage";
  import { getStorageInstance } from "#lib/shared/auth/firebase.js";
  import MediaSpotlight from "#lib/components/media/spotlight/MediaSpotlight.svelte";
  import type { MessageAttachment } from "#lib/shared/messaging/domain/models/message-models.js";

  interface Props {
    attachment: MessageAttachment;
    caption?: string;
    localFile?: Blob;
  }

  let { attachment, caption = "", localFile }: Props = $props();
  let imageUrl = $state<string | null>(null);
  let loadError = $state(false);
  let spotlightOpen = $state(false);

  const altText = $derived(caption.trim() || attachment.name || t("inbox_ui_shared_image"));
  const aspectRatio = $derived.by(() => {
    const width = attachment.width ?? attachment.metadata?.width;
    const height = attachment.height ?? attachment.metadata?.height;
    if (!width || !height || width <= 0 || height <= 0) return "4 / 3";
    return `${width} / ${height}`;
  });
  const spotlightItems = $derived(
    imageUrl
      ? [
          {
            id: attachment.id || attachment.storagePath || "image",
            url: imageUrl,
            type: "image" as const,
            alt: altText,
          },
        ]
      : []
  );

  $effect(() => {
    const storagePath = attachment.storagePath;
    let active = true;
    let objectUrl: string | null = null;
    imageUrl = null;
    loadError = false;

    if (localFile) {
      objectUrl = URL.createObjectURL(localFile);
      imageUrl = objectUrl;
      return () => URL.revokeObjectURL(objectUrl!);
    }

    if (!storagePath?.startsWith("message-images/")) {
      loadError = true;
      return undefined;
    }

    void (async () => {
      try {
        const storage = await getStorageInstance();
        const blob = await getBlob(ref(storage, storagePath), 12 * 1024 * 1024);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        imageUrl = objectUrl;
      } catch (error) {
        if (!active) return;
        console.error(
          "[ImageMessageCard] Failed to load private image:",
          error
        );
        loadError = true;
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<div class="image-card" style:--image-aspect-ratio={aspectRatio}>
  {#if imageUrl}
    <button
      type="button"
      class="image-button"
      onclick={() => (spotlightOpen = true)}
      aria-label={t("inbox_ui_open_image")}
    >
      <img src={imageUrl} alt={altText} />
      <span class="expand-hint" aria-hidden="true">
        <i class="fas fa-expand"></i>
      </span>
    </button>
  {:else if loadError}
    <div class="image-state unavailable" role="status">
      <i class="fas fa-image" aria-hidden="true"></i>
      <span>{t("inbox_ui_image_unavailable")}</span>
    </div>
  {:else}
    <div class="image-state" role="status" aria-label={t("inbox_ui_loading_image")}>
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    </div>
  {/if}
</div>

{#if imageUrl}
  <MediaSpotlight
    bind:open={spotlightOpen}
    items={spotlightItems}
    onclose={() => (spotlightOpen = false)}
    showFilmstrip={false}
  />
{/if}

<style>
  .image-card {
    width: min(280px, 70vw);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-card-bg) 85%, black);
  }

  .image-button,
  .image-state {
    width: 100%;
    aspect-ratio: var(--image-aspect-ratio);
    min-height: 140px;
    max-height: 360px;
  }

  .image-button {
    position: relative;
    display: block;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .image-button img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .image-button:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: -3px;
  }

  .expand-hint {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.68);
    color: white;
    opacity: 0;
    transition: opacity var(--duration-fast) ease;
  }

  .image-button:hover .expand-hint,
  .image-button:focus-visible .expand-hint {
    opacity: 1;
  }

  .image-state {
    display: grid;
    place-items: center;
    color: var(--theme-text-dim);
  }

  .image-state.unavailable {
    align-content: center;
    gap: 8px;
    font-size: var(--font-size-compact);
  }

  .image-state.unavailable i {
    font-size: 1.5rem;
  }

  @media (hover: none) {
    .expand-hint {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .expand-hint {
      transition: none;
    }
  }
</style>
