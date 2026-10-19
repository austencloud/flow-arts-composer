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
   * It opens on a named pattern playing (Zan's Diamond), then follows one
   * family, Gage DeMello's twelve-beat CAPs, through the three descriptions.
   * Each level is the Guide's own SequenceShowcase playing the same chosen
   * CAP, with that level's reading beside the canvas. Every CAP comes from
   * #lib/shared/guide-topics/caps-topic.ts.
   */
  import { onMount } from "svelte";
  import { browser, dev } from "$app/env";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import CapReadout from "./_components/CapReadout.svelte";
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
    CAP_DIRECTIONS,
    CAP_TIMINGS,
    CAP_WORDS,
    capStrip,
    type CapDirection,
    type CapTiming,
  } from "#lib/shared/guide-topics/caps-topic.js";

  // The opening pattern is shown by name only: its strip carries no letters,
  // just the app's step labels, and its player gets no letters to draw.
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

  // Start on the first CAP that shares its word, so the VTG level can show
  // two CAPs with one word coming apart without the reader hunting for one.
  let capIndex = $state(
    CAPS.indexOf(CAP_WORDS.find((w) => w.caps.length > 1)!.caps[0]!)
  );
  const cap = $derived(CAPS[capIndex]!);
  const nextCap = () => (capIndex = (capIndex + 1) % CAPS.length);
  // CAPs that spell the same word differ only in turns; the VTG level steps
  // through them so a reader can watch the ratios come apart.
  const sameWordCaps = $derived(
    CAP_WORDS.find((w) => w.word === cap.word)!.caps
  );
  const sameWord = $derived({
    n: sameWordCaps.indexOf(cap) + 1,
    total: sameWordCaps.length,
  });
  const nextSameWord = () => {
    const next = sameWordCaps[sameWord.n % sameWordCaps.length]!;
    capIndex = CAPS.indexOf(next);
  };

  // The picker offers each word once, grouped by VTG timing and direction,
  // as the Eight Step page sorts its paths. A word shared by several CAPs
  // plays the first.
  const TIMING_LABEL: Record<CapTiming, Parameters<typeof t>[0]> = {
    split: "guide_eightstep_timing_split_title",
    together: "guide_eightstep_timing_together_title",
    quarter: "guide_eightstep_timing_quarter_title",
  };
  const DIRECTION_LABEL: Record<CapDirection, Parameters<typeof t>[0]> = {
    same: "guide_eightstep_direction_same",
    opposite: "guide_eightstep_direction_opposite",
  };
  const groups = CAP_TIMINGS.flatMap((timing) =>
    CAP_DIRECTIONS.map((direction) => ({
      key: `${timing}-${direction}`,
      timing,
      direction,
      words: CAP_WORDS.filter(
        (w) => w.timing === timing && w.direction === direction
      ).map((w) => ({ word: w.word, i: CAPS.indexOf(w.caps[0]!) })),
    }))
  );

  // Every level plays the chosen CAP. By name it shows no letters, on the
  // canvas or in the strip; the VTG level adds each beat's element.
  const capItems = $derived(capStrip(cap));
  const capByName = $derived(
    stripToSequence(unlettered(capItems), { word: "", name: "CAP" })
  );
  const capLettered = $derived(
    stripToSequence(capItems, { word: cap.word, name: cap.word })
  );
  const capRender = (level: "name" | "letters" | "vtg") =>
    ({
      propType: PropType.STAFF,
      showTKA: level !== "name",
      showStepNumbers: true,
      showElemental: level === "vtg",
    }) satisfies PictographRender;

  // The beat each reading follows, reported by its showcase's player.
  let lettersStep = $state(0);
  let vtgStep = $state(0);
  $effect(() => {
    void cap;
    lettersStep = 0;
    vtgStep = 0;
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
      <header class="intro centered">
        <p class="eyebrow">{t("guide_caps_eyebrow")}</p>
        <h1>{t("guide_caps_title")}</h1>
        <p class="lede">{t("guide_caps_lede")}</p>
      </header>

      <section class="level" aria-labelledby="names-heading">
        <div class="centered">
          <h2 id="names-heading">{t("guide_caps_names_title")}</h2>
          <p>{t("guide_caps_names_body")}</p>
        </div>
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
        <div class="centered">
          <p>{t("guide_caps_names_limit")}</p>
        </div>
      </section>

      <section class="level" aria-labelledby="cap-heading">
        <div class="centered">
          <h2 id="cap-heading">{t("guide_caps_cap_title")}</h2>
          <p>{t("guide_caps_cap_body")}</p>
          <p>{t("guide_caps_cap_rules", { count: CAPS.length })}</p>
        </div>
        <SequenceShowcase
          sequence={capByName}
          items={capItems}
          render={capRender("name")}
          loop
          {picTheme}
        >
          {#snippet text()}
            <div class="beside">
              <h3>{t("guide_caps_figure_name")}</h3>
              <p>{t("guide_caps_cap_limit")}</p>
              <div class="cycle">
                <button type="button" onclick={nextCap}>
                  {t("guide_caps_show_another")}
                </button>
                <span
                  >{t("guide_caps_figure_count", {
                    n: capIndex + 1,
                    total: CAPS.length,
                  })}</span
                >
              </div>
            </div>
          {/snippet}
        </SequenceShowcase>
        <div class="centered">
          <p class="credit">{t("guide_caps_cap_credit")}</p>
          <div class="links">
            <LinkChip href={localHref("/guide/eight-step")}
              >{t("guide_eightstep_title")}</LinkChip
            >
            <LinkChip href={localHref("/notation/caps")}
              >{t("guide_caps_link_caps")}</LinkChip
            >
          </div>
        </div>
      </section>

      <section class="level" aria-labelledby="letters-heading">
        <div class="centered">
          <h2 id="letters-heading">{t("guide_caps_letters_title")}</h2>
          <p>{t("guide_caps_letters_body")}</p>
          <p>{t("guide_caps_letters_repeat")}</p>
        </div>
        <SequenceShowcase
          sequence={capLettered}
          items={capItems}
          render={capRender("letters")}
          loop
          {picTheme}
          onStepChange={(step) => (lettersStep = step)}
        >
          {#snippet text()}
            <CapReadout {cap} level="letters" step={lettersStep} {picTheme} />
          {/snippet}
        </SequenceShowcase>
        <div
          class="picker"
          role="group"
          aria-label={t("guide_caps_picker_label")}
        >
          {#each groups as group (group.key)}
            <div class="picker-group">
              <p class="picker-heading">
                {t(TIMING_LABEL[group.timing])} · {t(
                  DIRECTION_LABEL[group.direction]
                )}
              </p>
              <div class="picker-words">
                {#each group.words as entry (entry.word)}
                  <button
                    type="button"
                    class="word"
                    class:selected={entry.word === cap.word}
                    aria-pressed={entry.word === cap.word}
                    aria-label={entry.word}
                    onclick={() => (capIndex = entry.i)}
                  >
                    {#if browser}
                      <TKAWordGlyph
                        word={entry.word}
                        height={22}
                        darkMode={picTheme === "dark"}
                      />
                    {:else}
                      <span class="word-text">{entry.word}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
        <div class="centered">
          <p>
            {t("guide_caps_letters_shared", {
              caps: CAPS.length,
              words: CAP_WORDS.length,
            })}
          </p>
          <p>{t("guide_caps_letters_think")}</p>
        </div>
      </section>

      <section class="level" aria-labelledby="vtg-heading">
        <div class="centered">
          <h2 id="vtg-heading">{t("guide_caps_vtg_title")}</h2>
          <p>{t("guide_caps_vtg_body")}</p>
          <p>{t("guide_caps_vtg_cap")}</p>
        </div>
        <SequenceShowcase
          sequence={capLettered}
          items={capItems}
          render={capRender("vtg")}
          loop
          {picTheme}
          onStepChange={(step) => (vtgStep = step)}
        >
          {#snippet text()}
            <div class="beside">
              <CapReadout {cap} level="vtg" step={vtgStep} {picTheme} />
              <p>{t("guide_caps_vtg_check")}</p>
              {#if sameWord.total > 1}
                <div class="cycle">
                  <button type="button" onclick={nextSameWord}>
                    {t("guide_caps_same_word")}
                  </button>
                  <span>{t("guide_caps_figure_count", sameWord)}</span>
                </div>
              {/if}
            </div>
          {/snippet}
        </SequenceShowcase>
      </section>

      <section class="level centered" aria-labelledby="close-heading">
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
    gap: clamp(56px, 8vw, 96px);
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
  }
  .essay h1 {
    margin: 0;
    padding: 0;
    grid-column: auto;
  }
  .essay h2,
  .essay h3 {
    margin: 0;
  }
  .essay p {
    line-height: 1.65;
    color: var(--theme-text-muted);
    margin: 0;
  }

  /* Headings, intros and section prose sit centred, as on the other Guide
     pages; the reading beside each canvas reads left. */
  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
  }
  .centered p {
    max-width: 64ch;
  }
  .intro {
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
  .essay .credit {
    font-size: 0.875rem;
  }

  /* One level: its heading and prose, its showcase, then any follow-up. */
  .level {
    display: flex;
    flex-direction: column;
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

  /* The reading beside a CAP's canvas. */
  .beside {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .beside h3 {
    font-size: 1.5rem;
  }
  .beside p {
    max-width: 44ch;
  }
  .cycle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .cycle button {
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--theme-text) 22%, transparent);
    background: color-mix(in oklab, var(--theme-text) 6%, transparent);
    color: var(--theme-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .cycle button:hover {
    background: color-mix(in oklab, var(--theme-text) 12%, transparent);
  }
  .cycle button:focus-visible {
    outline: 2px solid var(--semantic-warning);
    outline-offset: 2px;
  }
  .cycle span {
    font-size: 0.875rem;
    color: var(--theme-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .picker {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem 2rem;
  }
  .picker-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .essay .picker-heading {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .picker-words {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    max-width: 22rem;
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

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    margin-top: 0.25rem;
  }
</style>
