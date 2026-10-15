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
  import CodexPropPicker from "./_components/CodexPropPicker.svelte";
  import { CODEX_DEFAULT_PROP, parseCodexProp } from "./_data/codex-props";

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
    <div class="intro">
      <TopicHeader
        title={tDynamic("guide_codex_heading")}
        lede={tDynamic("guide_codex_intro")}
      />
      <CodexPropPicker value={propType} onChange={chooseProp} />
      <PanelButton variant="secondary" href={localHref("/guide/codex/print")}>
        {tDynamic("guide_codex_print")}
      </PanelButton>
    </div>

    <div class="board-host">
      <LetterCodex {initialLetter} board="atlas" {propType} />
    </div>
  </article>
</GuideShell>

<style>
  .codex-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    /* The board sizes its cells so all five rows fit under the page chrome.
       This page's chrome is the site header, the padding above and the
       centred intro with its print button underneath; the Atlas default
       (28.5rem) also counts the glossary's own header row. */
    --codex-atlas-chrome: 25rem;
    /* TopicHeader speaks in the guide's ink tokens. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-dim);
  }

  /* The Guide's official header (TopicHeader), the print button under it. */
  .intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md, 16px);
    margin-bottom: clamp(20px, 2.5vw, 40px);
    text-align: center;
  }

  /* Past 3000px the board widens to min(88vw, 3400px) (BoardAtlas); the
     page takes the same column. */
  @media (min-width: 3000px) {
    .codex-guide {
      max-width: min(88vw, 3400px);
      padding-inline: 0;
    }
  }

  /* A desktop screen holds the whole Codex without a scroll. The board is
     wider than the screen is tall (twelve cells by five rows), so the free
     space is beside it, not above: the header, prop picker and print button
     take a column on the left and the board gets the full height to the
     right, sized to that box (BoardAtlas, `codex-atlas-fit`). Below this
     size the page reads top to bottom and the board scrolls as before. The
     height floor keeps cells at about 56px or more; a shorter screen scrolls. */
  @media (min-width: 80rem) and (min-height: 760px) {
    .codex-guide {
      display: grid;
      grid-template-columns: clamp(17rem, 19vw, 26rem) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      column-gap: clamp(1.5rem, 2.5vw, 4.5rem);
      box-sizing: border-box;
      max-width: none;
      height: calc(100dvh - var(--marketing-header-h, 64px));
      padding: clamp(16px, 2.5vh, 48px) clamp(20px, 2.5vw, 64px);
    }
    .intro {
      justify-content: center;
      margin: 0;
      min-height: 0;
    }
    .board-host {
      container: codex-atlas-fit / size;
      display: grid;
      align-content: center;
      min-width: 0;
      min-height: 0;
    }
  }
</style>
