<!--
  /guide/three-levels: an essay, still a draft.

  Production prerenders the "being written" note (noindex), and the page is
  off the Guide hub, the Guide contents and the sitemap until Austen approves
  it. A local dev server shows the essay below.
-->
<script lang="ts">
  /**
   * One way to think about how a pattern is described: by a name, by its
   * letters, or by a VTG reading of each beat. Framed as a theory, not as an
   * established framework.
   *
   * It opens on two named patterns playing (Zan's Diamond and Opening and
   * Closing the Book), then follows one family, the cap, through the three
   * descriptions with a single live figure. The figure's readout follows the
   * section being read. Every cap comes from
   * #lib/shared/guide-topics/caps-topic.ts.
   */
  import { onMount } from "svelte";
  import { browser, dev } from "$app/environment";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import CapFigure, { type CapLevel } from "./_components/CapFigure.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographRender } from "../level-1/_data/guide-content-blocks";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    ZANS_DIAMOND_CREDIT,
    ZANS_DIAMOND_ORIGINAL,
    zansDiamondStrip,
  } from "#lib/shared/guide-topics/zans-diamond-topic.js";
  import {
    CAPS,
    bookStrip,
    capGap,
  } from "#lib/shared/guide-topics/caps-topic.js";

  // The opening patterns are shown by name only: their strips carry no
  // letters, just the app's step labels, and their players get no letters
  // to draw.
  const unlettered = (items: StepData[]) =>
    items.map((step) => ({ ...step, letter: null }));
  const zansItems = zansDiamondStrip(ZANS_DIAMOND_ORIGINAL);
  const zans = {
    items: zansItems,
    sequence: stripToSequence(unlettered(zansItems), {
      word: "",
      name: "Zan's Diamond",
    }),
    render: {
      propType: PropType.HAND,
      showTKA: false,
      showStepNumbers: true,
    } satisfies PictographRender,
  };
  const bookItems = bookStrip();
  const book = {
    items: bookItems,
    sequence: stripToSequence(unlettered(bookItems), {
      word: "",
      name: "Book",
    }),
    render: {
      propType: PropType.STAFF,
      showTKA: false,
      showStepNumbers: true,
    } satisfies PictographRender,
  };

  let capIndex = $state(0);
  const cap = $derived(CAPS[capIndex]!);
  const nextCap = () => (capIndex = (capIndex + 1) % CAPS.length);

  // The picker groups caps by how far apart the hands run.
  const GROUPS = [
    { gap: 0, label: "guide_caps_group_in_step" },
    { gap: 1, label: "guide_caps_group_one_apart" },
    { gap: 2, label: "guide_caps_group_two_apart" },
  ] as const;
  const groups = GROUPS.map((g) => ({
    ...g,
    caps: CAPS.map((c, i) => ({ cap: c, i })).filter(
      ({ cap: c }) => capGap(c) === g.gap
    ),
  }));

  // The figure's readout follows the section crossing the middle of the
  // screen. Before the first cap section it shows the name level.
  let level = $state<CapLevel>("name");
  let sectionEls: Record<CapLevel, HTMLElement | undefined> = $state({
    name: undefined,
    letters: undefined,
    vtg: undefined,
  });
  onMount(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const found = (Object.keys(sectionEls) as CapLevel[]).find(
            (key) => sectionEls[key] === entry.target
          );
          if (found) level = found;
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    for (const el of Object.values(sectionEls)) if (el) io.observe(el);
    return () => io.disconnect();
  });

  // Pictographs follow the site theme, as the Level 1 pages do.
  let picTheme = $state<"light" | "dark">("dark");
  onMount(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const attr = root.getAttribute("data-theme");
      picTheme = (attr ? attr === "dark" : mq.matches) ? "dark" : "light";
    };
    resolve();
    mq.addEventListener("change", resolve);
    const observer = new MutationObserver(resolve);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      mq.removeEventListener("change", resolve);
      observer.disconnect();
    };
  });
</script>

