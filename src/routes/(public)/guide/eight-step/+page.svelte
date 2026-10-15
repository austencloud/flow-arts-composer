<!--
  /guide/eight-step: Gage DeMello's Eight Step CAPs, still a draft.

  Production prerenders the "being written" note (noindex), and the page is
  off the Guide hub, the Guide contents and the sitemap until Austen approves
  it. A local dev server shows the page below.
-->
<script lang="ts">
  /**
   * Gage's chart reduced to its eight hand paths, shown before it is told.
   * Three tiles open the page: the left hand alone (it caps, two beats on
   * and one back), both hands in the middle with the only step counter, and
   * the right hand alone (it keeps circling). Then one
   * player with a prop, beside the prop picker and a spin picker per hand:
   * the nine pairings of the chart, named by motion and turns. Picking poi
   * flags the pairings poi can't spin. Then one box per pair of paths in
   * Gage's chart, each stepping through its two paths in all nine spins with
   * "Show another example", as Zan's Diamond does. These are hand paths, so
   * the strips show no letters.
   * The record lives in #lib/shared/guide-topics/caps-topic.ts.
   */
  import { onMount } from "svelte";
  import { dev } from "$app/env";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import HandTile from "./_components/HandTile.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographRender } from "../level-1/_data/guide-content-blocks";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
    TrailMode,
    type TrailSettings,
  } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import {
    CAP_HAND_PATHS,
    CAP_RELATIONS,
    capPairing,
    capStrip,
    capWorksOnPoi,
    type Cap,
    type CapHandPath,
    type CapRelation,
    type CapSpin,
  } from "#lib/shared/guide-topics/caps-topic.js";

  // Gage's own write-up of the chart, in Mentive's SpiroAnim repository.
  const EIGHT_STEP_SOURCE =
    "https://github.com/rbgirard/spiroanim/blob/main/docs/EIGHT_STEP.md";

  // The bare hands draw their path as they travel: the left hand closes the
  // ring once in twelve beats, the right in four. The drawing stays until the
  // loop restarts.
  const HAND_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.HAND,
  };
  // With a prop, each tip draws its pattern, which is where the spins differ.
  const TIP_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.RIGHT_END,
  };

  // Page state only: each visit opens on staff, both hands antispin.
  let propType = $state<PropType>(PropType.STAFF);
  // Eight, so the tiles fill whole rows of eight, four or two.
  const PROP_CHOICES: readonly PropType[] = [
    PropType.STAFF,
    PropType.POI,
    PropType.CLUB,
    PropType.BUUGENG,
    PropType.FAN,
    PropType.MINIHOOP,
    PropType.BIGHOOP,
    PropType.TRIAD,
  ];
  let leftSpin = $state<CapSpin>("antispin");
  let rightSpin = $state<CapSpin>("antispin");

  // Hand paths carry no letters; each cell shows the app's step label.
  const PROP_RENDER: PictographRender = $derived({
    propType,
    showTKA: false,
    showStepNumbers: true,
  });

  const SPINS: readonly CapSpin[] = ["antispin", "extension", "prospin"];
  const SPIN_LABEL: Record<CapSpin, Parameters<typeof t>[0]> = {
    antispin: "guide_eightstep_spin_antispin",
    extension: "guide_eightstep_spin_extension",
    prospin: "guide_eightstep_spin_prospin",
  };
  const spinOptions = (tone: "blue" | "red") =>
    SPINS.map((spin) => ({ value: spin, label: t(SPIN_LABEL[spin]), tone }));

  // The chart's left hand always caps, so the left pick is the capping spin.
  const capOf = (path: CapHandPath, capping: CapSpin, circling: CapSpin) =>
    path.caps.find((cap) => {
      const pairing = capPairing(cap);
      return pairing.capping === capping && pairing.circling === circling;
    })!;
  // The CAP id names the sequence, so the player reloads on every new pick
  // even where two pairings spell the same word.
  const showcase = (cap: Cap) => {
    const items = capStrip(cap);
    return {
      items,
      sequence: stripToSequence(items, { word: cap.word, name: cap.id }),
    };
  };

  const firstPath = CAP_HAND_PATHS[0]!;
  const hands = showcase(firstPath.caps[0]!).sequence;
  const spinCap = $derived(capOf(firstPath, leftSpin, rightSpin));
  const spinExample = $derived(showcase(spinCap));
  const notForPoi = (cap: Cap) =>
    propType === PropType.POI && !capWorksOnPoi(cap);

  // What tells the two paths in each of Gage's pairs apart.
  const PATH_TITLE: Record<number, Parameters<typeof t>[0]> = {
    1: "guide_eightstep_path_split_title",
    2: "guide_eightstep_path_together_title",
    3: "guide_eightstep_path_together_title",
    4: "guide_eightstep_path_split_title",
    5: "guide_eightstep_path_ahead_title",
    6: "guide_eightstep_path_behind_title",
    7: "guide_eightstep_path_swap_title",
    8: "guide_eightstep_path_apart_title",
  };

  // Each group's heading says what its paths share; Gage's own name for the
  // pair rides above it.
  const GROUP_COPY: Record<
    CapRelation,
    { title: Parameters<typeof t>[0]; gage: string }
  > = {
    opposite: {
      title: "guide_eightstep_group_opposite_title",
      gage: "Opposite",
    },
    same: { title: "guide_eightstep_group_same_title", gage: "Same" },
    "quarter-aligned": {
      title: "guide_eightstep_group_quarter_aligned_title",
      gage: "Quarter Aligned",
    },
    "quarter-opposed": {
      title: "guide_eightstep_group_quarter_opposed_title",
      gage: "Quarter Opposed",
    },
  };

  // Poi-friendly pairings first, so a box's opening examples suit every
  // prop; each pairing then shows both of the pair's paths in turn.
  const PAIRINGS: readonly [CapSpin, CapSpin][] = [
    ["antispin", "antispin"],
    ["antispin", "extension"],
    ["extension", "antispin"],
    ["extension", "extension"],
    ["antispin", "prospin"],
    ["prospin", "antispin"],
    ["extension", "prospin"],
    ["prospin", "extension"],
    ["prospin", "prospin"],
  ];
  const exampleProse = (path: CapHandPath, cap: Cap) => {
    const { capping, circling } = capPairing(cap);
    const line = t("guide_eightstep_example", {
      path: t(PATH_TITLE[path.column]!),
      left: t(SPIN_LABEL[capping]),
      right: t(SPIN_LABEL[circling]),
    });
    return notForPoi(cap) ? `${line} ${t("guide_eightstep_not_poi")}` : line;
  };

  // One box per pair: its examples cycle with "Show another example".
  const groups = $derived(
    CAP_RELATIONS.map((relation) => {
      const paths = CAP_HAND_PATHS.filter((p) => p.relation === relation);
      const entries = PAIRINGS.flatMap(([capping, circling]) =>
        paths.map((path) => ({ path, cap: capOf(path, capping, circling) }))
      );
      return {
        relation,
        ...GROUP_COPY[relation],
        first: showcase(entries[0]!.cap),
        pool: entries.map(({ path, cap }) => ({
          word: cap.id,
          loopLabel: "",
          proseHtml: exampleProse(path, cap),
          items: capStrip(cap),
        })),
      };
    })
  );

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
    title={t("guide_eightstep_seo_title")}
    description={t("guide_eightstep_seo_description")}
    path="/guide/eight-step"
    datePublished="2026-10-15"
    partOf={{ name: t("guide_eightstep_part_of"), path: "/guide" }}
    breadcrumbs={[
      { name: "Home", path: "/" },
      { name: "Guide", path: "/guide" },
      { name: t("guide_eightstep_title"), path: "/guide/eight-step" },
    ]}
  />

  <GuideShell>
    <article class="eight-step guide-page-route">
      <header class="intro">
        <h1>{t("guide_eightstep_title")}</h1>
        <p class="lede">
          {t("guide_eightstep_lede", { name: "Gage DeMello" })}
        </p>
      </header>

      <section class="hands" aria-labelledby="hands-heading">
        <h2 id="hands-heading">{t("guide_eightstep_hands_title")}</h2>
        <div class="hand-tiles">
          <HandTile
            sequence={hands}
            hand="left"
            caption={t("guide_eightstep_hand_left")}
            trail={HAND_TRAIL}
          />
          <HandTile
            sequence={hands}
            hand="both"
            caption={t("guide_eightstep_hand_both")}
            trail={HAND_TRAIL}
            stepNumbers
          />
          <HandTile
            sequence={hands}
            hand="right"
            caption={t("guide_eightstep_hand_right")}
            trail={HAND_TRAIL}
          />
        </div>
      </section>

      <div class="spin-demo">
        <SequenceShowcase
          sequence={spinExample.sequence}
          items={spinExample.items}
          trail={TIP_TRAIL}
          render={PROP_RENDER}
          canvasLetter={false}
          loop
          {picTheme}
        >
          {#snippet text()}
            <h2>{t("guide_eightstep_spins_title")}</h2>
            <p>{t("guide_eightstep_spins_body")}</p>
            <div class="pickers">
              <div class="picker">
                <span class="picker-label">{t("guide_eightstep_prop")}</span>
                <PropChoiceRow
                  value={propType}
                  options={PROP_CHOICES}
                  label={t("guide_eightstep_prop")}
                  onchange={(pt) => (propType = pt)}
                />
              </div>
              <div class="picker">
                <span class="picker-label" id="spin-left-label"
                  >{t("guide_eightstep_spin_left")}</span
                >
                <SegmentedControl
                  options={spinOptions("blue")}
                  value={leftSpin}
                  onchange={(spin) => (leftSpin = spin)}
                  ariaLabelledby="spin-left-label"
                  semantics="radiogroup"
                  color="blue"
                />
              </div>
              <div class="picker">
                <span class="picker-label" id="spin-right-label"
                  >{t("guide_eightstep_spin_right")}</span
                >
                <SegmentedControl
                  options={spinOptions("red")}
                  value={rightSpin}
                  onchange={(spin) => (rightSpin = spin)}
                  ariaLabelledby="spin-right-label"
                  semantics="radiogroup"
                  color="red"
                />
              </div>
            </div>
            {#if notForPoi(spinCap)}
              <p class="poi-note">{t("guide_eightstep_poi_note")}</p>
            {/if}
            <div class="chip">
              <LinkChip href={localHref("/guide/prospin-and-inspin")}
                >{t("guide_eightstep_link_prospin")}</LinkChip
              >
            </div>
          {/snippet}
        </SequenceShowcase>
      </div>

      <section class="paths" aria-labelledby="paths-heading">
        <div class="paths-intro">
          <h2 id="paths-heading">{t("guide_eightstep_paths_title")}</h2>
          <p>{t("guide_eightstep_paths_body")}</p>
        </div>
        <div class="group-grid">
          {#each groups as group (group.relation)}
            <SequenceShowcase
              sequence={group.first.sequence}
              items={group.first.items}
              pool={group.pool}
              trail={TIP_TRAIL}
              render={PROP_RENDER}
              canvasLetter={false}
              loop
              {picTheme}
            >
              {#snippet text()}
                <div class="group-text">
                  <span class="gage-name"
                    >{t("guide_eightstep_gage_name", {
                      name: group.gage,
                    })}</span
                  >
                  <h3>{t(group.title)}</h3>
                </div>
              {/snippet}
            </SequenceShowcase>
          {/each}
        </div>
      </section>

      <footer class="credit">
        <p>{t("guide_caps_cap_credit")}</p>
        <div class="links">
          <LinkChip
            href={EIGHT_STEP_SOURCE}
            target="_blank"
            rel="noopener noreferrer">{t("guide_caps_link_source")}</LinkChip
          >
          <LinkChip href={localHref("/notation/caps")}
            >{t("guide_caps_link_caps")}</LinkChip
          >
        </div>
      </footer>
    </article>
  </GuideShell>
{/if}

<style>
  /* Wider than the reading pages: on a large screen the paths go two to a
     row instead of leaving the sides empty. */
  .eight-step {
    width: 100%;
    min-width: 0;
    max-width: 2560px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: flex;
    flex-direction: column;
    gap: clamp(48px, 6vw, 88px);
    container-type: inline-size;
    /* SequenceShowcase colours its controls with the Level 1 ink tokens; map
       them to this page's theme, as /guide/zans-diamond does. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
    /* The hand tiles and the spin section share one width, growing on very
       wide screens so they don't sit as a thin column in the middle. */
    --demo-width: clamp(1320px, 62cqw, 1680px);
  }
  .eight-step h1 {
    margin: 0;
    padding: 0;
    grid-column: auto;
  }
  .eight-step h2,
  .eight-step h3,
  .eight-step h4 {
    margin: 0;
  }
  .eight-step p {
    max-width: 72ch;
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0;
  }
  .intro,
  .paths-intro,
  .credit,
  .hands {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    text-align: center;
  }
  .eight-step .lede {
    font-size: 1.125rem;
    color: var(--theme-text);
    text-wrap: balance;
  }

  /* Three tiles in a row, as large as the row allows; a phone stacks them
     at a size that still fits one tile on screen. */
  .hands {
    gap: var(--spacing-lg, 20px);
  }
  .hand-tiles {
    width: 100%;
    max-width: var(--demo-width);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 2.5vw, 32px);
  }
  @container (max-width: 640px) {
    .hand-tiles {
      grid-template-columns: minmax(0, 22rem);
      justify-content: center;
    }
  }

  /* As wide as the hand tiles above it, so the text column ends with its
     pickers instead of running on into empty space. */
  .spin-demo {
    width: 100%;
    max-width: var(--demo-width);
    margin-inline: auto;
  }
  /* The spin canvas is the section's picture: larger than the guide's usual
     feature canvas, so it carries the column its pickers fill. */
  .spin-demo :global(.banner > .canvas-box) {
    flex-basis: clamp(230px, 34cqw, 420px);
  }
  /* The spin section's text column holds the pickers, left-aligned. */
  .pickers {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 12px);
    margin-top: var(--spacing-sm, 8px);
    container-type: inline-size;
  }
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 6px);
  }
  .picker-label {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    color: var(--theme-text-muted);
  }
  /* Eight props in whole rows: one row of eight, two of four, four of two. */
  .picker :global(.prop-grid) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 104px));
  }
  @container (min-width: 780px) {
    .picker :global(.prop-grid) {
      grid-template-columns: repeat(8, minmax(0, 104px));
    }
  }
  @container (max-width: 300px) {
    .picker :global(.prop-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .picker :global(.prop-option) {
    max-width: none;
  }
  /* Three short words don't need the whole column. */
  .picker :global(.segmented-control) {
    max-width: 28rem;
  }
  .chip {
    margin-top: var(--spacing-sm, 8px);
  }
  .poi-note {
    margin-top: var(--spacing-sm, 8px);
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--theme-text);
  }
  /* Stacked on a phone, the showcase puts its whole text column above the
     canvas, which would leave the picture a screen below the pickers that
     change it. Unwrap the text column so the canvas sits between the heading
     and the pickers. */
  @container (max-width: 600px) {
    .spin-demo :global(.banner-text) {
      display: contents;
    }
    .spin-demo :global(.banner > .canvas-box) {
      order: 1;
    }
    .spin-demo .pickers,
    .spin-demo .poi-note,
    .spin-demo .chip {
      order: 2;
    }
  }

  .paths {
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 5vw, 72px);
  }
  /* One box per pair of paths: a column on most screens, two side by side
     once each has room for its canvas and a full strip. */
  .group-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(28px, 3vw, 48px);
  }
  @container (min-width: 2300px) {
    .group-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .gage-name {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--theme-text-muted);
  }
  .group-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-grid h3 {
    font-size: 1.375rem;
  }
  /* Stacked, the showcase centres its example line; the heading follows. */
  @container (max-width: 600px) {
    .group-text {
      align-items: center;
      text-align: center;
    }
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
  }
</style>
