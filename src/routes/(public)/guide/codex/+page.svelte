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
        label={tDynamic("guide_codex_prop")}
        onchange={chooseProp}
      />
    </div>

    <LetterCodex {initialLetter} board="atlas" {propType} />

    <div class="print">
      <PanelButton variant="secondary" href={localHref("/guide/codex/print")}>
        {tDynamic("guide_codex_print")}
      </PanelButton>
    </div>
  </article>
</GuideShell>

<style>
  /* One column, top to bottom like every guide page: the Guide's header, the
     prop tiles, the full-width board, and the print link once the board has
     been read. */
  .codex-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    /* The board's height term: the header, padding and the prop row above
       it. On a laptop the board is width-bound and scrolls a little; this
       keeps a wide, short screen from drawing cells taller than it holds. */
    --codex-atlas-chrome: 26rem;
    /* TopicHeader speaks in the guide's ink tokens. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-dim);
  }

  .props {
    margin-block: clamp(16px, 2vw, 28px) clamp(20px, 2.5vw, 40px);
    --prop-choice-justify: center;
    --prop-choice-label-align: center;
  }

  .print {
    display: flex;
    justify-content: center;
    margin-top: clamp(24px, 3vw, 48px);
  }

  /* Past 3000px the board widens to min(88vw, 3400px) (BoardAtlas); the
     page takes the same column. */
  @media (min-width: 3000px) {
    .codex-guide {
      max-width: min(88vw, 3400px);
      padding-inline: 0;
    }
  }
</style>
