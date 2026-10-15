<script lang="ts">
  /**
   * The Double Staff Codex as a guide page: the Atlas letter board on the
   * guide's own canvas. Every letter opens the same explorer the Atlas uses
   * (variations, Diamond/Box, turns, Composer draft), and the explorer state
   * rides in this page's URL, so a letter link from here is shareable too.
   *
   * The two printed sheets live at /guide/codex/print; this page links there
   * instead of drawing paper on screen.
   */
  import { browser } from "$app/env";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import LetterCodex from "../../atlas/_components/LetterCodex.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  // A letter link (?letter=K) opens on that letter; LetterCodex reads the rest
  // of the explorer state from the URL itself.
  const initialLetter = browser
    ? (new URLSearchParams(window.location.search).get("letter") ?? "A")
    : "A";
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

<GuideShell>
  <article class="codex-guide guide-page-route">
    <header class="intro">
      <div class="intro-text">
        <h1>{tDynamic("guide_codex_heading")}</h1>
        <p>{tDynamic("guide_codex_intro")}</p>
      </div>
      <PanelButton variant="secondary" href={localHref("/guide/codex/print")}>
        {tDynamic("guide_codex_print")}
      </PanelButton>
    </header>

    <LetterCodex {initialLetter} board="atlas" />
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
       This page's chrome is the site header, the padding above and the intro;
       the Atlas default (28.5rem) also counts the glossary's own header row. */
    --codex-atlas-chrome: 22rem;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-md, 16px) var(--spacing-xl, 32px);
    margin-bottom: clamp(20px, 2.5vw, 40px);
  }

  .intro-text {
    min-width: 0;
    flex: 1 1 28rem;
  }

  .intro h1 {
    text-align: left;
    padding: 0 0 var(--spacing-sm, 8px);
  }

  .intro p {
    margin: 0;
    max-width: 60ch;
    font-size: clamp(16px, 1.3vw, 20px);
    line-height: 1.5;
    color: var(--theme-text-muted);
  }
</style>
