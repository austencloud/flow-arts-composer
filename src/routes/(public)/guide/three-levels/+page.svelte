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
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";
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

  // One screen at a time (2026-10-24 fit pass). Each level gets its idea
  // first, then its player. A phone reads the words on their own screen
  // and watches the player on the next; longer readings split in two.
  type Part =
    | "lede"
    | "namesText"
    | "names"
    | "namesLimit"
    | "capBody"
    | "capRules"
    | "cap"
    | "capCredit"
    | "capLimit"
    | "vtgCheck"
    | "lettersText"
    | "letters"
    | "picker"
    | "lettersShared"
    | "vtgBody"
    | "vtgCap"
    | "vtg"
    | "close";
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const views = $derived.by(() => {
    const out: { label: string; parts: Part[] }[] = [];
    const names = t("guide_caps_names_title");
    const capTitle = t("guide_caps_cap_title");
    const letters = t("guide_caps_letters_title");
    const vtg = t("guide_caps_vtg_title");
    if (tier === "small") {
      out.push({ label: names, parts: ["lede", "namesText"] });
      out.push({ label: `Watch: ${names}`, parts: ["names"] });
      out.push({ label: "What a name leaves out", parts: ["namesLimit"] });
      out.push({ label: capTitle, parts: ["capBody", "capLimit"] });
      out.push({ label: "Gage's CAPs", parts: ["capRules", "capCredit"] });
      out.push({ label: `Watch: ${capTitle}`, parts: ["cap"] });
      out.push({ label: letters, parts: ["lettersText"] });
      out.push({ label: `Watch: ${letters}`, parts: ["letters"] });
      out.push({ label: t("guide_caps_picker_label"), parts: ["picker"] });
      out.push({ label: "One word, many CAPs", parts: ["lettersShared"] });
      out.push({ label: vtg, parts: ["vtgBody"] });
      out.push({ label: "Three spins", parts: ["vtgCap", "vtgCheck"] });
      out.push({ label: `Watch: ${vtg}`, parts: ["vtg"] });
    } else {
      if (tier === "large")
        out.push({
          label: names,
          parts: ["lede", "namesText", "names", "namesLimit"],
        });
      else {
        out.push({ label: names, parts: ["lede", "namesText", "names"] });
        out.push({ label: "What a name leaves out", parts: ["namesLimit"] });
      }
      out.push({ label: capTitle, parts: ["capBody", "capRules"] });
      out.push({ label: `Watch: ${capTitle}`, parts: ["cap", "capCredit"] });
      out.push({ label: letters, parts: ["lettersText"] });
      out.push({ label: `Watch: ${letters}`, parts: ["letters"] });
      out.push({
        label: t("guide_caps_picker_label"),
        parts: ["picker", "lettersShared"],
      });
      out.push({ label: vtg, parts: ["vtgBody", "vtgCap"] });
      out.push({ label: `Watch: ${vtg}`, parts: ["vtg"] });
    }
    out.push({ label: t("guide_caps_close_title"), parts: ["close"] });
    return out;
  });
  const has = (n: number, part: Part) => views[n]?.parts.includes(part);
  const small = $derived(tier === "small");

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
    <main class="essay guide-page-route">
      <GuideScreens
        title={t("guide_caps_title")}
        kicker={t("guide_caps_eyebrow")}
        labels={views.map((v) => v.label)}
        hubHref={localHref("/guide")}
      >
        {#snippet screen(n)}
          <div class="screen">
            {#if has(n, "lede")}
              <p class="lede centered-text">{t("guide_caps_lede")}</p>
            {/if}

            {#if has(n, "namesText")}
              <div class="centered">
                <h2>{t("guide_caps_names_title")}</h2>
                <p>{t("guide_caps_names_body")}</p>
              </div>
            {/if}

            {#if has(n, "names")}
              <SequenceShowcase
                variant="compact"
                sequence={zans.sequence}
                items={zans.items}
                render={zans.render}
                loop
                stripBeside
                {picTheme}
              >
                {#snippet text()}
                  <div class="name-label">
                    <h3>Zan's Diamond</h3>
                    <p>
                      {t("guide_caps_names_by", {
                        name: ZANS_DIAMOND_CREDIT.name,
                      })}
                    </p>
                  </div>
                {/snippet}
              </SequenceShowcase>
            {/if}

            {#if has(n, "namesLimit")}
              <div class="centered">
                <p>{t("guide_caps_names_limit")}</p>
              </div>
            {/if}

            {#if has(n, "capBody") || has(n, "capRules")}
              <div class="centered">
                {#if has(n, "capBody")}
                  <h2>{t("guide_caps_cap_title")}</h2>
                  <p>{t("guide_caps_cap_body")}</p>
                {/if}
                {#if has(n, "capLimit")}
                  <p>{t("guide_caps_cap_limit")}</p>
                {/if}
                {#if has(n, "capRules")}
                  <p>{t("guide_caps_cap_rules", { count: CAPS.length })}</p>
                {/if}
              </div>
            {/if}

            {#if has(n, "cap")}
              <SequenceShowcase
                sequence={capByName}
                items={capItems}
                render={capRender("name")}
                loop
                stripBeside
                {picTheme}
              >
                {#snippet text()}
                  <div class="beside">
                    {#if !small}
                      <h3>{t("guide_caps_figure_name")}</h3>
                      <p>{t("guide_caps_cap_limit")}</p>
                    {/if}
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
            {/if}

            {#if has(n, "capCredit")}
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
            {/if}

            {#if has(n, "lettersText") && !has(n, "letters")}
              <div class="centered">
                <h2>{t("guide_caps_letters_title")}</h2>
                <p>{t("guide_caps_letters_body")}</p>
                <p>{t("guide_caps_letters_repeat")}</p>
              </div>
            {/if}

            {#if has(n, "letters")}
              <SequenceShowcase
                sequence={capLettered}
                items={capItems}
                render={capRender("letters")}
                loop
                stripBeside
                {picTheme}
                onStepChange={(step) => (lettersStep = step)}
              >
                {#snippet text()}
                  <div class="beside">
                    {#if has(n, "lettersText")}
                      <h2>{t("guide_caps_letters_title")}</h2>
                      <p>{t("guide_caps_letters_body")}</p>
                      <p>{t("guide_caps_letters_repeat")}</p>
                    {/if}
                    <CapReadout
                      {cap}
                      level="letters"
                      step={lettersStep}
                      {picTheme}
                    />
                  </div>
                {/snippet}
              </SequenceShowcase>
            {/if}

            {#if has(n, "picker")}
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
            {/if}

            {#if has(n, "lettersShared")}
              <div class="centered">
                <p>
                  {t("guide_caps_letters_shared", {
                    caps: CAPS.length,
                    words: CAP_WORDS.length,
                  })}
                </p>
                <p>{t("guide_caps_letters_think")}</p>
              </div>
            {/if}

            {#if has(n, "vtgBody") || has(n, "vtgCap")}
              <div class="centered">
                {#if has(n, "vtgBody")}
                  <h2>{t("guide_caps_vtg_title")}</h2>
                  <p>{t("guide_caps_vtg_body")}</p>
                {/if}
                {#if has(n, "vtgCap")}
                  <p>{t("guide_caps_vtg_cap")}</p>
                {/if}
                {#if has(n, "vtgCheck")}
                  <p>{t("guide_caps_vtg_check")}</p>
                {/if}
              </div>
            {/if}

            {#if has(n, "vtg")}
              <SequenceShowcase
                sequence={capLettered}
                items={capItems}
                render={capRender("vtg")}
                loop
                stripBeside
                {picTheme}
                onStepChange={(step) => (vtgStep = step)}
              >
                {#snippet text()}
                  <div class="beside">
                    <CapReadout {cap} level="vtg" step={vtgStep} {picTheme} />
                    {#if !small}<p>{t("guide_caps_vtg_check")}</p>{/if}
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
            {/if}

            {#if has(n, "close")}
              <div class="centered">
                <h2>{t("guide_caps_close_title")}</h2>
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
              </div>
            {/if}
          </div>
        {/snippet}
      </GuideScreens>
    </main>
  </GuideShell>
{/if}

<style>
  .essay {
    width: 100%;
    min-width: 0;
    color: var(--theme-text);
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
  }
  .screen {
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2.5vh, 2rem);
    width: 100%;
    max-width: calc(1180px * max(var(--fit, 1), 1));
    margin-inline: auto;
  }
  .essay h2,
  .essay h3 {
    margin: 0;
  }
  .essay p {
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0;
  }

  /* Headings and section prose sit centred, as on the other Guide pages;
     the reading beside each canvas reads left. */
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
  .essay .lede {
    max-width: 56ch;
    margin-inline: auto;
    font-size: 1.125rem;
    text-align: center;
    text-wrap: balance;
    color: var(--theme-text);
  }
  .essay .credit {
    font-size: 0.875rem;
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

  /* The word buttons and the beat readout are drawn at fixed pixel sizes;
     zoom lets them follow the screen's scale (--fit) like the rest. */
  .picker,
  .screen :global(.readout) {
    zoom: clamp(0.45, var(--fit, 1), 1.75);
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
