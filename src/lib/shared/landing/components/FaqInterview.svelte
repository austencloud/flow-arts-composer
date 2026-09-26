<script lang="ts">
  /**
   * The public-site FAQ list: one centered reading column, open answers, no
   * accordion. Questions are set in the site serif as spoken lines; each
   * answer follows directly underneath, with a door (button-styled link) only
   * where the answer genuinely hands off somewhere.
   *
   * Single-column on purpose: an earlier two-column "interview grid" left dead
   * space under every short question and stranded the CTAs mid-void. With one
   * column, every element sits in the same reading flow, so nothing has
   * unexplained emptiness beside or below it.
   *
   * Renders on /faq (the dedicated page, linked from the header's Learn menu).
   * The page owns its own h1, so it passes `heading=""`; the component's
   * heading only renders when non-empty. Data and FAQPage JSON-LD both come
   * from the canonical FAQ_ITEMS (faq-items.ts) so schema and visible text
   * cannot drift.
   */
  import { FAQ_ITEMS, faqPageJsonLd, type FaqItem } from "../faq/faq-items";
  import { siteCopy } from "../site-copy";

  let {
    items = FAQ_ITEMS,
    heading = "Common questions",
    emitSchema = false,
    sectionId = "faq",
  }: {
    items?: FaqItem[];
    heading?: string;
    emitSchema?: boolean;
    sectionId?: string;
  } = $props();

  const localizedItems = $derived(
    items.map((item) => ({
      ...item,
      question: siteCopy(item.question),
      answer: siteCopy(item.answer),
      cta: item.cta
        ? { ...item.cta, label: siteCopy(item.cta.label) }
        : undefined,
    }))
  );
  const schema = $derived(emitSchema ? faqPageJsonLd(localizedItems) : null);
</script>

<svelte:head>
  {#if schema}
    {@html `<script type="application/ld+json">${schema}</script>`}
  {/if}
</svelte:head>

<section
  class="faq"
  id={sectionId}
  aria-labelledby={heading ? `${sectionId}-heading` : undefined}
  aria-label={heading ? undefined : siteCopy("Frequently asked questions")}
>
  {#if heading}
    <h2 id="{sectionId}-heading">{siteCopy(heading)}</h2>
  {/if}
  <div class="qa-list">
    {#each localizedItems as faq}
      <article class="qa">
        <h3 class="question">{faq.question}</h3>
        <p class="answer">{faq.answer}</p>
        {#if faq.cta}
          <a class="faq-cta" href={faq.cta.href}>
            {faq.cta.label}
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </a>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  /* The host page owns outer spacing and width; the component fills it
     (no reading-measure cap — Austen 2026-07-19). */
  .faq {
    margin: 0 auto;
  }

  h2 {
    margin: 0 0 2.4rem;
    text-align: center;
    font-family: var(--landing-heading-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-size: clamp(1.7rem, 4vw, 2.4rem);
    font-weight: 500;
    line-height: 1.2;
    color: #ffffff;
  }

  .qa {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.9rem;
    padding-block: clamp(1.7rem, 3.5vw, 2.4rem);
    border-top: 1px solid rgba(255, 255, 255, 0.09);
  }
  .qa:first-of-type {
    border-top: none;
    padding-top: 0;
  }
  .qa:last-of-type {
    padding-bottom: 0;
  }

  /* The visitor's voice: the site serif, italic. The one loud element. */
  .question {
    margin: 0;
    font-family: var(--landing-heading-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.2rem, 2.2vw, 1.45rem);
    line-height: 1.3;
    color: #ffffff;
    text-wrap: balance;
  }

  .answer {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.74));
    font-size: 1rem;
    line-height: 1.7;
  }

  /* The door: a button, not a text link (clickables look like buttons).
     Sits in the reading flow right after the answer it extends. */
  .faq-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 20px;
    margin-top: 0.2rem;
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #818cf8) 16%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent-strong, #818cf8) 45%, transparent);
    color: #ffffff;
    font-size: 0.92rem;
    font-weight: 600;
    text-decoration: none;
    transition:
      background var(--duration-normal, 0.2s) ease,
      border-color var(--duration-normal, 0.2s) ease;
  }
  .faq-cta:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #818cf8) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent-strong, #818cf8) 75%,
      transparent
    );
  }
  .faq-cta i {
    font-size: 0.8em;
  }

  /* Phone: the door becomes a full-width thumb target closing the exchange. */
  @media (max-width: 600px) {
    .faq-cta {
      align-self: stretch;
    }
  }

  /* ── Wide tier (≥1500): the exchanges flow into a two-column magazine
     spread — the width goes into content, never into reserved empty
     regions. Every item opens with a hairline rule (including the first)
     so both columns start on the same visual line. The host page widens
     the band this lives in (see /faq). */
  @media (min-width: 1500px) {
    .qa-list {
      columns: 2;
      column-gap: 4.5rem;
    }
    .qa {
      break-inside: avoid;
      padding-block: 2.4rem;
    }
    .qa:first-of-type {
      border-top: 1px solid rgba(255, 255, 255, 0.09);
      padding-top: 2.4rem;
    }
    .qa:last-of-type {
      padding-bottom: 2.4rem;
    }
    .question {
      font-size: 1.55rem;
    }
    .answer {
      font-size: 1.06rem;
    }
  }

  /* No wide-screen type tier: the interview keeps its authored logical roles
     while the surrounding editorial shell owns composition. The CTA's px
     min-height and padding are touch-target floors. */

  @media (prefers-reduced-motion: reduce) {
    .faq-cta {
      transition: none;
    }
  }
</style>
