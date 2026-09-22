<script lang="ts">
  import InstagramIcon from "$lib/shared/auth/components/icons/InstagramIcon.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import { getPostDeliveryContext } from "$lib/shared/share/context/post-delivery-context";
  import {
    countInstagramCaptionParts,
    evaluateInstagramPublishEligibility,
  } from "$lib/shared/share/domain/instagram/instagram-post-policy";
  import { metaErrorMessage } from "$lib/shared/share/services/meta-publish";

  interface Props {
    previewUrl: string;
    mediaKind: "image" | "video";
    hasAudio: boolean;
    busy: boolean;
    stage: string;
    postedPermalink: string | null;
    onBack: () => void;
    onClose: () => void;
    onEditComposition: () => void;
    onPost: () => void;
    onHandoff: () => void;
    onReconnect: () => void;
  }

  let {
    previewUrl,
    mediaKind,
    hasAudio,
    busy,
    stage,
    postedPermalink,
    onBack,
    onClose,
    onEditComposition,
    onPost,
    onHandoff,
    onReconnect,
  }: Props = $props();

  const { state: postState } = getPostDeliveryContext();
  let reviewWidth = $state(0);
  const compactReview = $derived(reviewWidth <= 54 * 16);
  const draft = $derived(postState.draft);
  const capability = $derived(postState.capabilitySnapshot);
  const eligibility = $derived(
    evaluateInstagramPublishEligibility(draft, capability)
  );
  const captionParts = $derived(countInstagramCaptionParts(draft.caption));
  const accountName = $derived(capability?.username ?? "Instagram");
  const formatLabel = $derived(
    draft.format === "reel"
      ? "Reel"
      : draft.format === "image"
        ? "Feed image"
        : draft.format === "carousel"
          ? "Carousel"
          : "Story"
  );

  function directPublishMessage(): string {
    if (eligibility.reasonCode === "meta/capabilities-missing") {
      return "Reconnect Instagram so Flow Arts Composer can verify what this account supports.";
    }
    if (eligibility.reasonCode === "meta/account-mismatch") {
      return "This draft belongs to a different Instagram account.";
    }
    return eligibility.reasonCode
      ? metaErrorMessage(eligibility.reasonCode)
      : "This post is ready.";
  }
</script>

<section
  class="review-shell"
  aria-label="Review Instagram post"
  bind:clientWidth={reviewWidth}
