<script lang="ts">
  /**
   * The Codex as a guide page: the Atlas letter board on the guide's own
   * canvas, drawn in whichever prop the reader picks. Every letter opens the same explorer the Atlas uses
   * (variations, Diamond/Box, turns, Composer draft), and the explorer state
   * rides in this page's URL, so a letter link from here is shareable too.
   *
   * The two printed sheets live at /guide/codex/print; this page links there
   * instead of drawing paper on screen.
   */
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideFontPreload from "../_components/GuideFontPreload.svelte";
  import TopicHeader from "../level-1/_topics/TopicHeader.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import LetterCodex from "../../atlas/_components/LetterCodex.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import {
    CODEX_DEFAULT_PROP,
    codexPropSections,
    parseCodexProp,
  } from "./_data/codex-props";

  // A letter link (?letter=K) opens on that letter; LetterCodex reads the rest
  // of the explorer state from the URL itself.
  const initialLetter = browser
    ? (new URLSearchParams(window.location.search).get("letter") ?? "A")
    : "A";

  // The prop is this page's own choice (?prop=), never the reader's saved
  // prop. Read after mount so the prerendered markup and the first client
  // render agree.
  let propType = $state<PropType>(CODEX_DEFAULT_PROP);

  function readProp(): void {
    propType =
      parseCodexProp(new URLSearchParams(window.location.search).get("prop")) ??
      CODEX_DEFAULT_PROP;
  }

  onMount(() => {
    readProp();
    window.addEventListener("popstate", readProp);
    return () => window.removeEventListener("popstate", readProp);
  });

  // A short desktop screen (the fit block below, under 1000px tall) gives
  // the tiles' names to their hover tooltips, so the board keeps that height.
  const shortScreen = new MediaQuery(
    "(min-width: 80rem) and (min-height: 700px) and (max-height: 999.98px)",
    false
  );

  function chooseProp(next: PropType): void {
    if (next === propType) return;
    propType = next;
    mutateCurrentUrl((url) => {
      if (next === CODEX_DEFAULT_PROP) url.searchParams.delete("prop");
      else url.searchParams.set("prop", next);
    });
  }
</script>

<GuideSeo
  title={tDynamic("guide_codex_seo_title")}
  description={tDynamic("guide_codex_seo_description")}
  path="/guide/codex"
  breadcrumbs={[
    { name: tDynamic("guide_paths_home"), path: "/" },
    { name: tDynamic("guide_paths_part_of"), path: "/guide" },
    { name: tDynamic("guide_codex_title"), path: "/guide/codex" },
  ]}
/>

<GuideFontPreload />

<GuideShell>
  <article class="codex-guide guide-page-route">
    <TopicHeader
      title={tDynamic("guide_codex_heading")}
      lede={tDynamic("guide_codex_intro")}
    />

    <!-- The app's inline prop choice, the same tiles the other guide pages
         use. Each tile names its prop, so the choice needs no caption. -->
    <div class="props">
      <PropChoiceRow
        value={propType}
        sections={codexPropSections()}
        iconOnly={shortScreen.current}
        label={tDynamic("guide_codex_prop")}
        onchange={chooseProp}
      />
    </div>

    <div class="board-host">
      <LetterCodex {initialLetter} board="atlas" {propType} />
    </div>
  </article>

  <div class="print">
    <PanelButton variant="secondary" href={localHref("/guide/codex/print")}>
      {tDynamic("guide_codex_print")}
    </PanelButton>
  </div>
</GuideShell>

<style>
  /* One column, top to bottom like every guide page: the Guide's header, the
     prop tiles, the full-width board, and the print link once the board has
     been read. On a desktop screen the first three fill the screen exactly
     (see the fit block below). */
  .codex-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    /* Below desktop the board scrolls; this height term only keeps a wide,
       short screen from drawing cells taller than it holds. */
    --codex-atlas-chrome: 26rem;
    /* TopicHeader speaks in the guide's ink tokens. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-dim);
  }

  .props {
    margin-block: clamp(16px, 2vw, 28px) clamp(20px, 2.5vw, 40px);
    --prop-choice-justify: center;
    --prop-choice-label-align: center;
    /* Sixteen families on one line at laptop width: both groups side by
       side, wrapping to two lines only on narrower screens. */
    --prop-tile-width: 4.25rem;
    --prop-tile-gap: 6px;
    --prop-img-size: 1.6rem;
  }

  .print {
    display: flex;
    justify-content: center;
    padding: clamp(16px, 2vw, 32px) 0 clamp(24px, 3vw, 48px);
  }

  /* A desktop screen holds the whole Codex without a scroll, whatever its
     size. The page is exactly the screen under the site header: the Guide's
     header and the prop tiles take what they need, and the board gets the
     rest as a sized box (`codex-atlas-fit`, BoardAtlas), so its cells come
     from the height actually left rather than a guess at the chrome. The
     header and the tiles' margins scale with the screen height, so a short
     screen gives the board more of itself. Below this size the page reads
     top to bottom and scrolls; the height floor keeps cells near 60px. */
  @media (min-width: 80rem) and (min-height: 700px) {
    .codex-guide {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      box-sizing: border-box;
      height: calc(100dvh - var(--marketing-header-h, 64px));
      padding-block: clamp(12px, 2.2vh, 48px) clamp(12px, 1.6vh, 32px);
    }
    article.codex-guide :global(.topic-head) {
      gap: clamp(0.2rem, 0.7vh, 0.75rem);
      max-width: none;
    }
    article.codex-guide :global(.topic-head h1) {
      font-size: clamp(2rem, 4.6vh, 6rem);
    }
    article.codex-guide :global(.topic-head .lede) {
      font-size: clamp(1rem, 1.8vh, 1.8rem);
      line-height: 1.3;
    }
    /* All sixteen tiles on one line: the tile width shares the column, so
       the two groups never wrap onto a second line of tiles. */
    .props {
      container-type: inline-size;
      margin-block: clamp(6px, 1.2vh, 28px);
      --prop-tile-width: clamp(
        3.6rem,
        calc((100cqi - 15 * var(--prop-tile-gap) - 24px) / 16),
        4.75rem
      );
    }
    .board-host {
      container: codex-atlas-fit / size;
      min-height: 0;
    }
  }

  /* From 2000px wide, the 1480px column made the board width-bound and left
     a band of empty screen under it at 2560x1440. A wider column lets the
     screen's height decide the cells instead. */
  @media (min-width: 2000px) {
    .codex-guide {
      max-width: 2400px;
    }
  }

  /* Past 3000px the board widens to min(88vw, 3400px) (BoardAtlas); the
     page takes the same column. */
  @media (min-width: 3000px) {
    .codex-guide {
      max-width: min(88vw, 3400px);
      padding-inline: 0;
    }
  }

  /* On a 4K screen the cells run 250px or more; laptop-sized tiles beside
     them read as a footnote. The tiles grow; the board fits what is left. */
  @media (min-width: 2400px) and (min-height: 1400px) {
    .props {
      --prop-tile-width: 6.5rem;
      --prop-tile-gap: 10px;
      --prop-img-size: 2.6rem;
      --font-size-compact: 15px;
    }
  }
</style>
