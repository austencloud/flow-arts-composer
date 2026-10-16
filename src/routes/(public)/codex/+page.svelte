<script lang="ts">
  /**
   * The Codex: the one canonical letter reference. It stands on its own,
   * outside the guide; the guide's Codex pages point here, and only the
   * printed guide keeps paper sheets. The Atlas letter board is drawn in
   * whichever prop the reader picks. Every letter opens the same explorer the
   * Atlas page uses (variations, Diamond/Box, turns, Composer draft), and the
   * explorer state rides in this page's URL, so a letter link is shareable.
   *
   * The two printed sheets live at /codex/print; this page links there
   * instead of drawing paper on screen.
   */
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import GuideFontPreload from "../guide/_components/GuideFontPreload.svelte";
  import TopicHeader from "../guide/level-1/_topics/TopicHeader.svelte";
  import GuideSeo from "../guide/level-1/_components/GuideSeo.svelte";
  import LetterCodex from "../atlas/_components/LetterCodex.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { GUIDE_CANVAS } from "#lib/shared/landing/domain/page-surface.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import {
    CODEX_DEFAULT_PROP,
    CODEX_PROPS,
    parseCodexProp,
  } from "./_data/codex-props";
  import OrientationCycler from "#lib/features/create/construct/start-placement-picker/components/OrientationCycler.svelte";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    CODEX_DEFAULT_ORIENTATIONS,
    formatCodexOrientations,
    parseCodexOrientations,
    type CodexStartOrientations,
  } from "./_data/codex-orientation";

  // A letter link (?letter=K) opens on that letter; LetterCodex reads the rest
  // of the explorer state from the URL itself.
  const initialLetter = browser
    ? (new URLSearchParams(window.location.search).get("letter") ?? "A")
    : "A";

  // The prop is this page's own choice (?prop=), never the reader's saved
  // prop. Read after mount so the prerendered markup and the first client
  // render agree.
  let propType = $state<PropType>(CODEX_DEFAULT_PROP);
  // Every letter starts with both thumbs in unless the reader picks another
  // start for either hand (?ori=blue,red).
  let startOrientations = $state<CodexStartOrientations>(
    CODEX_DEFAULT_ORIENTATIONS
  );

  function readChoices(): void {
    const params = new URLSearchParams(window.location.search);
    propType = parseCodexProp(params.get("prop")) ?? CODEX_DEFAULT_PROP;
    startOrientations = parseCodexOrientations(params.get("ori"));
  }

  onMount(() => {
    readChoices();
    window.addEventListener("popstate", readChoices);
    return () => window.removeEventListener("popstate", readChoices);
  });

  function chooseProp(next: PropType): void {
    if (next === propType) return;
    propType = next;
    mutateCurrentUrl((url) => {
      if (next === CODEX_DEFAULT_PROP) url.searchParams.delete("prop");
      else url.searchParams.set("prop", next);
    });
  }

  function chooseStart(hand: "left" | "right", next: Orientation): void {
    if (next === startOrientations[hand]) return;
    startOrientations = { ...startOrientations, [hand]: next };
    const value = formatCodexOrientations(startOrientations);
    mutateCurrentUrl((url) => {
      if (value === null) url.searchParams.delete("ori");
      else url.searchParams.set("ori", value);
    });
  }
</script>

<GuideSeo
  title={tDynamic("guide_codex_seo_title")}
  description={tDynamic("guide_codex_seo_description")}
  path="/codex"
  breadcrumbs={[
    { name: tDynamic("guide_paths_home"), path: "/" },
    { name: tDynamic("guide_codex_title"), path: "/codex" },
  ]}
/>

<GuideFontPreload />

<main class="codex-route" style:--codex-canvas={GUIDE_CANVAS}>
  <article class="codex-guide">
    <TopicHeader
      title={tDynamic("guide_codex_heading")}
      lede={tDynamic("guide_codex_intro")}
    />

    <!-- The app's inline prop choice, the same tiles the other guide pages
         use, as pictures alone: each name is the tile's tooltip and its
         accessible name. Beside it, Construct's orientation cyclers set where
         each hand starts; the pictures show where the props end from there. -->
    <div class="controls">
      <div class="props">
        <PropChoiceRow
          value={propType}
          options={CODEX_PROPS}
          iconOnly
          label={tDynamic("guide_codex_prop")}
          onchange={chooseProp}
        />
      </div>
      <div class="start" role="group" aria-labelledby="codex-start-label">
        <span id="codex-start-label" class="start-label"
          >{tDynamic("guide_codex_start")}</span
        >
        <div class="cycler">
          <OrientationCycler
            orientation={startOrientations.left}
            onOrientationChange={(next) => chooseStart("left", next)}
            color="blue"
          />
        </div>
        <div class="cycler">
          <OrientationCycler
            orientation={startOrientations.right}
            onOrientationChange={(next) => chooseStart("right", next)}
            color="red"
          />
        </div>
      </div>
    </div>

    <div class="board-host">
      <LetterCodex
        {initialLetter}
        {propType}
        {startOrientations}
      />
    </div>
  </article>

  <div class="print">
    <PanelButton variant="secondary" href={localHref("/codex/print")}>
      {tDynamic("guide_codex_print")}
    </PanelButton>
  </div>
</main>

<style>
  /* The page sits under the site header on the same dark canvas the guide
     uses, without the guide's contents rail: the Codex is its own place. */
  .codex-route {
    min-height: 100dvh;
    padding-top: var(--marketing-header-h, 64px);
    box-sizing: border-box;
    background: var(--codex-canvas);
    font-family: "Inter", system-ui, sans-serif;
  }

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

  /* The prop tiles and the start cyclers share one centred row, and wrap
     to two on a narrow screen. */
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px clamp(16px, 2vw, 40px);
    margin-block: clamp(16px, 2vw, 28px) clamp(20px, 2.5vw, 40px);
  }

  .props {
    --prop-choice-justify: center;
    --prop-img-size: 2.5rem;
  }

  .start {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .start-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .cycler {
    display: flex;
    width: 9.5rem;
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
    /* The icons scale with the screen's height, like the header. */
    .controls {
      margin-block: clamp(6px, 1.2vh, 28px);
    }
    .props {
      --prop-img-size: clamp(2.25rem, 4.2vh, 4.5rem);
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
</style>
