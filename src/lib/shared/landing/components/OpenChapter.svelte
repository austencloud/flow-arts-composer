<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    prop,
    heading,
    children,
  }: {
    /** Display name used in the mailto subject, e.g. "Fans". */
    prop: string;
    heading: string;
    children: Snippet;
  } = $props();

  const mailto = `mailto:tkaflowarts@gmail.com?subject=${encodeURIComponent(`${prop} notation contribution`)}`;
</script>

<aside class="open-chapter" aria-labelledby="open-chapter-heading">
  <p class="kicker">Contribute</p>
  <h2 class="heading" id="open-chapter-heading">{heading}</h2>
  <div class="body">
    {@render children()}
  </div>
  <a class="write-btn" href={mailto}>
    <i class="fas fa-pen-nib" aria-hidden="true"></i>
    <span>Get in touch</span>
  </a>
</aside>

<style>
  .open-chapter {
    margin: 3.5rem auto;
    padding: 2rem 1.75rem 2.25rem;
    border: 2px dashed oklch(0.55 0.1 275 / 0.45);
    border-radius: 18px;
    background: oklch(0.18 0.02 275 / 0.35);
  }

  .kicker {
    margin: 0 0 0.6rem;
    font-size: 0.78rem;
    font-weight: 650;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: oklch(0.72 0.1 275);
  }

  .heading {
    margin: 0 0 1rem;
    font-size: clamp(1.25rem, 1.1rem + 0.8vw, 1.6rem);
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: oklch(0.95 0.01 270);
  }

  .body :global(p) {
    margin: 0 0 0.9rem;
    font-size: clamp(0.99rem, 0.95rem + 0.2vw, 1.08rem);
    line-height: 1.65;
    color: oklch(0.78 0.012 270);
  }
  .body :global(p:last-child) {
    margin-bottom: 1.4rem;
  }

  .write-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0.65rem 1.4rem;
    border: 1px solid oklch(0.6 0.12 275 / 0.55);
    border-radius: 999px;
    background: oklch(0.28 0.06 275 / 0.5);
    color: oklch(0.94 0.02 275);
    font-size: 0.95rem;
    font-weight: 600;
    text-decoration: none;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.16s ease;
  }
  .write-btn:hover,
  .write-btn:focus-visible {
    background: oklch(0.34 0.08 275 / 0.65);
    border-color: oklch(0.7 0.13 275 / 0.85);
    transform: translateY(-1px);
    outline: none;
  }
  .write-btn i {
    font-size: 0.85rem;
    color: oklch(0.8 0.1 275);
  }

  @media (prefers-reduced-motion: reduce) {
    .write-btn {
      transition: none;
    }
    .write-btn:hover,
    .write-btn:focus-visible {
      transform: none;
    }
  }
</style>
