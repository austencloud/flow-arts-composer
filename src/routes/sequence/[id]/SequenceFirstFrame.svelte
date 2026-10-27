<script lang="ts">
  /**
   * The sequence page's first frame: what the server already knows about the
   * sequence, drawn before the viewer's code arrives. The word, creator, step
   * count and the record's own stored thumbnail (the image Browse cards show),
   * so a phone visit sees the sequence instead of a bare bar for its first
   * seconds. Nothing here is interactive; the viewer's controls arrive with it.
   *
   * It renders on the server and keeps the same markup on the client until the
   * viewer module resolves. The capsule needs a client loading session, so it
   * joins on hydration inside a box that already holds its space.
   */
  import SequencePageLoading from "./SequencePageLoading.svelte";
  import type { LoadingSession } from "#lib/shared/loading/loading-session.svelte.js";
  import type { SequenceRouteMeta } from "./sequence-seo";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

  let {
    meta,
    session,
  }: { meta: SequenceRouteMeta; session: LoadingSession | null } = $props();

  const word = $derived(meta.word ? simplifyRepeatedWord(meta.word) : null);

  const facts = $derived(
    [
      meta.creator ? `by ${meta.creator}` : null,
      meta.stepCount
        ? `${meta.stepCount} ${meta.stepCount === 1 ? "step" : "steps"}`
        : null,
      meta.curated && meta.deckName ? meta.deckName : null,
    ].filter((fact): fact is string => fact !== null)
  );
</script>

<svelte:head>
  {#if word}
    <!-- The word is the frame's largest text; fetch its font with the HTML. -->
    <link
      rel="preload"
      href="/fonts/tka/tka.woff2"
      as="font"
      type="font/woff2"
      crossorigin="anonymous"
    />
  {/if}
</svelte:head>

<div
  class="sequence-first-frame text-primary"
  class:sequence-first-frame--word-only={!meta.thumbnailUrl}
>
  {#if meta.thumbnailUrl}
    <!-- Stored thumbnails are square card renders. -->
    <img
      class="sequence-first-frame__image"
      src={meta.thumbnailUrl}
      alt={word ?? "Sequence"}
      width="600"
      height="600"
      fetchpriority="high"
      decoding="async"
    />
  {/if}
  {#if word}
    <h1 class="sequence-first-frame__word">{word}</h1>
  {/if}
  {#if facts.length > 0}
    <p class="sequence-first-frame__facts text-secondary">
      {facts.join(" · ")}
    </p>
  {/if}
  {#if meta.curated && meta.letters && meta.letters.length > 0}
    <p class="sequence-first-frame__letters text-secondary">
      Letters: {meta.letters.join(" ")}
    </p>
  {/if}
  <div class="sequence-first-frame__progress">
    {#if session}
      <SequencePageLoading {session} />
    {/if}
  </div>
</div>

<style>
  .sequence-first-frame {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 16px;
    text-align: center;
    pointer-events: none;
    user-select: none;
  }

  .sequence-first-frame__image {
    display: block;
    width: min(80vw, 60dvh);
    height: auto;
    aspect-ratio: 1;
    border-radius: 12px;
    object-fit: contain;
    margin-bottom: 0.5rem;
  }

  /* The canonical TKA Letters webfont, set the way the viewer's WordHeader sets
     it, so the frame's word matches the word the viewer then draws. */
  .sequence-first-frame__word {
    margin: 0;
    font-family: "TKA Letters", var(--font-sans, sans-serif);
    font-feature-settings:
      "liga" 1,
      "dlig" 1;
    font-weight: normal;
    font-size: 1.5rem;
    line-height: 1.2;
  }

  /* With no image the word is the only picture of the sequence: title size. */
  .sequence-first-frame--word-only .sequence-first-frame__word {
    font-size: clamp(2.25rem, 10vw, 3.5rem);
  }

  .sequence-first-frame__facts,
  .sequence-first-frame__letters {
    margin: 0;
    font-size: 0.95rem;
  }

  /* Holds the capsule's space from the first paint, so it joins without a shift. */
  .sequence-first-frame__progress {
    position: relative;
    width: min(360px, 100%);
    height: 64px;
  }
</style>
