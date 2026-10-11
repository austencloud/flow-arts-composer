<!--
  HomeHero

  The homepage's above-the-fold hero: the H1 statement, the live per-visit
  sequence demo (promoted from the composer page so any host can use it),
  and a pointer link to the What is TKA first-read (/about) for strangers.

  The fixed stage is present at SSR, but the player stays unmounted until the
  first per-visit sequence finishes generating after hydration. The hero
  attract act (hero-act.svelte.ts) then walks through a small cycle of props,
  one freshly generated LOOP at a time, handing off at each loop boundary.
  The baked fixture is visible only if the generator itself falls back to it.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import SequenceHeroDemo from "./SequenceHeroDemo.svelte";
  import { siteCopy } from "../site-copy";
  import { createHeroAct } from "#lib/shared/landing/data/hero-act.svelte.js";
  import { FALLBACK_DEMO } from "#lib/shared/landing/data/per-visit-demo.js";
  import { isConstrainedConnection } from "#lib/shared/platform/network-conditions.js";
  import { runAfterNamedRouteMorphIdle } from "#lib/shared/transitions/named-route-morph-state.svelte.js";
  import {
    HERO_TRAIL_PRESET,
    HERO_TIP_EFFECT_MAP,
  } from "#lib/shared/landing/data/hero-trail-preset.js";
  import {
    trackCtaClick,
    trackDemoInteraction,
  } from "#lib/shared/analytics/landing-events.js";

  const heroAct = createHeroAct({ initialSequence: FALLBACK_DEMO });

  onMount(() => {
    if (isConstrainedConnection()) return;
    return runAfterNamedRouteMorphIdle(heroAct.start);
  });

  // Pinned so a visitor's persisted Compose playback speed can't skew the
  // marketing surface — every visitor sees the act at the same tempo.
  const HERO_BPM = 60;

  // The demo keeps playing on its own, but a visitor can replace the current
  // sequence immediately. Tracking stays beside the action so the homepage
  // and Composer demos report the same "try another" interaction.
  function handleReroll(): void {
    trackDemoInteraction("try_another");
    void heroAct.advanceNow();
  }
</script>

<section class="home-hero">
  <!-- Display title + subline in ONE h1, so the heading's accessible/SEO text
       still carries both the brand and the "notation ... flow arts" phrase. -->
  <h1 class="home-hero-title">
    <span class="title-main">The Kinetic Alphabet</span>
    <span class="title-sub">{siteCopy("Notation for flow arts")}</span>
  </h1>

  <SequenceHeroDemo
    sequence={heroAct.sequence}
    element={heroAct.element}
    note="a sequence in TKA notation"
    onReroll={handleReroll}
    rerolling={heroAct.rerolling}
    leftPropType={heroAct.propType}
    rightPropType={heroAct.propType}
    onSequenceBoundary={heroAct.offerSequenceBoundary}
    trailSettingsOverride={HERO_TRAIL_PRESET}
    tipEffectMap={HERO_TIP_EFFECT_MAP}
    externalBpm={HERO_BPM}
    showNotationStrip={true}
    showWordHeader={true}
    connectionAware={true}
    serverReducedData={page.data.saveData === true}
    loadPriority="immediate"
  />

  <nav class="hero-actions" aria-label={siteCopy("Start here")}>
    <a
      class="composer-cta"
      href="/create"
      data-sveltekit-reload
      onclick={() =>
        trackCtaClick("hero", {
          cta_type: "open_composer",
          destination: "/create",
        })}
    >
      <span>{siteCopy("Open Flow Arts Composer")}</span>
    </a>

    <a
      href="/about"
      class="pointer-link"
      onclick={() =>
        trackCtaClick("hero", {
          cta_type: "what_is_tka",
          destination: "/about",
        })}>{siteCopy("What is TKA?")}</a
    >
  </nav>
</section>

