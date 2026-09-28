<script lang="ts">
  /**
   * /guide/prospin-and-inspin answers the community word. Inspin is what most
   * spinners call the Kinetic Alphabet's prospin, so this page shows the two
   * directions, who uses which name, where each first shows up in writing,
   * and why the Kinetic Alphabet keeps prospin.
   *
   * The two motions are Level 1's own Staff Motions demonstrations, read from
   * SHIFT_DEMOS, and the definitions quote that chapter, so this page cannot
   * describe prospin differently from the lesson that teaches it. Every dated
   * entry links the page it was read from.
   */
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import { SHIFT_DEMOS } from "../level-1/_data/content/staff-motions.content";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  const PATH = "/guide/prospin-and-inspin";
  const STAFF_MOTIONS_PATH = "/guide/level-1/staff-motions";

  const shifts = [
    {
      style: "pro",
      demo: SHIFT_DEMOS.pro,
      word: "Prospin",
      name: "guide_prospin_pro_name",
      definition: "guide_prospin_pro_definition",
      note: "guide_prospin_pro_note",
    },
    {
      style: "anti",
      demo: SHIFT_DEMOS.anti,
      word: "Antispin",
      name: "guide_prospin_anti_name",
      definition: "guide_prospin_anti_definition",
      note: "guide_prospin_anti_note",
    },
  ].map((shift) => ({
    ...shift,
    sequence: stripToSequence(
      shift.demo.sequenceItems as unknown as StepData[],
      { word: shift.word, name: shift.word }
    ),
  }));

  /** Each name's users link to their record in the history archive. */
  const usage = [
    {
      word: "guide_prospin_who_inspin",
      users: [
        { label: "guide_prospin_who_vtg", href: "/history#archive-record-vtg" },
        { label: "guide_prospin_who_drex", href: "/history#archive-record-drexfactor" },
        { label: "guide_prospin_who_playpoi", href: "/history#archive-record-playpoi" },
      ],
    },
    {
      word: "guide_prospin_who_prospin",
      users: [
        { label: "guide_prospin_who_home_of_poi", href: "/history#archive-record-home-of-poi" },
        { label: "guide_prospin_who_lorq", href: "/history#archive-record-lorq" },
        { label: "guide_prospin_who_tka", href: STAFF_MOTIONS_PATH },
      ],
    },
  ];

  /**
   * Earliest written uses found, oldest first. A 2009 Home of Poi forum
   * thread reportedly debated both names, but it stays off this list until
   * someone has read the thread itself rather than a search snippet.
   */
  const timeline = [
    {
      id: "2009",
      url: "https://www.homeofpoi.com/en/lessons/teach/POI/Poi-terminology/Poi-terminology",
    },
    {
      id: "2010",
      url: "https://noelyee.com/instruction/vulcan-tech-gospel/",
    },
    {
      id: "2010_drex",
      url: "https://drexfactor.com/weirdscience/2010/11/07/poi_heresies_why_3_petal_antispin_flowers_are_not_triquetras",
    },
    {
      id: "2012",
      url: "https://drexfactor.com/category/tags/vulcan_tech_gospel",
    },
    {
      id: "2013",
      url: "https://sirlorq.wordpress.com/tag/driving-style/",
    },
    {
      id: "2016",
      url: "https://playpoi.com/learn/linking-4-buzzsaw-flower-combinations-together-poi-fu/",
    },
  ];
</script>

<GuideSeo
  title={tDynamic("guide_prospin_seo_title")}
  description={tDynamic("guide_prospin_seo_description")}
  path={PATH}
  partOf={{ name: tDynamic("guide_paths_part_of"), path: "/guide" }}
  breadcrumbs={[
    { name: tDynamic("guide_paths_home"), path: "/" },
    { name: tDynamic("guide_paths_part_of"), path: "/guide" },
    { name: tDynamic("guide_prospin_title"), path: PATH },
  ]}
  datePublished="2026-09-28"
/>