<svelte:head>
  {#if !dev}
    <title>Being written · The Kinetic Alphabet Guide</title>
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

{#if !dev}
  <UnderConstruction
    title="Being written"
    eyebrow="The Guide"
    icon="fa-pen-nib"
    note="This page is still being written. The rest of the Guide is here."
    destinations={[
      { label: "The Guide", href: "/guide", icon: "fa-book-open" },
    ]}
  />
{:else}
  <GuideSeo
    title={t("guide_caps_seo_title")}
    description={t("guide_caps_seo_description")}
    path="/guide/three-levels"
    datePublished="2026-10-15"
    partOf={{ name: t("guide_caps_part_of"), path: "/guide" }}
    breadcrumbs={[
      { name: "Home", path: "/" },
      { name: "Guide", path: "/guide" },
      { name: t("guide_caps_title"), path: "/guide/three-levels" },
    ]}
  />

  <GuideShell>
    <article class="essay guide-page-route">
      <header class="intro">
        <p class="eyebrow">{t("guide_caps_eyebrow")}</p>
        <h1>{t("guide_caps_title")}</h1>
        <p class="lede">{t("guide_caps_lede")}</p>
      </header>

      <section class="names" aria-labelledby="names-heading">
        <div class="prose">
          <h2 id="names-heading">{t("guide_caps_names_title")}</h2>
          <p>{t("guide_caps_names_body")}</p>
        </div>
        <div class="named">
          <SequenceShowcase
            variant="compact"
            sequence={zans.sequence}
            items={zans.items}
            render={zans.render}
            loop
            {picTheme}
          >
            {#snippet text()}
              <div class="name-label">
                <h3>Zan's Diamond</h3>
                <p>
                  {t("guide_caps_names_by", { name: ZANS_DIAMOND_CREDIT.name })}
                </p>
              </div>
            {/snippet}
          </SequenceShowcase>
          <SequenceShowcase
            variant="compact"
            sequence={book.sequence}
            items={book.items}
            render={book.render}
            loop
            {picTheme}
          >
            {#snippet text()}
              <div class="name-label">
                <h3>Opening and Closing the Book</h3>
              </div>
            {/snippet}
          </SequenceShowcase>
        </div>
        <div class="prose">
          <p>{t("guide_caps_names_limit")}</p>
        </div>
      </section>

      <div class="caps">
        <div class="caps-text">
          <section
            class="level"
            bind:this={sectionEls.name}
            aria-labelledby="cap-heading"
          >
            <h2 id="cap-heading">{t("guide_caps_cap_title")}</h2>
            <p>{t("guide_caps_cap_body")}</p>
            <p>{t("guide_caps_cap_rules", { count: CAPS.length })}</p>
            <p>{t("guide_caps_cap_limit")}</p>
            <div class="links">
              <LinkChip href={localHref("/notation/caps")}
                >{t("guide_caps_link_caps")}</LinkChip
              >
            </div>
          </section>

          <section
            class="level"
            bind:this={sectionEls.letters}
            aria-labelledby="letters-heading"
          >
            <h2 id="letters-heading">{t("guide_caps_letters_title")}</h2>
            <p>{t("guide_caps_letters_body")}</p>
            <p>{t("guide_caps_letters_repeat")}</p>
            <div
              class="picker"
              role="group"
              aria-label={t("guide_caps_picker_label")}
            >
              {#each groups as group (group.gap)}
                <div class="picker-group">
                  <p class="picker-heading">{t(group.label)}</p>
                  <div class="picker-words">
                    {#each group.caps as entry (entry.cap.word)}
                      <button
                        type="button"
                        class="word"
                        class:selected={entry.i === capIndex}
                        aria-pressed={entry.i === capIndex}
                        aria-label={entry.cap.word}
                        onclick={() => (capIndex = entry.i)}
                      >
                        {#if browser}
                          <TKAWordGlyph
                            word={entry.cap.word}
                            height={22}
                            darkMode={picTheme === "dark"}
                          />
                        {:else}
                          <span class="word-text">{entry.cap.word}</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
            <p>{t("guide_caps_letters_think")}</p>
          </section>

          <section
            class="level"
            bind:this={sectionEls.vtg}
            aria-labelledby="vtg-heading"
          >
            <h2 id="vtg-heading">{t("guide_caps_vtg_title")}</h2>
            <p>{t("guide_caps_vtg_body")}</p>
            <p>{t("guide_caps_vtg_cap")}</p>
            <p>{t("guide_caps_vtg_check")}</p>
          </section>
        </div>

        <div class="figure-col">
          <div class="sticky">
            <CapFigure
              {cap}
              {level}
              {picTheme}
              position={capIndex + 1}
              total={CAPS.length}
              onNext={nextCap}
            />
          </div>
        </div>
      </div>

      <section class="close" aria-labelledby="close-heading">
        <h2 id="close-heading">{t("guide_caps_close_title")}</h2>
        <p>{t("guide_caps_close_body")}</p>
        <p>{t("guide_caps_close_take")}</p>
        <div class="links">
          <LinkChip href={localHref("/guide/zans-diamond")}
            >Zan's Diamond</LinkChip
          >
          <LinkChip href={localHref("/guide/ratios")}
            >{t("guide_caps_link_ratios")}</LinkChip
          >
        </div>
      </section>
    </article>
  </GuideShell>
{/if}

<style>
  .essay {
    width: 100%;
    min-width: 0;
    max-width: 1180px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 6vw, 72px);
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
  }
  .essay h1 {
    text-align: left;
    margin: 0;
    padding: 0;
    grid-column: auto;
  }
  .essay h2,
  .essay h3 {
    margin: 0;
  }
  .essay p {
    max-width: 64ch;
    line-height: 1.65;
    color: var(--theme-text-muted);
    margin: 0;
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .essay .eyebrow {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .essay .lede {
    font-size: 1.125rem;
    color: var(--theme-text);
  }
  .prose {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .names {
    display: flex;
    flex-direction: column;
    gap: clamp(20px, 3vw, 32px);
  }
  .named {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr));
    gap: clamp(20px, 3vw, 32px);
  }
  .name-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name-label h3 {
    font-size: 1.0625rem;
  }
  .essay .name-label p {
    font-size: 0.875rem;
  }

  /* The cap sections read on the left while the figure stays in view on the
     right. Narrow screens put the figure in a bar pinned to the top. */
  .caps {
    display: grid;
    /* The figure is about 0.9 as tall as it is wide, so a short window
       narrows it until it fits below the header. */
    grid-template-columns: minmax(0, 1fr) minmax(
        0,
        min(560px, calc((100svh - 112px) * 1.1))
      );
    gap: clamp(24px, 4vw, 56px);
    align-items: start;
  }
  .caps-text {
    display: flex;
    flex-direction: column;
    gap: clamp(64px, 18vh, 200px);
    padding-block: 0 25vh;
  }
  .level {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .figure-col {
    align-self: stretch;
  }
  .sticky {
    position: sticky;
    top: calc(var(--marketing-header-h, 64px) + 16px);
  }

  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-block: 0.25rem;
  }
  .picker-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .essay .picker-heading {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .picker-words {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .word {
    display: grid;
    place-items: center;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 10px;
    border: 1px solid color-mix(in oklab, var(--theme-text) 14%, transparent);
    background: transparent;
    cursor: pointer;
  }
  .word-text {
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--theme-text);
  }
  .word:hover {
    background: color-mix(in oklab, var(--theme-text) 8%, transparent);
  }
  .word.selected {
    border-color: color-mix(in srgb, var(--semantic-warning) 85%, transparent);
    background: color-mix(in srgb, var(--semantic-warning) 12%, transparent);
  }
  .word:focus-visible {
    outline: 2px solid var(--semantic-warning);
    outline-offset: 2px;
  }

  .close {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    margin-top: 0.25rem;
  }

  @media (max-width: 899px) {
    .caps {
      grid-template-columns: minmax(0, 1fr);
    }
    /* The figure comes first and pins to the top while the text scrolls. */
    .figure-col {
      order: -1;
      position: sticky;
      top: var(--marketing-header-h, 64px);
      z-index: 5;
      padding-block: 8px;
      background: var(--theme-panel-bg);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid
        color-mix(in oklab, var(--theme-text) 10%, transparent);
    }
    /* Narrow enough that the figure drops its strip and stays a short bar. */
    .sticky {
      position: static;
      max-width: 459px;
      margin-inline: auto;
    }
    .caps-text {
      gap: clamp(48px, 12vh, 120px);
    }
  }
  /* Too short to pin a bar without hiding the text. */
  @media (max-width: 899px) and (max-height: 560px) {
    .figure-col {
      position: static;
    }
  }
</style>
