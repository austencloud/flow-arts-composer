<script lang="ts">
  /**
   * /guide/prospin-and-inspin answers the community word. Inspin is what most
   * spinners call the Kinetic Alphabet's prospin, so this page says they are
   * the same motion, shows prospin beside antispin, and gives the two reasons
   * the Kinetic Alphabet says prospin.
   *
   * The two motions are Level 1's own Staff Motions demonstrations, read from
   * SHIFT_DEMOS, and the definitions quote that chapter, so this page cannot
   * describe prospin differently from the lesson that teaches it.
   */
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import { SHIFT_DEMOS } from "../level-1/_data/content/staff-motions.content";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  const PATH = "/guide/prospin-and-inspin";

  const shifts = [
    {
      style: "pro",
      demo: SHIFT_DEMOS.pro,
      word: "Prospin",
      name: "guide_prospin_pro_name",
      definition: "guide_prospin_pro_definition",
    },
    {
      style: "anti",
      demo: SHIFT_DEMOS.anti,
      word: "Antispin",
      name: "guide_prospin_anti_name",
      definition: "guide_prospin_anti_definition",
    },
  ].map((shift) => ({
    ...shift,
    sequence: stripToSequence(
      shift.demo.sequenceItems as unknown as StepData[],
      { word: shift.word, name: shift.word }
    ),
  }));
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
  <article class="prospin guide-page-route">
    <header class="page-head">
      <h1>{tDynamic("guide_prospin_title")}</h1>
      <p class="lede">{tDynamic("guide_prospin_intro")}</p>
    </header>

    <div class="shifts">
      {#each shifts as shift (shift.style)}
        <SequenceShowcase
          sequence={shift.sequence}
          items={shift.demo.items}
          render={shift.demo.render}
          picTheme="dark"
        >
          {#snippet text()}
            <h2 class="shift-name">{tDynamic(shift.name)}</h2>
            <p class="shift-definition">{tDynamic(shift.definition)}</p>
          {/snippet}
        </SequenceShowcase>
      {/each}
    </div>

    <div class="closing">
      <section class="why" aria-labelledby="why-heading">
        <h2 id="why-heading">{tDynamic("guide_prospin_why_heading")}</h2>
        <p>{tDynamic("guide_prospin_why_pair")}</p>
        <p>{tDynamic("guide_prospin_why_orientation")}</p>
      </section>

      <nav class="more" aria-labelledby="more-heading">
        <h2 id="more-heading">{tDynamic("guide_prospin_more_heading")}</h2>
        <ul>
          <li>
            <a href="/guide/level-1/staff-motions"
              >{tDynamic("guide_prospin_more_staff")}</a
            >
          </li>
          <li>
            <a href="/guide/ratios">{tDynamic("guide_prospin_more_ratios")}</a>
          </li>
        </ul>
      </nav>
    </div>
  </article>
</GuideShell>

<style>
  /* The page spans the Guide's full content track on a desktop, the same band
     the Ratios page uses, and recomposes by its own width: prose keeps one
     reading measure while the two demonstrations share the full band. On a
     phone the Guide keeps the route in its prose column and everything stacks
     in reading order. SequenceShowcase reads --ink and --ink-dim from its
     host, the same contract the Level 2 pages give it on this dark canvas. */
  .prospin {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    --glyph-invert: 1;
    --copy: 38rem;
    --accent: var(--theme-accent, oklch(0.74 0.11 265));
    --rule: var(--theme-stroke, oklch(0.4 0.04 270 / 0.22));
    --gutter: clamp(1.5rem, 3vw, 3rem);
    --pad: clamp(1rem, 3vw, 3rem);
    container: prospin / inline-size;
    box-sizing: border-box;
    inline-size: 100%;
    display: grid;
    /* One column that never grows past the page, so a wide child wraps
       instead of widening the whole article. */
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(2rem, 4vw, 3.5rem);
    padding: clamp(1.5rem, 3vw, 3rem) var(--pad) clamp(3rem, 6vw, 5rem);
  }

  /* Below the tablet breakpoint the Guide keeps this route in its prose
     column, which already carries its own gutter. */
  @media (max-width: 768px) {
    .prospin {
      padding-inline: 0;
    }
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

  .prospin h2 {
    margin-top: 0;
  }

  .prospin p,
  .prospin ul {
    max-inline-size: var(--copy);
  }

  .lede {
    margin-bottom: 0;
    color: oklch(0.86 0.01 270);
  }

  .why p:last-child {
    margin-bottom: 0;
  }

  .closing {
    padding-top: clamp(1.75rem, 3vw, 2.75rem);
    border-top: 1px solid var(--rule);
  }

  /* Stacked, the reading links sit under the why as their own short section. */
  .more {
    padding-top: clamp(1.5rem, 3vw, 2.5rem);
    margin-top: clamp(2rem, 4vw, 3rem);
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

  .more ul {
    margin: 0;
    padding-left: 1.1rem;
  }

  .more li + li {
    margin-top: 0.35rem;
  }

  .shifts {
    display: grid;
    gap: clamp(2rem, 4vw, 3rem) calc(var(--gutter) * 2);
  }

  .shift-name {
    margin: 0 0 0.35rem;
  }

  .shift-definition {
    margin: 0;
    color: var(--ink);
  }

  /* Wide: the two demonstrations sit side by side for comparison, and the
     why keeps its measure with the reading links beside it. */
  @container prospin (min-width: 64rem) {
    .shifts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .closing {
      display: grid;
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      column-gap: calc(var(--gutter) * 2);
      align-items: start;
    }

    .more {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
  }
</style>
