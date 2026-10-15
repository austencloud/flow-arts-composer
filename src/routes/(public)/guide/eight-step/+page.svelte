<!--
  /guide/eight-step: Gage DeMello's Eight Step CAPs, still a draft.

  Production prerenders the "being written" note (noindex), and the page is
  off the Guide hub, the Guide contents and the sitemap until Austen approves
  it. A local dev server shows the page below.
-->
<script lang="ts">
  /**
   * Gage's chart reduced to its eight hand paths. Each path is one
   * SequenceShowcase whose hand trail draws the path, cycling through the
   * nine ways the chart spins it (the capping hand's spin against the
   * circling hand's). The paths sit in Gage's four pairs, named by what they
   * share: which way the hands travel, and whether they start a quarter apart.
   * The opening player shows the first path with bare hands. Like Zan's
   * Diamond, these are hand paths, so the strips show no letters.
   * The record lives in #lib/shared/guide-topics/caps-topic.ts.
   */
  import { onMount } from "svelte";
  import { dev } from "$app/env";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
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
    type Cap,
    type CapRelation,
    type CapSpin,
  } from "#lib/shared/guide-topics/caps-topic.js";

  // Gage's own write-up of the chart, in Mentive's SpiroAnim repository.
  const EIGHT_STEP_SOURCE =
    "https://github.com/rbgirard/spiroanim/blob/main/docs/EIGHT_STEP.md";

  // The hands draw their paths as they travel; the drawing stays until the
  // loop restarts. With props on, the trail still follows the hands.
  const PATH_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.HAND,
  };

  // Hand paths carry no letters; each cell shows the app's step label.
  const RENDER: PictographRender = {
    propType: PropType.HAND,
    showTKA: false,
    showStepNumbers: true,
  };

  // The prop every hand-path player spins. Page state only: each visit opens
  // on staff.
  let propType = $state<PropType>(PropType.STAFF);
  const PROP_CHOICES: readonly PropType[] = [
    PropType.STAFF,
    PropType.POI,
    PropType.CLUB,
    PropType.BUUGENG,
    PropType.FAN,
    PropType.MINIHOOP,
  ];
  const PROP_RENDER: PictographRender = $derived({ ...RENDER, propType });

  const showcase = (cap: Cap) => {
    const items = capStrip(cap);
    return {
      items,
      sequence: stripToSequence(items, { word: cap.word, name: cap.word }),
    };
  };
  const opening = showcase(CAP_HAND_PATHS[0]!.caps[0]!);

  const SPIN_WORD: Record<CapSpin, Parameters<typeof t>[0]> = {
    extension: "guide_caps_spin_extension",
    antispin: "guide_caps_spin_antispin",
    prospin: "guide_caps_spin_prospin",
  };
  const pairingLabel = (cap: Cap) => {
    const { capping, circling } = capPairing(cap);
    return t("guide_eightstep_pairing", {
      capping: t(SPIN_WORD[capping]),
      circling: t(SPIN_WORD[circling]),
    });
  };

  // What tells the two paths in each of Gage's pairs apart.
  const PATH_COPY: Record<
    number,
    { title: Parameters<typeof t>[0]; body: Parameters<typeof t>[0] }
  > = {
    1: {
      title: "guide_eightstep_path_split_title",
      body: "guide_eightstep_path_split_body",
    },
    2: {
      title: "guide_eightstep_path_together_title",
      body: "guide_eightstep_path_together_body",
    },
    3: {
      title: "guide_eightstep_path_together_title",
      body: "guide_eightstep_path_together_body",
    },
    4: {
      title: "guide_eightstep_path_split_title",
      body: "guide_eightstep_path_split_body",
    },
    5: {
      title: "guide_eightstep_path_ahead_title",
      body: "guide_eightstep_path_ahead_body",
    },
    6: {
      title: "guide_eightstep_path_behind_title",
      body: "guide_eightstep_path_behind_body",
    },
    7: {
      title: "guide_eightstep_path_swap_title",
      body: "guide_eightstep_path_swap_body",
    },
    8: {
      title: "guide_eightstep_path_apart_title",
      body: "guide_eightstep_path_apart_body",
    },
  };

  const GROUP_COPY: Record<
    CapRelation,
    { title: Parameters<typeof t>[0]; body: Parameters<typeof t>[0] }
  > = {
    opposite: {
      title: "guide_eightstep_group_opposite_title",
      body: "guide_eightstep_group_opposite_body",
    },
    same: {
      title: "guide_eightstep_group_same_title",
      body: "guide_eightstep_group_same_body",
    },
    "quarter-aligned": {
      title: "guide_eightstep_group_quarter_aligned_title",
      body: "guide_eightstep_group_quarter_aligned_body",
    },
    "quarter-opposed": {
      title: "guide_eightstep_group_quarter_opposed_title",
      body: "guide_eightstep_group_quarter_opposed_body",
    },
  };

  // Each hand path is one player that cycles through its nine pairings with
  // the guide's "Show another example" control; entry 0 prerenders.
  const groups = $derived(
    CAP_RELATIONS.map((relation) => ({
      relation,
      ...GROUP_COPY[relation],
      paths: CAP_HAND_PATHS.filter((p) => p.relation === relation).map(
        (path) => ({
          column: path.column,
          ...PATH_COPY[path.column]!,
          first: showcase(path.caps[0]!),
          pool: path.caps.map((cap) => ({
            word: cap.word,
            loopLabel: "",
            proseHtml: pairingLabel(cap),
            items: capStrip(cap),
          })),
        })
      ),
    }))
  );

  // Centred blocks start each sentence on its own line.
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);
  const lede = $derived(
    sentences(t("guide_eightstep_lede", { name: "Gage DeMello" }))
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
          {#each lede as sentence, i (i)}<span class="sentence">{sentence}</span
            >{/each}
        </p>
      </header>

      <SequenceShowcase
        sequence={opening.sequence}
        items={opening.items}
        trail={PATH_TRAIL}
        render={RENDER}
        loop
        {picTheme}
      >
        {#snippet text()}
          <h2>{t("guide_eightstep_hands_title")}</h2>
          <p>{t("guide_eightstep_hands_body")}</p>
        {/snippet}
      </SequenceShowcase>

      <section class="spins" aria-labelledby="spins-heading">
        <h2 id="spins-heading">{t("guide_eightstep_spins_title")}</h2>
        <p>
          {#each sentences(t("guide_eightstep_spins_body")) as sentence, i (i)}<span
              class="sentence">{sentence}</span
            >{/each}
        </p>
        <div class="prop-choice">
          <span class="prop-label">{t("guide_eightstep_prop")}</span>
          <PropChoiceRow
            value={propType}
            options={PROP_CHOICES}
            label={t("guide_eightstep_prop")}
            onchange={(pt) => (propType = pt)}
          />
        </div>
        <LinkChip href={localHref("/guide/prospin-and-inspin")}
          >{t("guide_eightstep_link_prospin")}</LinkChip
        >
      </section>

      {#each groups as group (group.relation)}
        <section
          class="group"
          aria-labelledby={`group-${group.relation}-heading`}
        >
          <div class="group-intro">
            <h2 id={`group-${group.relation}-heading`}>{t(group.title)}</h2>
            <p>
              {#each sentences(t(group.body)) as sentence, i (i)}<span
                  class="sentence">{sentence}</span
                >{/each}
            </p>
          </div>
          {#each group.paths as path (path.column)}
            <SequenceShowcase
              sequence={path.first.sequence}
              items={path.first.items}
              pool={path.pool}
              trail={PATH_TRAIL}
              render={PROP_RENDER}
              canvasLetter={false}
              loop
              {picTheme}
            >
              {#snippet text()}
                <h3>{t(path.title)}</h3>
                <p>{t(path.body)}</p>
              {/snippet}
            </SequenceShowcase>
          {/each}
        </section>
      {/each}

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
  .eight-step {
    width: 100%;
    min-width: 0;
    max-width: 1180px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 6vw, 72px);
    /* SequenceShowcase colours its example cycler with the Level 1 ink
       tokens; map them to this page's theme, as /guide/zans-diamond does. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
  }
  /* The cycler's label line and button use the page's type, not the Level 1
     book serif. */
  .eight-step :global(.example-prose > p),
  .eight-step :global(.cycle-btn),
  .eight-step :global(.cycle-count) {
    font-family: inherit;
  }
  .eight-step :global(.example-prose > p) {
    font-size: 1rem;
    font-weight: 600;
  }
  .eight-step h1 {
    margin: 0;
    padding: 0;
    grid-column: auto;
  }
  .eight-step h2,
  .eight-step h3 {
    margin: 0;
  }
  .eight-step p {
    max-width: 64ch;
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0;
  }
  /* The page header, section intros and the credit are centred section
     breaks; the text beside each player reads left. */
  .intro,
  .spins,
  .group-intro,
  .credit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    text-align: center;
  }
  /* A sentence too long for the column wraps into even lines, not one
     stranded word. */
  .sentence {
    display: block;
    text-wrap: balance;
  }
  .eight-step .lede {
    font-size: 1.125rem;
    color: var(--theme-text);
  }

  .spins {
    gap: var(--spacing-md, 12px);
  }
  .prop-choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs, 6px);
  }
  .prop-label {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    color: var(--theme-text-muted);
  }

  .group {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: clamp(32px, 5vw, 56px);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
  }
</style>
