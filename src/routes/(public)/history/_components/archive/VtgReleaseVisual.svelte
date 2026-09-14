<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import VtgChapterStepper from "./VtgChapterStepper.svelte";
  import { vtgReleaseVisual } from "./_lib/vtg-release-visuals";

  let { sectionId }: { sectionId: string } = $props();
  let imageId = $state<string | null>(null);
  let failedImage = $state<string | null>(null);
  const release = $derived(vtgReleaseVisual(sectionId));
  const preview = $derived(
    release.images.find((image) => image.id === imageId) ?? release.images[0]
  );
  const options = $derived(
    release.images.map(({ id, label }) => ({ value: id, label }))
  );
</script>

<section class="release-visual" aria-label={release.title}>
  <h3>{release.title}</h3>
  <Crossfade key={release.id} animateHeight mode="swap">
    {#if release.kind === "chapters"}
      <VtgChapterStepper active reader />
    {:else if preview}
      {#if options.length > 1}
        <div class="page-choices">
          <SegmentedControl
            {options}
            value={preview.id}
            onchange={(value) => (imageId = value)}
            semantics="radiogroup"
            ariaLabel={`${release.title}: choose a page`}
          />
        </div>
      {/if}
      <Crossfade key={preview.id} mode="swap" animateHeight>
        <figure>
          <a
            class="preview"
            href={preview.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={preview.linkLabel}
          >
            {#if failedImage === preview.src}
              <span class="preview-error"
                >Preview unavailable. Open the original source.</span
              >
            {:else}
              <img
                src={preview.src}
                alt={preview.alt}
                onerror={() => (failedImage = preview.src)}
              />
            {/if}
          </a>
          <figcaption>
            {preview.caption}
            <a
              class="source-link"
              href={preview.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {preview.linkLabel} <span aria-hidden="true">↗</span>
            </a>
          </figcaption>
        </figure>
      </Crossfade>
    {/if}
  </Crossfade>
</section>

<style>
  .release-visual {
    --archive-preview-height: clamp(18rem, calc(100dvh - 32rem), 74rem);
    min-width: 0;
    width: 100%;
    container-type: inline-size;
  }
  h3 {
    margin: 0 0 1rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    font-weight: 650;
  }
  .page-choices {
    width: 24rem;
    max-width: 100%;
    margin-bottom: 1rem;
  }
  figure {
    margin: 0;
  }
  .preview {
    display: flex;
    align-items: center;
    justify-content: center;
    height: min(var(--archive-preview-height), 85cqi);
    width: 100%;
    min-width: 0;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  figcaption {
    max-width: 70ch;
    margin-top: 1rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  .source-link {
    display: flex;
    width: fit-content;
    gap: 0.5rem;
    align-items: center;
    min-height: 44px;
    font-size: 0.875rem;
    font-weight: 650;
  }
  a {
    color: var(--theme-text);
    text-underline-offset: 0.25em;
  }
  a:hover {
    color: var(--theme-accent);
  }
  a:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
  }
  .preview-error {
    padding: 1.5rem;
    font-size: 1rem;
  }
  @media (max-width: 1099px) {
    .release-visual {
      --archive-preview-height: clamp(18rem, 75vw, 40rem);
    }
  }
</style>
