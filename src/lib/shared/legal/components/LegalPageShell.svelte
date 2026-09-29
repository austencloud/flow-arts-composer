<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Layout variant for the page:
   * - "document": top-aligned scrolling legal document (terms, privacy) — 800px column
   * - "compact": vertically centered short-form page (delete-account) — 1000px column
   */
  type LegalPageVariant = "document" | "compact";

  interface Props {
    children: Snippet;
    variant?: LegalPageVariant;
  }

  let { children, variant = "document" }: Props = $props();
</script>

<div class="legal-page" class:compact={variant === "compact"}>
  <div class="legal-container">
    <div class="top-bar">
      <a href="/" class="back-link">
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>Back</span>
      </a>
      <a href="/" class="logo-chip">TKA</a>
    </div>

    {@render children()}
  </div>
</div>

<style>
  /* ---- Page background + container (shell-authored, no override needed) ---- */
  .legal-page {
    position: relative;
    min-height: 100vh;
    color: #ffffff;
    background: linear-gradient(145deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
    overflow-x: hidden;
  }

  .legal-page.compact {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .legal-container {
    position: relative;
    z-index: 1;
    /* rem, not px, so browser zoom carries the document measure with its type.
       A legal document is a reading surface, so a bounded measure is the right
       call even when the surrounding canvas is much wider. */
    max-width: 50rem;
    width: 100%;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  .legal-page.compact .legal-container {
    max-width: 62.5rem; /* 1000px at the standard root; zoom-aware in rem */
    padding: 0;
  }

  @media (max-width: 768px) {
    .legal-container {
      padding: 1.5rem 1rem 3rem;
    }

    .legal-page.compact {
      padding: 1.5rem 1rem;
      align-items: flex-start;
    }

    .legal-page.compact .legal-container {
      padding: 0;
    }
  }

  /* ---- Top bar: back link + logo chip (shell-authored) ---- */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(255, 255, 255, 0.6);
    text-decoration: none;
    font-size: 0.875rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 100px;
    transition: all 0.2s ease;
  }

  .back-link:hover {
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
  }

  .logo-chip {
    display: inline-block;
    font-size: 1rem;
    font-weight: 700;
    color: #6366f1;
    background: color-mix(in srgb, #6366f1 15%, transparent);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    letter-spacing: 0.1em;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .logo-chip:hover {
    background: color-mix(in srgb, #6366f1 25%, transparent);
    color: #818cf8;
  }

  /* ---- Shared typography system, applied to slotted page content ----
     :where() keeps specificity at zero so any page-local rule (even an
     unscoped `h1 {}`) always wins without needing !important or fragile
     load-order assumptions. */
  :global(:where(.legal-container h1)) {
    font-size: clamp(2rem, 5vw, 2.5rem);
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }

  :global(:where(.legal-container h2)) {
    font-size: 1.375rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: #ffffff;
  }

  :global(:where(.legal-container p)) {
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.7;
    margin: 0 0 0.75rem 0;
  }

  :global(:where(.legal-container ul)) {
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.7;
    margin: 0;
    padding-left: 1.5rem;
  }

  :global(:where(.legal-container li)) {
    margin-bottom: 0.5rem;
  }

  :global(:where(.legal-container section)) {
    margin-bottom: 2rem;
  }

  :global(:where(.legal-container section:last-child)) {
    margin-bottom: 0;
  }

  :global(:where(.legal-container .header-content)) {
    text-align: center;
  }

  :global(:where(.legal-container .last-updated)) {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.875rem;
    margin: 0;
  }

  /* Opt-in wrapping card for long-form document pages (terms, privacy).
     Pages that don't need it (delete-account) simply don't use the class. */
  :global(:where(.legal-container .legal-card)) {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 2rem;
    transition: all 0.25s ease;
  }

  :global(:where(.legal-container .legal-card:hover)) {
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 768px) {
    :global(:where(.legal-container .legal-card)) {
      padding: 1.5rem;
    }

    :global(:where(.legal-container h2)) {
      font-size: 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .back-link,
    .logo-chip,
    :global(:where(.legal-container a)),
    :global(:where(.legal-container .legal-card)) {
      transition: none;
    }

    :global(:where(.legal-container .legal-card:hover)) {
      transform: none;
    }
  }
</style>
