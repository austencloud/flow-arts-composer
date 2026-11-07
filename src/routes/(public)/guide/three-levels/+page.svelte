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
  import type { Action } from "svelte/action";
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
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
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

  // The picker offers each word once, a tab per VTG timing and a group per
  // direction, as the Eight Step page sorts its paths. A word shared by several
  // CAPs plays the first.
  const TIMING_LABEL: Record<CapTiming, Parameters<typeof t>[0]> = {
    split: "guide_eightstep_timing_split_title",
    together: "guide_eightstep_timing_together_title",
    quarter: "guide_eightstep_timing_quarter_title",
  };
  const DIRECTION_LABEL: Record<CapDirection, Parameters<typeof t>[0]> = {
    same: "guide_eightstep_direction_same",
    opposite: "guide_eightstep_direction_opposite",
  };
  const pickerWords = (timing: CapTiming, direction: CapDirection) =>
    CAP_WORDS.filter(
      (w) => w.timing === timing && w.direction === direction
    ).map((w) => ({ word: w.word, i: CAPS.indexOf(w.caps[0]!) }));
  const timingOptions = $derived(
    CAP_TIMINGS.map((timing) => ({
      value: timing,
      label: t(TIMING_LABEL[timing]),
      id: `cap-tab-${timing}`,
      controls: `cap-panel-${timing}`,
    }))
  );
  const directionOptions = $derived(
    CAP_DIRECTIONS.map((direction) => ({
      value: direction,
      label: t(DIRECTION_LABEL[direction]),
    }))
  );
  // The tabs only choose which words show. Pressing a word changes the player,
  // and the screen opens on the chosen word's tab (watchPicker).
  let timingTab = $state<CapTiming>("split");
  let directionTab = $state<CapDirection>("same");

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

  // The picker's words and controls keep one size, so its screen is composed
  // from the room the frame really has, and the player takes what is left.
  const WORD_GLYPH_HEIGHT = 16;
  const PICKER_COLUMNS_WIDTH = 860;
  const COMPACT_WORDS_HEIGHT = 480;
  // A frame wider than it is tall (a phone on its side) keeps the columns on
  // less width, since stacking would leave the player no height at all.
  const PICKER_COLUMNS_MIN_WIDTH = 560;
  const PICKER_COLUMNS_ASPECT = 1.25;
  // Under these frame heights both direction groups would crowd the player
  // (stacked) or the frame itself (columns), so one group shows at a time.
  const ONE_DIRECTION_STACKED_HEIGHT = 500;
  const ONE_DIRECTION_COLUMNS_HEIGHT = 300;
  const PLAYER_READABLE = 240;
  const PLAYER_WITH_STRIP = 380;
  // The picker's and the note's heights are only known once the picker has
  // drawn; these hold the pills steady until it has.
  const PICKER_HEIGHT_GUESS = 286;
  const NOTE_HEIGHT_GUESS = 140;
  const PICKER_NOTE_GAP = 12;
  let frame = $state({ width: 0, height: 0 });
  let pickerHeight = $state(0);
  let noteHeight = $state(0);
  const pickerColumns = $derived(
    frame.width >= PICKER_COLUMNS_WIDTH ||
      (frame.width >= PICKER_COLUMNS_MIN_WIDTH &&
        frame.width >= frame.height * PICKER_COLUMNS_ASPECT)
  );
  const oneDirection = $derived(
    frame.height > 0 &&
      frame.height <
        (pickerColumns
          ? ONE_DIRECTION_COLUMNS_HEIGHT
          : ONE_DIRECTION_STACKED_HEIGHT)
  );
  const compactWords = $derived(
    oneDirection || (frame.height > 0 && frame.height < COMPACT_WORDS_HEIGHT)
  );
  const withNoteHeight = $derived(
    (pickerHeight || PICKER_HEIGHT_GUESS) +
      PICKER_NOTE_GAP +
      (noteHeight || NOTE_HEIGHT_GUESS)
  );
  const noteFits = $derived(
    frame.height > 0 &&
      withNoteHeight + (pickerColumns ? 0 : PLAYER_READABLE) <= frame.height
  );
  // The step strip stays where the player still has a good size above it.
  const pickerStrip = $derived(
    frame.height -
      (pickerColumns
        ? 0
        : noteFits
          ? withNoteHeight
          : pickerHeight || PICKER_HEIGHT_GUESS) >=
      PLAYER_WITH_STRIP
  );
  const watchFrame: Action<HTMLElement> = (screen) => {
    const area = screen.closest<HTMLElement>(".fit-area");
    if (!area) return;
    const read = () => {
      const width = area.clientWidth;
      const height = area.clientHeight;
      if (width !== frame.width || height !== frame.height)
        frame = { width, height };
    };
    const observer = new ResizeObserver(read);
    observer.observe(area);
    read();
    return { destroy: () => observer.disconnect() };
  };
  // The picker column opens on the chosen word and reports how tall the words
  // and the note stand. The note is always drawn, out of sight when it has its
  // own screen, so its height never depends on where it sits.
  const watchPicker: Action<HTMLElement> = (column) => {
    // The first paint's out-of-sight copy has no width to measure.
    if (!column.closest(".fit-area")) return;
    const chosen = CAP_WORDS.find((w) => w.word === cap.word)!;
    timingTab = chosen.timing;
    directionTab = chosen.direction;
    const core = column.querySelector<HTMLElement>(".picker-core");
    const note = column.querySelector<HTMLElement>(".picker-note");
    if (!core || !note) return;
    const read = () => {
      pickerHeight = core.offsetHeight;
      noteHeight = note.offsetHeight;
    };
    const observer = new ResizeObserver(read);
    observer.observe(core);
    observer.observe(note);
    read();
    return { destroy: () => observer.disconnect() };
  };

  const views = $derived.by(() => {
    const out: { label: string; parts: Part[] }[] = [];
    const names = t("guide_caps_names_title");
    const capTitle = t("guide_caps_cap_title");
    const letters = t("guide_caps_letters_title");
    const vtg = t("guide_caps_vtg_title");
    const pickerLabel = t("guide_caps_picker_label");
    const sharedLabel = "One word, many CAPs";
    // The note sits with the picker when both fit, and takes the next screen
    // when they do not.
    const pushPicker = () => {
      if (noteFits) {
        out.push({ label: pickerLabel, parts: ["picker", "lettersShared"] });
      } else {
        out.push({ label: pickerLabel, parts: ["picker"] });
        out.push({ label: sharedLabel, parts: ["lettersShared"] });
      }
    };
    if (tier === "small") {
      out.push({ label: names, parts: ["lede", "namesText"] });
      out.push({ label: `Watch: ${names}`, parts: ["names"] });
      out.push({ label: "What a name leaves out", parts: ["namesLimit"] });
      out.push({ label: capTitle, parts: ["capBody", "capLimit"] });
      out.push({ label: "Gage's CAPs", parts: ["capRules", "capCredit"] });
      out.push({ label: `Watch: ${capTitle}`, parts: ["cap"] });
      out.push({ label: letters, parts: ["lettersText"] });
      out.push({ label: `Watch: ${letters}`, parts: ["letters"] });
      pushPicker();
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
      pushPicker();
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

{#snippet noStrip(_progress: number)}{/snippet}

{#snippet capNote()}
  <p>
    {t("guide_caps_letters_shared", {
      caps: CAPS.length,
      words: CAP_WORDS.length,
    })}
  </p>
  <p>{t("guide_caps_letters_think")}</p>
{/snippet}

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
          <div class="screen" use:watchFrame>
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
                class="cap-stage"
                class:columns={pickerColumns}
                class:compact={compactWords}
              >
                <div class="cap-player">
                  <SequenceShowcase
                    sequence={capLettered}
                    items={capItems}
                    render={capRender("letters")}
                    loop
                    stripBeside
                    stripUnder
                    strip={pickerStrip ? undefined : noStrip}
                    {picTheme}
                  />
                </div>
                <div class="cap-picker" use:watchPicker>
                  <div
                    class="picker-core"
                    role="group"
                    aria-label={t("guide_caps_picker_label")}
                  >
                    <p class="picker-hint">{t("guide_caps_picker_hint")}</p>
                    <SegmentedControl
                      size="sm"
                      density="compact"
                      semantics="tabs"
                      color="accent"
                      ariaLabel={t("guide_caps_picker_label")}
                      options={timingOptions}
                      value={timingTab}
                      onchange={(timing) => (timingTab = timing)}
                    />
                    {#if oneDirection}
                      <SegmentedControl
                        size="sm"
                        density="compact"
                        semantics="radiogroup"
                        color="accent"
                        ariaLabel={t("guide_caps_picker_label")}
                        options={directionOptions}
                        value={directionTab}
                        onchange={(direction) => (directionTab = direction)}
                      />
                    {/if}
                    <!-- Every tab stands in one grid cell, so the tallest holds
                         the height and changing tab moves nothing below it. -->
                    <div class="picker-panels">
                      {#each CAP_TIMINGS as timing (timing)}
                        <div
                          class="picker-panel"
                          class:shown={timing === timingTab}
                          class:one-direction={oneDirection}
                          id="cap-panel-{timing}"
                          role="tabpanel"
                          aria-labelledby="cap-tab-{timing}"
                          inert={timing !== timingTab}
                        >
                          {#each CAP_DIRECTIONS as direction (direction)}
                            <div
                              class="picker-group"
                              class:shown={!oneDirection ||
                                direction === directionTab}
                            >
                              {#if !oneDirection}
                                <p class="picker-heading">
                                  {t(DIRECTION_LABEL[direction])}
                                </p>
                              {/if}
                              <div class="picker-words">
                                {#each pickerWords(timing, direction) as entry (entry.word)}
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
                                        height={WORD_GLYPH_HEIGHT}
                                        darkMode={picTheme === "dark"}
                                      />
                                    {:else}
                                      <span class="word-text">{entry.word}</span
                                      >
                                    {/if}
                                  </button>
                                {/each}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  </div>
                  <div
                    class="picker-note"
                    class:parked={!has(n, "lettersShared")}
                  >
                    {@render capNote()}
                  </div>
                </div>
              </div>
            {/if}

            {#if has(n, "lettersShared") && !has(n, "picker")}
              <div class="centered">{@render capNote()}</div>
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

  /* The player and the words that change it share one screen. The player is
     the figure: it reads --fit and takes the room the picker leaves. The picker
     holds one width and one type size at every window. */
  .screen:has(.cap-stage) {
    max-width: none;
  }
  .cap-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
  }
  .cap-stage.columns {
    grid-template-columns: minmax(0, 1fr) min(30rem, 58cqw);
    gap: clamp(1.25rem, 3cqw, 3rem);
  }
  .cap-player {
    min-width: 0;
  }
  .cap-player :global(.banner) {
    flex-direction: column;
    align-items: center;
  }
  .cap-player :global(.banner > .banner-text) {
    display: none;
  }
  .cap-player.cap-player :global(.banner > .canvas-box.canvas-box) {
    flex: none;
    width: min(100%, calc(400px * var(--fit, 1)));
    margin: 0;
  }
  /* The playing step grows a little past its cell; its row keeps that room. */
  .cap-player :global(.showcase > .guide-step-strip) {
    padding-block-end: calc(5px * var(--fit, 1));
  }
  .cap-picker {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .picker-core {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .essay .picker-hint {
    font-size: 0.9375rem;
    line-height: 1.3;
    text-align: center;
    color: var(--theme-text);
  }
  .picker-panels {
    display: grid;
  }
  .picker-panel {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      visibility var(--duration-fast) var(--ease-standard);
  }
  .picker-panel.shown {
    opacity: 1;
    visibility: visible;
  }
  /* One direction at a time: both groups share the cell as the tabs do. */
  .picker-panel.one-direction {
    display: grid;
  }
  .one-direction .picker-group {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  .picker-panel.shown.one-direction .picker-group.shown {
    visibility: visible;
  }
  .picker-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .essay .picker-heading {
    font-size: 0.75rem;
    line-height: 1.3;
    text-align: center;
  }
  .picker-words {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.25rem, 1fr));
    gap: 4px;
  }
  .word {
    display: grid;
    place-items: center;
    min-width: 0;
    height: 36px;
    min-height: 0;
    padding: 0 6px;
    border-radius: 8px;
    border: 1px solid color-mix(in oklab, var(--theme-text) 10%, transparent);
    background: color-mix(in oklab, var(--theme-text) 3%, transparent);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .compact .word {
    height: 32px;
  }
  /* A phone or a short frame spends its height on the player. */
  .compact .picker-core :global(.ui-segments button) {
    min-height: 36px;
    padding-block: 0;
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
    background: color-mix(in srgb, var(--semantic-warning) 18%, transparent);
  }
  .word:focus-visible {
    outline: 2px solid var(--semantic-warning);
    outline-offset: 2px;
  }
  .picker-note {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
  }
  .essay .picker-note p {
    font-size: 0.875rem;
    line-height: 1.5;
  }
  /* It has its own screen here: still drawn so it can be measured. */
  .picker-note.parked {
    position: absolute;
    inset: 0 0 auto;
    visibility: hidden;
  }
  @media (prefers-reduced-motion: reduce) {
    .picker-panel,
    .word {
      transition: none;
    }
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    margin-top: 0.25rem;
  }
</style>