<style>
  .home-hero {
    display: flex;
    flex-direction: column;
    container: home-hero / inline-size;
    /* stretch, NOT center: centered flex items shrink to fit-content, and the
       demo stage's only in-flow content is its caption line, so centering
       collapsed the whole player to ~285px. Children center themselves
       (margin-inline auto + text-align). */
    align-items: stretch;
    justify-content: center;
    text-align: center;
    /* Aim at roughly one viewport minus the header + enough for the grid
       below to peek above the fold on desktop. The header is sticky and
       sits above this section already, so this box does not add its own
       header padding on top of that. */
    min-height: calc(100svh - clamp(220px, 26vh, 320px));
    /* Top padding clears the fixed MarketingChrome header (~64px) so the
       title never slides under it when the content centers. */
    padding: calc(64px + clamp(1.5rem, 3.5vh, 2.5rem)) 1.25rem
      clamp(1.5rem, 4vh, 2.5rem);
    /* The compact notation rail replaces the old visible caption. At stacked
       widths, a slightly tighter square keeps the combined media card at the
       same visual weight as the former stage + caption. */
    --hero-demo-max-width: min(24rem, 100%);
  }

  .home-hero-title {
    margin: 0;
  }
  .title-main {
    display: block;
    max-width: 14ch;
    margin-inline: auto;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-weight: 500;
    /* Fluid to 4K/5K: ~2.4rem on phones, ~4.5rem at 1920, capped 6rem. */
    font-size: clamp(2.4rem, 3.4vw + 0.5rem, 6rem);
    line-height: 1.06;
    letter-spacing: -0.015em;
    color: oklch(0.94 0.02 270);
  }
  .title-sub {
    display: block;
    margin-top: 0.55em;
    font-size: clamp(1rem, 0.9vw + 0.3rem, 1.7rem);
    font-weight: 400;
    letter-spacing: 0.04em;
    color: oklch(0.72 0.02 270);
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-self: center;
    justify-content: center;
    gap: 0.75rem;
    max-width: calc(100% - 2rem);
    margin-top: clamp(1rem, 2.5svh, 1.5rem);
  }

  .composer-cta {
    display: inline-flex;
    align-items: center;
    align-self: center;
    justify-content: center;
    min-height: var(--min-touch-target, 44px);
    box-sizing: border-box;
    padding: 0 clamp(1rem, 5cqi, 1.4rem);
    border: 1px solid transparent;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    box-shadow: 0 4px 18px rgba(111, 140, 255, 0.4);
    font-family: inherit;
    font-size: clamp(0.95rem, 0.9rem + 0.12vw, 1.08rem);
    font-weight: 650;
    line-height: 1.2;
    white-space: nowrap;
    text-decoration: none;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      filter 160ms ease;
  }
  .composer-cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(111, 140, 255, 0.55);
    filter: brightness(1.06);
  }
  .composer-cta:focus-visible {
    outline: 2px solid oklch(0.88 0.08 275);
    outline-offset: 3px;
    box-shadow: 0 10px 30px rgba(111, 140, 255, 0.55);
  }
  /* Standalone CTA (not inline prose): a visible pill, not a bare text link,
     per clickables-look-like-buttons. */
  .pointer-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.35em 0.9em;
    border-radius: 10px;
    background: oklch(0.3 0.04 270 / 0.18);
    border: 1px solid oklch(0.5 0.06 270 / 0.3);
    color: oklch(0.9 0.015 270);
    font-weight: 600;
    text-decoration: none;
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      background 160ms ease;
  }
  .pointer-link:hover {
    transform: translateY(-2px);
    background: oklch(0.34 0.05 270 / 0.26);
    border-color: oklch(0.6 0.08 270 / 0.5);
  }

  @media (pointer: coarse) {
    .composer-cta {
      transform: none;
    }
    .pointer-link {
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .composer-cta,
    .pointer-link {
      transition: none;
    }
    .composer-cta:hover,
    .pointer-link:hover {
      transform: none;
    }
  }

  /* The mobile fallback is intentionally scroll-safe. Compact one-viewport
     layouts override these values below; unusually short windows still keep
     the title clear of the fixed header and cap the player by block space. */
  @media (width < 42rem) {
    .home-hero {
      min-height: auto;
      padding: calc(64px + 1rem) 1.25rem 1.75rem;
      --hero-demo-max-width: min(
        100%,
        clamp(12rem, calc(100svh - 13rem), 24rem)
      );
    }
  }

  /* Tablet composition: the page owns the two panes, so this side only has
     to balance its title, player, and two actions inside the available height. */
  @media (width >= 42rem) and (width < 105rem) and (height >= 500px) {
    .home-hero {
      min-height: 0;
      height: 100%;
      padding: clamp(0.75rem, 2svh, 1.5rem) 0;
      --hero-demo-max-width: min(100%, clamp(15rem, 36svh, 24rem));
    }
    .home-hero :global(.hero-demo.with-notation-strip) {
      margin-top: clamp(1rem, 2.4svh, 1.8rem);
    }
    .title-main {
      font-size: clamp(2.5rem, 11cqi, 3.5rem);
    }
    .title-sub {
      font-size: clamp(0.9rem, 3.5cqi, 1.15rem);
    }
    .hero-actions {
      margin-top: clamp(0.75rem, 2svh, 1.25rem);
    }
  }

  @media (width >= 42rem) and (width < 105rem) and (height >= 500px) and (max-height: 850px) {
    .home-hero {
      padding: 0.5rem 0;
      --hero-demo-max-width: min(100%, 30svh);
    }
    .home-hero :global(.hero-demo.with-notation-strip) {
      margin-top: 0.75rem;
    }
    .title-main {
      font-size: clamp(2.15rem, 10cqi, 2.75rem);
    }
    .title-sub {
      margin-top: 0.35em;
      font-size: 0.9rem;
    }
    .hero-actions {
      margin-top: 0.5rem;
    }
  }

  /* A short split pane cannot carry the title, horizontal thumbnail rail,
     player controls, and CTA without climbing behind the fixed header. The
     rail disappears here and the recovered height returns to the square. */
  @media (width >= 42rem) and (width < 105rem) and (height >= 500px) and (height < 44rem) {
    .home-hero {
      padding: 0.25rem 0;
      --hero-demo-max-width: min(100%, 40svh);
    }
    .home-hero :global(.hero-demo.with-notation-strip) {
      margin-top: 0.35rem;
    }
    .title-main {
      font-size: clamp(1.75rem, 9cqi, 2.1rem);
    }
    .title-sub {
      margin-top: 0.2em;
      font-size: 0.8rem;
    }
    .hero-actions {
      margin-top: 0.25rem;
    }
    .composer-cta {
      padding-inline: 0.9rem;
      font-size: 0.875rem;
    }
  }

  /* Sideways phones get a single-line title and a rail-free animation. The
     first-read link remains in the menu so the live example can stay legible. */
  @media (width >= 35rem) and (height < 500px),
    (width >= 105rem) and (height < 56.25rem) {
    .home-hero {
      min-height: 0;
      height: 100%;
      padding: 0;
      --hero-demo-max-width: min(100%, 36svh);
    }
    .home-hero :global(.hero-demo.with-notation-strip) {
      margin-top: 0.25rem;
    }
    .title-main {
      max-width: none;
      font-size: clamp(1.1rem, 7cqi, 1.4rem);
      white-space: nowrap;
    }
    .title-sub {
      margin-top: 0.1em;
      font-size: var(--font-size-compact, 0.75rem);
    }
    .hero-actions {
      margin-top: 0.25rem;
    }
    .composer-cta {
      padding-inline: 0.75rem;
      font-size: var(--font-size-min, 0.875rem);
    }
    .pointer-link {
      display: none;
    }
  }

  /* Portrait phones get a focused first screen instead of sharing a fixed
     height budget with the entire launchpad. Width now sizes the live example;
     tying it to 32svh made the animation tiny on the exact 375 × 667 viewport
     where it needs to explain the product. Content can grow and scroll when
     text sizing or a shorter browser window needs more room. */
  @media (width < 35rem), (width < 42rem) and (height >= 500px) {
    .home-hero {
      min-height: calc(100svh - 4.25rem);
      padding: clamp(0.75rem, 2.4svh, 1.25rem) 0 clamp(1rem, 3svh, 1.5rem);
      justify-content: center;
      --hero-demo-max-width: min(100%, 21rem);
    }
    .home-hero :global(.hero-demo.with-notation-strip) {
      margin-top: 0.75rem;
    }
    .title-main {
      max-width: none;
      font-size: clamp(1.7rem, 8vw, 2.05rem);
      white-space: nowrap;
    }
    .title-sub {
      margin-top: 0.25em;
      font-size: var(--font-size-min, 0.875rem);
    }
    .hero-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: clamp(1rem, 2.5svh, 1.35rem);
    }
    .composer-cta {
      padding-inline: 0.9rem;
      font-size: var(--font-size-min, 0.875rem);
    }
    .pointer-link {
      min-height: var(--min-touch-target, 44px);
      font-size: var(--font-size-min, 0.875rem);
    }
  }

  /* Roomy phones can use the last sliver of available width without changing
     the composition or introducing another breakpoint-driven layout. */
  @media (width < 42rem) and (min-height: 56rem) and (orientation: portrait) {
    .home-hero {
      --hero-demo-max-width: min(100%, 22rem);
    }
  }

  /* Split tier: the page composes hero (left pane) + launchpad (right pane)
     into one viewport (see +page.svelte). The pane owns the height, so the
     stacked-mode viewport sizing comes off. */
  @media (width >= 105rem) and (height >= 56.25rem) {
    .home-hero {
      min-height: 0;
      height: 100%;
      padding: 1.5rem 0;
      /* 48px comes back out of the square because the compact rail adds 79px
         where the visible caption previously occupied roughly 30px. */
      --hero-demo-wide-max-width: min(calc(48svh - 3rem), 31rem);
    }
    .title-main {
      font-size: clamp(3.8rem, 11.3cqi, 4.4rem);
    }
    .title-sub {
      font-size: 1.3rem;
    }
    .composer-cta {
      min-height: 3.25rem;
      padding-inline: 1.8rem;
    }
    .hero-actions {
      font-size: 0.95rem;
    }
  }
</style>
