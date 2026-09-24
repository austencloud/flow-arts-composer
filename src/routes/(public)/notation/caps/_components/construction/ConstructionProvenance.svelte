<script lang="ts">
  import type { CAPAssembly } from "@caps/domain";

  let { assembly }: { assembly: CAPAssembly | null } = $props();

  const THREAD_URL =
    "https://www.homeofpoi.com/en/community/forums/topics/891193/What-are-CAP-s";
  const MATH_URL = "https://drexfactor.com/reference/math_caps";
  const IMAGE_BY_ID: Record<string, { src: string; alt: string }> = {
    "yuta-cap": {
      src: "/caps/original/cap-yuta-halfcycle.jpg",
      alt: "Damien's original 2009 plot of the Yuta CAP built from two half-cycles",
    },
    "yuta-cap-three-quarter": {
      src: "/caps/original/cap-yuta-3quarter.jpg",
      alt: "Damien's original 2009 plot of the Yuta CAP using three quarters of each cycle",
    },
    "cap-1-3-composition": {
      src: "/caps/original/cap-1-3-composition.jpg",
      alt: "Damien's original 2009 plot of the 1 3 CAP composition",
    },
  };

  const image = $derived(assembly ? (IMAGE_BY_ID[assembly.id] ?? null) : null);
</script>

{#if assembly && image}
  <details class="provenance">
    <summary>
      <span>
        <strong>Damien's original 2009 plot</strong>
        <small>{assembly.name}, preserved from ImagesHotel.org</small>
      </span>
      <i class="fas fa-plus" aria-hidden="true"></i>
    </summary>
    <div class="provenance-content">
      <figure>
        <img
          src={image.src}
          alt={image.alt}
          width="900"
          height="760"
          loading="lazy"
        />
        <figcaption>
          Damien's archived plot. The interactive version above uses his
          published parameters.
        </figcaption>
      </figure>
      <div class="provenance-copy">
        <span>Original notation</span>
        <code>{assembly.notation}</code>
        <p>{assembly.description}</p>
        <div class="source-links">
          <a href={THREAD_URL}>Origin discussion</a>
          <a href={MATH_URL}>The Math of CAPs</a>
        </div>
      </div>
    </div>
  </details>
{/if}

<style>
  .provenance {
    container-type: inline-size;
    margin-top: 1rem;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--accent, #34d399) 24%, rgb(255 255 255 / 0.08));
    border-radius: 0.9rem;
    background: rgb(255 255 255 / 0.025);
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 56px;
    padding: 0.75rem 1rem;
    color: rgb(255 255 255 / 0.86);
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary span {
    display: grid;
    gap: 0.14rem;
  }
  summary strong {
    font-size: 0.92rem;
  }
  summary small {
    color: rgb(255 255 255 / 0.52);
    font-size: 0.75rem;
  }
  summary i {
    color: var(--accent, #34d399);
    transition: transform 180ms ease;
  }
  details[open] summary i {
    transform: rotate(45deg);
  }
  summary:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -3px;
    border-radius: 0.9rem;
  }

  .provenance-content {
    display: grid;
    grid-template-columns: minmax(16rem, 0.82fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(1.25rem, 3cqi, 2.5rem);
    padding: clamp(1rem, 2.3cqi, 1.75rem);
    border-top: 1px solid rgb(255 255 255 / 0.07);
  }
  figure {
    margin: 0;
  }
  figure img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 0.7rem;
  }
  figcaption {
    margin-top: 0.5rem;
    color: rgb(255 255 255 / 0.58);
    font-size: 0.78rem;
    line-height: 1.5;
  }

  .provenance-copy {
    display: grid;
    gap: 0.75rem;
  }
  .provenance-copy > span {
    color: color-mix(in srgb, var(--accent, #34d399) 72%, white);
    font-size: 0.75rem;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  code {
    width: fit-content;
    max-width: 100%;
    color: rgb(255 255 255 / 0.82);
    font-size: clamp(0.78rem, 0.72rem + 0.16cqi, 0.92rem);
    font-variant-numeric: tabular-nums;
    white-space: normal;
  }
  p {
    margin: 0;
    color: rgb(255 255 255 / 0.68);
    font-size: clamp(0.88rem, 0.82rem + 0.14cqi, 1rem);
    line-height: 1.55;
  }
  .source-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .source-links a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.45rem 0.85rem;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.04);
    color: rgb(255 255 255 / 0.78);
    font-size: 0.82rem;
    text-decoration: none;
  }
  .source-links a:hover,
  .source-links a:focus-visible {
    border-color: var(--accent, #34d399);
    color: #fff;
  }

  @container (max-width: 44rem) {
    .provenance-content {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    summary i {
      transition: none;
    }
  }
</style>