<GuideShell>
  <article class="prospin">
    <header class="page-head">
      <h1>{tDynamic("guide_prospin_title")}</h1>
      <p class="lede">{tDynamic("guide_prospin_intro")}</p>
      <p>{tDynamic("guide_prospin_reader_note")}</p>
    </header>

    <section aria-labelledby="motion-heading">
      <h2 id="motion-heading">{tDynamic("guide_prospin_motion_heading")}</h2>
      <p>{tDynamic("guide_prospin_motion_intro")}</p>

      <div class="shifts">
        {#each shifts as shift (shift.style)}
          <SequenceShowcase
            sequence={shift.sequence}
            items={shift.demo.items}
            render={shift.demo.render}
            picTheme="dark"
            variant="compact"
          >
            {#snippet text()}
              <h3 class="shift-name">{tDynamic(shift.name)}</h3>
              <p class="shift-definition">{tDynamic(shift.definition)}</p>
              <p class="shift-note">{tDynamic(shift.note)}</p>
            {/snippet}
          </SequenceShowcase>
        {/each}
      </div>

      <p class="source-line">
        {tDynamic("guide_prospin_motion_source_before")}<a href={STAFF_MOTIONS_PATH}
          >{tDynamic("guide_prospin_more_staff")}</a
        >{tDynamic("guide_prospin_motion_source_after")}
      </p>
    </section>

    <section aria-labelledby="who-heading">
      <h2 id="who-heading">{tDynamic("guide_prospin_who_heading")}</h2>
      <div class="usage">
        {#each usage as column (column.word)}
          <div class="usage-column">
            <h3>{tDynamic(column.word)}</h3>
            <ul>
              {#each column.users as user (user.label)}
                <li><a href={user.href}>{tDynamic(user.label)}</a></li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <section aria-labelledby="history-heading">
      <h2 id="history-heading">{tDynamic("guide_prospin_history_heading")}</h2>
      <p>{tDynamic("guide_prospin_history_intro")}</p>
      <ol class="timeline">
        {#each timeline as entry (entry.id)}
          <li>
            <span class="when">{tDynamic(`guide_prospin_history_${entry.id}_date`)}</span>
            <span class="what">
              {tDynamic(`guide_prospin_history_${entry.id}`)}
              <a class="external" href={entry.url} target="_blank" rel="noopener noreferrer"
                >{tDynamic(`guide_prospin_history_${entry.id}_source`)}<span class="sr-only">
                  {tDynamic("guide_prospin_new_tab")}</span
                ></a
              >
            </span>
          </li>
        {/each}
      </ol>
    </section>

    <section aria-labelledby="why-heading">
      <h2 id="why-heading">{tDynamic("guide_prospin_why_heading")}</h2>
      <p>{tDynamic("guide_prospin_why_pair")}</p>
      <p>{tDynamic("guide_prospin_why_misread")}</p>
      <p>{tDynamic("guide_prospin_why_orientation")}</p>
      <p>{tDynamic("guide_prospin_why_stance")}</p>
    </section>

    <nav class="more" aria-labelledby="more-heading">
      <h2 id="more-heading">{tDynamic("guide_prospin_more_heading")}</h2>
      <ul>
        <li><a href={STAFF_MOTIONS_PATH}>{tDynamic("guide_prospin_more_staff")}</a></li>
        <li><a href="/guide/ratios">{tDynamic("guide_prospin_more_ratios")}</a></li>
        <li><a href="/history">{tDynamic("guide_prospin_more_history")}</a></li>
      </ul>
    </nav>
  </article>
</GuideShell>

<style>
  /* A reading page: one prose measure, with the two demonstrations allowed
     the Guide's full prose column so their canvas and strip keep their size.
     SequenceShowcase reads --ink and --ink-dim from its host, the same
     contract the Level 2 pages give it on this dark canvas. */
  .prospin {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    --glyph-invert: 1;
    --measure: 40rem;
    --accent: var(--theme-accent, oklch(0.74 0.11 265));
    --rule: var(--theme-stroke, oklch(0.4 0.04 270 / 0.22));
    display: grid;
    /* One column that never grows past the page, so a wide child such as the
       two-column usage list wraps instead of widening the whole article. */
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(2.5rem, 5vw, 4rem);
    padding-block: clamp(1.5rem, 3vw, 3rem) clamp(3rem, 6vw, 5rem);
  }

  .prospin h1 {
    margin: 0 0 1rem;
    padding: 0;
    font-size: clamp(2.1rem, 1.6rem + 1.6vw, 3.2rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.05;
    text-align: left;
  }

  .prospin p,
  .prospin ul,
  .prospin ol {
    max-inline-size: var(--measure);
  }

  .lede {
    color: oklch(0.86 0.01 270);
  }

  .page-head p:last-child,
  .source-line {
    margin-bottom: 0;
  }

  .prospin section,
  .more {
    padding-top: clamp(1.5rem, 3vw, 2.5rem);
    border-top: 1px solid var(--rule);
  }

  .prospin a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }

  .prospin a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 3px;
  }

  /* Links that leave the site say so: a small arrow for sighted readers and
     a hidden phrase for screen readers. */
  .prospin a.external::after {
    content: "\2197";
    display: inline-block;
    margin-left: 0.2em;
    font-size: 0.8em;
    text-decoration: none;
  }

  .shifts {
    display: grid;
    gap: 1.25rem;
    margin-block: 1.5rem;
  }

  .shift-name {
    margin: 0 0 0.35rem;
  }

  .shift-definition {
    margin: 0 0 0.5rem;
    color: var(--ink);
  }

  .shift-note {
    margin: 0;
  }

  /* Two short lists side by side once both fit; stacked on a phone. */
  .usage {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
    gap: 0.5rem 2rem;
    max-inline-size: 48rem;
  }

  .usage-column h3 {
    margin-top: 0;
  }

  .usage ul {
    margin: 0;
    padding-left: 1.1rem;
  }

  /* Date beside entry on a wide column, date over entry on a phone. */
  .timeline {
    display: grid;
    gap: 0.9rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .timeline li {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    gap: 0.2rem 1rem;
    margin: 0;
  }

  .when {
    color: oklch(0.86 0.01 270);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  @media (max-width: 480px) {
    .timeline li {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .more ul {
    margin: 0;
    padding-left: 1.1rem;
  }
</style>