>
  <header class="review-header">
    <button class="header-action" type="button" onclick={onBack}>
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      Back to sharing
    </button>
    <div class="title-group">
      <span class="eyebrow">Instagram Review</span>
      <h2>Check the post before publishing</h2>
    </div>
    <button
      class="close-button"
      type="button"
      onclick={onClose}
      aria-label="Close share sheet"
    >
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  <div class="mobile-view-picker">
    <SegmentedControl
      options={[
        { value: "preview", label: "Preview" },
        { value: "details", label: "Post details" },
      ]}
      value={postState.mobileView}
      onchange={postState.setMobileView}
      ariaLabel="Instagram review view"
      semantics="radiogroup"
      size="sm"
      color="accent"
    />
  </div>

  <div class="review-body" data-mobile-view={postState.mobileView}>
    <section
      class="preview-column"
      aria-label="Final media preview"
      inert={compactReview && postState.mobileView !== "preview"}
      aria-hidden={compactReview && postState.mobileView !== "preview"}
    >
      <div class="preview-toolbar">
        <span>{formatLabel}</span>
        <span class="ratio">{draft.format === "reel" ? "9:16" : "4:5"}</span>
      </div>
      <div class="media-frame" class:video={mediaKind === "video"}>
        {#if mediaKind === "video"}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={previewUrl} controls playsinline></video>
        {:else}
          <img src={previewUrl} alt="Final Instagram post preview" />
        {/if}
      </div>
      <button
        class="secondary-action edit-composition"
        type="button"
        onclick={onEditComposition}
      >
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        Edit composition
      </button>
    </section>

    <section
      class="details-column"
      aria-label="Instagram post details"
      inert={compactReview && postState.mobileView !== "details"}
      aria-hidden={compactReview && postState.mobileView !== "details"}
    >
      <div class="account-card">
        <span class="instagram-mark"><InstagramIcon /></span>
        <span class="account-copy">
          <strong>@{accountName}</strong>
          <span
            >{capability?.route === "facebook-login"
              ? "Facebook Login"
              : "Instagram Login"}</span
          >
        </span>
        <span class="format-badge">{formatLabel}</span>
      </div>

      <div class="detail-card caption-card">
        <div class="section-heading">
          <label for="instagram-review-caption">Caption</label>
          <span class="caption-counts">
            <span>{captionParts.characters}/2,200</span>
            <span>{captionParts.hashtags}/30 #</span>
            <span>{captionParts.mentions}/20 @</span>
          </span>
        </div>
        <textarea
          id="instagram-review-caption"
          value={draft.caption}
          rows="5"
          maxlength="2200"
          oninput={(event) => postState.setCaption(event.currentTarget.value)}
        ></textarea>
      </div>

      {#if draft.format === "reel"}
        <div class="detail-card" transition:growFade={{ axis: "y" }}>
          <div class="section-heading">
            <span>Where the Reel appears</span>
          </div>
          <SegmentedControl
            options={[
              { value: "feed", label: "Feed + Reels" },
              { value: "reels", label: "Reels only" },
            ]}
            value={draft.instagram.shareToFeed === false ? "reels" : "feed"}
            onchange={(value) => postState.setShareToFeed(value === "feed")}
            ariaLabel="Where the Reel appears"
            semantics="radiogroup"
            size="sm"
            color="accent"
          />
        </div>
      {/if}

      {#if hasAudio}
        <div class="detail-card sound-card" transition:growFade={{ axis: "y" }}>
          <span class="detail-icon">
            <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
          </span>
          <span>
            <strong>Original sound</strong>
            <small>Included in the rendered video</small>
          </span>
        </div>
      {/if}

      {#if !eligibility.canPublishDirectly}
        <div
          class="recovery-card"
          role="status"
          transition:growFade={{ axis: "y" }}
        >
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <span>{directPublishMessage()}</span>
          {#if eligibility.recoveryAction === "reconnect"}
            <button type="button" onclick={onReconnect}>Reconnect</button>
          {/if}
        </div>
      {/if}

      <div class="delivery-actions">
        {#if postedPermalink}
          <a
            class="primary-action"
            href={postedPermalink}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Instagram
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"
            ></i>
          </a>
        {:else}
          <button
            class="primary-action"
            type="button"
            disabled={busy || !eligibility.canPublishDirectly}
            onclick={onPost}
          >
            {#if busy}
              <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"
              ></i>
              <span>{stage || "Publishing…"}</span>
            {:else}
              <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
              <span>Post now</span>
            {/if}
          </button>
        {/if}
        <button class="secondary-action" type="button" onclick={onHandoff}>
          <i class="fa-brands fa-instagram" aria-hidden="true"></i>
          Finish in Instagram
        </button>
      </div>
    </section>
  </div>
</section>

<style>
  .review-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: min(88dvh, 96rem);
    margin: 0 auto;
    color: var(--theme-text, #fff);
    background: var(--theme-panel-bg, #111118);
    container-type: inline-size;
  }

  .review-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .title-group {
    min-width: 0;
  }

  .eyebrow {
    display: block;
    margin-bottom: 0.15rem;
    color: var(--theme-accent, #22d3ee);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: clamp(1.05rem, 2.2cqw, 1.55rem);
    line-height: 1.15;
  }

  button,
  a {
    font: inherit;
  }

  .header-action,
  .close-button,
  .secondary-action,
  .primary-action,
  .recovery-card button {
    min-height: 44px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-md, 0.75rem);
    color: inherit;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    cursor: pointer;
  }

  .header-action,
  .secondary-action,
  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.65rem 0.9rem;
    text-decoration: none;
  }

  .close-button {
    display: grid;
    width: 44px;
    padding: 0;
    place-items: center;
  }

  .mobile-view-picker {
    display: none;
  }

  .review-body {
    display: grid;
    grid-template-columns: minmax(26rem, 1fr) minmax(30rem, 38rem);
    min-height: 0;
  }

  .preview-column,
  .details-column {
    min-width: 0;
    min-height: 0;
    padding: 1.25rem;
  }

  .preview-column {
    --preview-width: min(
      100%,
      clamp(25rem, 45cqw, 41rem),
      calc(min(70.4dvh, 76.8rem) - 14.4rem)
    );
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    background: color-mix(in srgb, var(--theme-card-bg, #09090f) 74%, black);
  }

  .preview-column:has(.media-frame.video) {
    --preview-width: min(
      100%,
      clamp(18rem, 34cqw, 32rem),
      calc(min(49.5dvh, 54rem) - 10.125rem)
    );
  }

  .preview-toolbar {
    display: flex;
    justify-content: space-between;
    width: var(--preview-width);
    color: var(--theme-text-secondary, #b6b6c5);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
  }

  .ratio,
  .caption-counts,
  .format-badge {
    font-variant-numeric: tabular-nums;
  }

  .media-frame {
    display: grid;
    flex-shrink: 0;
    width: var(--preview-width);
    max-height: 62dvh;
    overflow: hidden;
    aspect-ratio: 4 / 5;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 35%, transparent);
    border-radius: var(--radius-2026-lg, 1rem);
    background: #06060a;
    place-items: center;
  }

  .media-frame.video {
    aspect-ratio: 9 / 16;
  }

  .media-frame img,
  .media-frame video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .edit-composition {
    width: var(--preview-width);
  }

  .details-column {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    overflow-y: auto;
  }

  .account-card,
  .detail-card,
  .recovery-card {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-2026-md, 0.8rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .account-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.8rem;
  }

  .instagram-mark,
  .detail-icon {
    display: grid;
    flex: 0 0 auto;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.7rem;
    background: linear-gradient(135deg, #f9ce34, #ee2a7b 52%, #6228d7);
    place-items: center;
  }

  .account-copy,
  .sound-card > span:last-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .account-copy span,
  .sound-card small {
    color: var(--theme-text-secondary, #a9a9b7);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .format-badge {
    padding: 0.35rem 0.55rem;
    border-radius: 999px;
    color: var(--theme-accent, #22d3ee);
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 13%,
      transparent
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
  }

  .detail-card {
    padding: 0.9rem;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
  }

  .caption-counts {
    display: flex;
    gap: 0.55rem;
    color: var(--theme-text-secondary, #a9a9b7);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  textarea {
    width: 100%;
    min-height: 7rem;
    resize: vertical;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.65rem;
    color: inherit;
    background: color-mix(in srgb, var(--theme-panel-bg, #111118) 88%, black);
    font: inherit;
    line-height: 1.45;
  }

  .sound-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .detail-icon {
    width: 2.25rem;
    height: 2.25rem;
    color: var(--theme-accent, #22d3ee);
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 14%,
      transparent
    );
  }

  .recovery-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem;
    border-color: color-mix(in srgb, #f59e0b 42%, transparent);
    color: #f8d895;
    background: color-mix(in srgb, #f59e0b 9%, var(--theme-card-bg, #15151d));
  }

  .recovery-card button {
    padding: 0.45rem 0.7rem;
  }

  .delivery-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
    margin-top: auto;
    padding-top: 0.2rem;
  }

  .primary-action {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 60%,
      transparent
    );
    color: #fff;
    background: linear-gradient(135deg, #ee2a7b, #6228d7);
    font-weight: 800;
  }

  .primary-action:disabled {
    cursor: not-allowed;
    filter: saturate(0.35);
    opacity: 0.48;
  }

  .header-action:hover,
  .close-button:hover,
  .secondary-action:hover,
  .recovery-card button:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 10%,
      var(--theme-card-bg, #15151d)
    );
  }

  @container (max-width: 54rem) {
    .review-header {
      grid-template-columns: auto 1fr auto;
    }

    .header-action {
      width: 44px;
      padding: 0;
      font-size: 0;
    }

    .header-action i {
      font-size: 0.95rem;
    }

    .mobile-view-picker {
      display: flex;
      justify-content: center;
      padding: 0.7rem 1rem 0;
    }

    .review-body {
      position: relative;
      display: block;
      overflow-y: auto;
    }

    /* Keep both views mounted so changing the picker never tears down media.
       Only the active view remains in normal flow; the fading source overlays
       it and cannot reserve the other view's full scroll height. */
    .preview-column,
    .details-column {
      position: absolute;
      inset: 0;
      width: 100%;
      box-sizing: border-box;
      transition:
        opacity var(--transition-normal),
        visibility 0s linear var(--duration-normal);
    }

    .review-body[data-mobile-view="details"] .preview-column,
    .review-body[data-mobile-view="preview"] .details-column {
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
    }

    .review-body[data-mobile-view="preview"] .preview-column,
    .review-body[data-mobile-view="details"] .details-column {
      position: relative;
      inset: auto;
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
      transition-delay: 0s;
    }

    .preview-column,
    .details-column {
      overflow: visible;
      padding: 1rem;
    }

    .media-frame {
      max-height: 56dvh;
    }
  }

  @container (min-width: 95rem) {
    .review-header {
      padding: 1.25rem 1.6rem;
    }

    .review-body {
      grid-template-columns: minmax(34rem, 1fr) minmax(36rem, 42rem);
      min-height: min(78dvh, 90rem);
    }

    .preview-column,
    .details-column {
      padding: 1.6rem;
    }

    .preview-column {
      --preview-width: min(
        100%,
        clamp(32rem, 48cqw, 50rem),
        calc(min(70.4dvh, 76.8rem) - 14.4rem)
      );
    }

    .preview-column:has(.media-frame.video) {
      --preview-width: min(
        100%,
        clamp(24rem, 36cqw, 40rem),
        calc(min(49.5dvh, 54rem) - 10.125rem)
      );
    }

    .media-frame {
      max-height: 70dvh;
    }

    .details-column {
      gap: 1rem;
      font-size: 1.05rem;
    }

    .account-card,
    .detail-card,
    .recovery-card {
      border-radius: 1rem;
    }
  }

  @container (max-width: 30rem) {
    .review-header {
      gap: 0.6rem;
      padding: 0.8rem;
    }

    .eyebrow {
      display: none;
    }

    h2 {
      font-size: 1rem;
    }

    .section-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.35rem;
    }

    .caption-counts {
      width: 100%;
      justify-content: space-between;
    }

    .delivery-actions {
      grid-template-columns: 1fr 1fr;
      gap: 0.45rem;
    }

    .delivery-actions .primary-action,
    .delivery-actions .secondary-action {
      padding-inline: 0.45rem;
      font-size: 0.75rem;
    }

    .recovery-card {
      grid-template-columns: auto 1fr;
    }

    .recovery-card button {
      grid-column: 1 / -1;
    }
  }

  @media (max-height: 500px) and (min-width: 700px) {
    .review-shell {
      max-height: calc(100dvh - 3rem);
    }

    .review-header {
      padding-block: 0.55rem;
    }

    .review-body {
      grid-template-columns: 10rem 1fr;
      overflow: hidden;
    }

    .preview-column,
    .details-column {
      padding: 0.7rem;
    }

    .preview-column {
      --preview-width: min(100%, 8rem);
      gap: 0.35rem;
    }

    .media-frame {
      max-height: 10rem;
    }

    .edit-composition {
      min-height: 40px;
      font-size: 0;
    }

    .edit-composition i {
      font-size: 0.95rem;
    }

    .details-column {
      gap: 0.45rem;
      overflow-y: auto;
    }

    .account-card,
    .detail-card {
      padding: 0.55rem;
    }

    .instagram-mark {
      width: 2rem;
      height: 2rem;
    }

    .section-heading {
      margin-bottom: 0.35rem;
    }

    textarea {
      height: 4.5rem;
      min-height: 4.5rem;
      resize: none;
    }

    .delivery-actions {
      padding-top: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    @container (max-width: 54rem) {
      .preview-column,
      .details-column {
        transition: none;
      }
    }
  }
</style>
