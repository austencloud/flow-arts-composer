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
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { GUIDE_CANVAS } from "#lib/shared/landing/domain/page-surface.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    CODEX_DEFAULT_PROP,
    parseCodexProp,
  } from "./_data/codex-props";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    CODEX_DEFAULT_ORIENTATIONS,
    formatCodexOrientations,
    parseCodexOrientations,
    type CodexStartOrientations,
  } from "./_data/codex-orientation";
  import { codexLayoutMode, fullBoardCell } from "./_data/codex-fit";
  import {
    codexScreen,
    codexScreenDepth,
    codexScreenParent,
    writeCodexScreen,
    type CodexScreen,
  } from "./_data/codex-screen";
  import {
    parseLetterExplorerRoute,
    writeLetterExplorerEdits,
    writeLetterExplorerRoute,
  } from "../atlas/_components/codex-boards/letter-explorer-url";
  import { CODEX_BY_LABEL } from "../atlas/_components/codex-boards/codex-letters";
  import type { CodexExplorerState } from "../atlas/_components/codex-boards/codex-explorer-state.svelte";

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

  // The page decides from the window alone whether the whole board fits
  // with every cell at 80px or more (codex-fit.ts), and re-decides on every
  // resize. Prerender and the first client frame draw the full board; the
  // mode follows once the window is measured.
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let siteHeaderHeight = $state(64);
  let remPx = $state(16);
  const fit = $derived({ viewportWidth, viewportHeight, siteHeaderHeight, remPx });
  const mode = $derived(
    viewportWidth > 0 ? codexLayoutMode(fit) : "full-board"
  );
  const cell = $derived(fullBoardCell(fit));

  function readMetrics(): void {
    const root = getComputedStyle(document.documentElement);
    const header = parseFloat(root.getPropertyValue("--marketing-header-h"));
    if (Number.isFinite(header) && header > 0) siteHeaderHeight = header;
    const rem = parseFloat(root.fontSize);
    if (Number.isFinite(rem) && rem > 0) remPx = rem;
  }

  // ── Screens (drill-down mode) ──────────────────────────────────────────
  // Which screen shows is URL state (codex-screen.ts), so a link opens on
  // the right screen and the phone's Back goes up one level.
  const HOME: CodexScreen = { kind: "home", type: null, letter: null };
  let screen = $state<CodexScreen>(HOME);
  let codex: CodexExplorerState | null = null;
  /** Entries this page pushed, so Back can pop them instead of adding more. */
  let pushed = 0;
  const allowedLetters = new Set(CODEX_BY_LABEL.keys());

  function readScreen(): void {
    const params = new URLSearchParams(window.location.search);
    const route = parseLetterExplorerRoute(params, allowedLetters);
    screen = codexScreen(
      params,
      mode,
      route?.letter ?? null,
      (label) => CODEX_BY_LABEL.get(label)?.typeNumber ?? null
    );
  }

  /** Opens a screen. `push: false` when codex.select has just pushed the
   *  entry this screen rides on (a cell opening its letter). */
  function go(next: CodexScreen, options: { push: boolean } = { push: true }): void {
    const leaving = screen.letter !== null && next.letter === null;
    mutateCurrentUrl(
      (url) => {
        writeCodexScreen(url, next);
        if (!next.letter) {
          // Leaving a letter clears its params; the turns stay on the board.
          writeLetterExplorerRoute(url, null);
          if (codex) writeLetterExplorerEdits(url, codex.edits());
        }
      },
      { mode: options.push ? "push" : "replace" }
    );
    pushed += 1;
    if (leaving) codex?.leaveLetter();
    screen = next;
  }

  function back(): void {
    const parent = codexScreenParent(screen);
    if (!parent) return;
    if (pushed > 0) {
      // popstate reads the screen and the explorer back from the entry,
      // and counts the pop.
      history.back();
      return;
    }
    go(parent);
    pushed -= 1;
  }

  // On a small window the reader's choices (prop, start) outlive Back and
  // Forward, as the explorer's settings do (carrySettings); the full board
  // reads them from the entry, as it always has.
  function onPopState(): void {
    const depth = codexScreenDepth(screen);
    if (mode === "drill-down") writeChoices();
    else readChoices();
    readScreen();
    const next = codexScreenDepth(screen);
    if (next < depth) pushed = Math.max(0, pushed - 1);
    else if (next > depth) pushed += 1;
  }

  function writeChoices(): void {
    const ori = formatCodexOrientations(startOrientations);
    mutateCurrentUrl((url) => {
      if (propType === CODEX_DEFAULT_PROP) url.searchParams.delete("prop");
      else url.searchParams.set("prop", propType);
      if (ori === null) url.searchParams.delete("ori");
      else url.searchParams.set("ori", ori);
    });
  }

  // A resize across the fit line re-reads the screen for the new mode, and
  // tells the explorer whether Back carries its settings.
  $effect(() => {
    const current = mode;
    if (codex) codex.carrySettings = current === "drill-down";
    if (viewportWidth > 0) readScreen();
  });

  onMount(() => {
    readMetrics();
    readChoices();
    readScreen();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<main
  class="codex-route"
  class:full-board={mode === "full-board"}
  class:drill-down={mode === "drill-down"}
  style:--codex-canvas={GUIDE_CANVAS}
>
  <article class="codex-guide">
    {#if mode === "full-board"}
      <TopicHeader
        title={tDynamic("guide_codex_heading")}
        lede={tDynamic("guide_codex_intro")}
      />
    {/if}

    <div class="board-host">
      <LetterCodex
        {initialLetter}
        {propType}
        {startOrientations}
        boardControls
        {mode}
        {cell}
        onChooseProp={chooseProp}
        onChooseStart={chooseStart}
        {screen}
        onGo={go}
        onBack={back}
        onState={(state) => {
          codex = state;
        }}
      />
    </div>
  </article>
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

  /* One column: the Guide's header over the full board and its rail, which
     fill the screen exactly (see the fit block below), or, on a window too
     small for the board, the drill-down screens edge to edge. */
  .codex-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    /* TopicHeader speaks in the guide's ink tokens. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-dim);
  }

  /* The full board (codex-fit.ts decides it): the page is exactly the
     screen under the site header and never scrolls. The Guide's header
     takes one capped row, so it and the padding stay inside
     FULL_BOARD_CHROME_REM, and the board with its rail gets the rest at the
     cell size the page computed. The column widths match columnWidth(). */
  .codex-route.full-board {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }

  /* The Codex is a full-screen instrument in both modes, like the timing
     lesson: the site footer under it would make the page scroll, so it
     keeps none. Print and the other links live in the page itself. */
  :global(.mkt-layer:has(> .mkt-stage main.codex-route) > .site-footer) {
    display: none;
  }
  .full-board .codex-guide {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.75rem;
    box-sizing: border-box;
    height: calc(100dvh - var(--marketing-header-h, 64px));
    max-width: 1600px;
    padding-block: 0.75rem;
    overflow: hidden;
  }
  .full-board article.codex-guide :global(.topic-head) {
    gap: 0.25rem;
    max-width: none;
  }
  .full-board article.codex-guide :global(.topic-head h1) {
    font-size: clamp(1.75rem, 3.5vh, 3rem);
  }
  .full-board article.codex-guide :global(.topic-head .lede) {
    max-width: 100%;
    overflow: hidden;
    font-size: clamp(1rem, 1.6vh, 1.4rem);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .full-board .board-host {
    min-height: 0;
  }

  /* Drill-down (codex-fit.ts): one screen at a time fills the window under
     the site header, edge to edge, and the page never scrolls. */
  .codex-route.drill-down {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }
  .drill-down .codex-guide {
    max-width: none;
    height: calc(100dvh - var(--marketing-header-h, 64px));
    padding: 0;
    overflow: hidden;
  }
  .drill-down .board-host {
    height: 100%;
  }

  /* From 2000px wide, the 1600px column made the board width-bound and left
     a band of empty screen under it at 2560x1440. A wider column lets the
     screen's height decide the cells instead. */
  @media (min-width: 2000px) {
    .full-board .codex-guide {
      max-width: 2400px;
    }
  }

  /* Past 3000px the board widens to min(88vw, 3400px); the page takes the
     same column. */
  @media (min-width: 3000px) {
    .full-board .codex-guide {
      max-width: min(88vw, 3400px);
      padding-inline: 0;
    }
  }
</style>
