<script lang="ts">
  import type { PageData } from "./$types";
  import { untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { browser } from "$app/env";
  import { TIMING_DIRECTION_MODES } from "#lib/features/learn/components/interactive/foundations/pictograph-foundation-content.js";
  import Seo from "#lib/shared/components/Seo.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import TurnNotationControls from "#lib/shared/shape-matrix/app/components/TurnNotationControls.svelte";
  import type { MatrixLabelMode } from "#lib/shared/shape-matrix/domain/matrix-turn-band.js";
  import {
    turnValuesForLevel,
    type TurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";
  import TransportControls from "#lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import SequenceShowcasePreview from "#lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import {
    flipDuration,
    opaqueFade,
    reducedMotion,
  } from "#lib/shared/transitions/motion.js";
  import { getTimingDirectionState } from "../_state/timing-direction-state.svelte";
  import TimingDirectionModeCard from "../_components/TimingDirectionModeCard.svelte";
  import {
    getTimingDirectionArticle,
    TIMING_DIRECTION_ARTICLES,
    TIMING_DIRECTION_SOURCE,
  } from "../_data/timing-direction-articles";
  import {
    adjustModeLoops,
    groupByHandPath,
    loadModeLoops,
    modeLoopCount,
    modeLoopsPerGrid,
    transformModeLoops,
    type ModeLoop,
    type ModeLoopTransform,
  } from "../_data/mode-sequences";

  let { data }: { data: PageData } = $props();

  const playback = getTimingDirectionState();
  const displayPropType = $derived(
    playback.propDisplay === "hands" ? PropType.HAND : PropType.STAFF
  );

  const article = $derived(getTimingDirectionArticle(data.mode)!);
  const mode = $derived(
    TIMING_DIRECTION_MODES.find(
      (candidate) =>
        candidate.timing === article.timing &&
        candidate.direction === article.direction
    ) ?? TIMING_DIRECTION_MODES[0]!
  );
  const relatedArticles = $derived(
    TIMING_DIRECTION_ARTICLES.filter(
      (candidate) => candidate.code !== article.code
    )
  );
  const canonical = $derived(
    `https://tkaflowarts.com/timing-and-direction/${article.slug}`
  );
  const loopsPerGrid = $derived(modeLoopsPerGrid(article.code));
  const loopCount = $derived(modeLoopCount(article.code));
  const loopCountWord = $derived(
    (["six", "seven", "eight"] as const)[loopCount - 6] ?? String(loopCount)
  );
  const gridTitles = [
    { gridMode: GridMode.DIAMOND, title: "Diamond" },
    { gridMode: GridMode.BOX, title: "Box" },
  ] as const;
  let loops = $state<ModeLoop[]>([]);
  let originalLoops = $state<ModeLoop[]>([]);
  let selectedLoopId = $state<string | null>(null);
  let loopsLoading = $state(true);
  let loopsError = $state<string | null>(null);
  let loopsRetry = $state(0);
  let loopsRequest = 0;
  let leftTurns = $state(0);
  let rightTurns = $state(0);
  let turnLabelMode = $state<MatrixLabelMode>("turns");
  const availableTurns = turnValuesForLevel(3).filter(
    (turn) => typeof turn === "number"
  );
  let applyTo = $state<"all" | "current">("all");
  let adjustmentRequest = 0;
  let adjusting = $state(false);
  let adjustmentError = $state<string | null>(null);
  let turnLoopClosed = $state(true);
  let editingStep = $state(0);
  let examplePlayer: HTMLElement | undefined = $state();
  const selectedLoop = $derived(
    loops.find((loop) => loop.id === selectedLoopId) ?? loops[0] ?? null
  );
  const selectedWord = $derived(
    selectedLoop ? simplifyRepeatedWord(selectedLoop.word) : article.name
  );
  const currentStripStep = $derived(
    Math.max(
      0,
      Math.min(
        playback.sequence.steps.length - 1,
        Math.floor(playback.step) - 1
      )
    )
  );
  const showingHands = $derived(playback.propDisplay === "hands");
  // Cards group by the grid each sequence actually uses, so a quarter
  // rotation moves them between Diamond and Box. Without props, sequences
  // that trace the same hand path look identical, so each path shows once,
  // keyed by its first sequence so that card stays put while the rest leave.
  const loopGroups = $derived(
    gridTitles.map(({ gridMode, title }) => {
      const gridLoops = loops.filter((loop) => loop.gridMode === gridMode);
      const members = showingHands
        ? groupByHandPath(gridLoops)
        : gridLoops.map((loop) => [loop]);
      return {
        title,
        cards: members.map((group) => ({
          loop: group[0]!,
          members: group,
          words: group.map((loop) => simplifyRepeatedWord(loop.word)),
        })),
      };
    })
  );
  const turnsAreReset = $derived(
    loops.every((loop) =>
      loop.sequence.steps.every(
        (step) =>
          (Number(step.motions.left.turns) || 0) === 0 &&
          (Number(step.motions.right.turns) || 0) === 0
      )
    )
  );

  $effect(() => {
    const code = article.code;
    loopsRetry;
    const request = ++loopsRequest;
    untrack(() => {
      adjustmentRequest += 1;
      adjusting = false;
      adjustmentError = null;
      loopsLoading = true;
      loopsError = null;
      loops = [];
      originalLoops = [];
      selectedLoopId = null;
    });
    void loadModeLoops(code)
      .then((loaded) => {
        if (request !== loopsRequest) return;
        if (loaded.length === 0) {
          loopsError = "No sequences are available for this mode yet.";
          return;
        }
        originalLoops = loaded;
        loops = loaded;
        untrack(() => selectLoop(loaded[0]!));
      })
      .catch((error) => {
        if (request !== loopsRequest) return;
        console.error(`${code} mode sequences failed to load`, error);
        loopsError = "Sequences could not load.";
      })
      .finally(() => {
        if (request === loopsRequest) loopsLoading = false;
      });
    return () => {
      loopsRequest += 1;
      adjustmentRequest += 1;
    };
  });

  function selectLoop(loop: ModeLoop, reveal = false) {
    adjustmentRequest += 1;
    adjusting = false;
    adjustmentError = null;
    selectedLoopId = loop.id;
    editingStep = 0;
    syncTurnControls(loop.sequence, editingStep);
    turnLoopClosed =
      (loop.sequence.metadata as { turnLoopClosed?: boolean } | undefined)
        ?.turnLoopClosed !== false;
    playback.selectExample(loop.sequence, 0);
    if (reveal) revealPlayer();
  }

  /** Bring the player back into view when the chosen card sits below it. */
  function revealPlayer() {
    const node = examplePlayer;
    if (!node) return;
    const headerHeight =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--marketing-header-h"
        )
      ) || 64;
    const rect = node.getBoundingClientRect();
    if (rect.top >= headerHeight && rect.bottom <= window.innerHeight) return;
    node.scrollIntoView({
      block: "start",
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  }

  function retryLoops() {
    loopsRetry += 1;
  }

  async function adjustTurns(nextLeftTurns: number, nextRightTurns: number) {
    if (!selectedLoop) return;
    const previousLeftTurns = leftTurns;
    const previousRightTurns = rightTurns;
    leftTurns = nextLeftTurns;
    rightTurns = nextRightTurns;
    const request = ++adjustmentRequest;
    adjusting = true;
    adjustmentError = null;
    playback.playing = false;
    const sampledPlaybackStep = Math.max(
      0,
      Math.min(playback.sequence.steps.length + 1, playback.step)
    );
    try {
      const adjusted = await adjustModeLoops(
        loops,
        nextLeftTurns,
        nextRightTurns,
        applyTo === "current" ? editingStep : undefined
      );
      if (request !== adjustmentRequest) return;
      loops = adjusted;
      const selected = adjusted.find((loop) => loop.id === selectedLoopId);
      if (!selected) return;
      const sequence = selected.sequence;
      playback.selectExample(sequence, sampledPlaybackStep);
      turnLoopClosed =
        (sequence.metadata as { turnLoopClosed?: boolean } | undefined)
          ?.turnLoopClosed !== false;
    } catch {
      if (request === adjustmentRequest) {
        leftTurns = previousLeftTurns;
        rightTurns = previousRightTurns;
        adjustmentError = "Turn change could not be applied. Try again.";
      }
    } finally {
      if (request === adjustmentRequest) adjusting = false;
    }
  }

  function resetTurns() {
    void adjustTurns(0, 0);
  }

  function resetAllLoops() {
    if (!selectedLoop || originalLoops.length === 0) return;
    adjustmentRequest += 1;
    adjusting = false;
    adjustmentError = null;
    playback.playing = false;
    loops = originalLoops;
    const selected =
      originalLoops.find((loop) => loop.id === selectedLoopId) ??
      originalLoops[0];
    if (!selected) return;
    selectedLoopId = selected.id;
    editingStep = 0;
    syncTurnControls(selected.sequence, editingStep);
    turnLoopClosed = true;
    playback.selectExample(selected.sequence, 0);
  }

  async function transformAllLoops(transform: ModeLoopTransform) {
    if (!selectedLoop || adjusting) return;
    const request = ++adjustmentRequest;
    const sampledPlaybackStep = Math.max(
      0,
      Math.min(playback.sequence.steps.length + 1, playback.step)
    );
    adjusting = true;
    adjustmentError = null;
    playback.playing = false;
    try {
      const transformed = await transformModeLoops(loops, transform);
      if (request !== adjustmentRequest) return;
      loops = transformed;
      const selected = transformed.find((loop) => loop.id === selectedLoopId);
      if (!selected) return;
      playback.selectExample(selected.sequence, sampledPlaybackStep);
      syncTurnControls(selected.sequence, editingStep);
      turnLoopClosed =
        (selected.sequence.metadata as { turnLoopClosed?: boolean } | undefined)
          ?.turnLoopClosed !== false;
    } catch {
      if (request === adjustmentRequest) {
        adjustmentError = "Sequence action could not be applied. Try again.";
      }
    } finally {
      if (request === adjustmentRequest) adjusting = false;
    }
  }

  function syncTurnControls(sequence: ModeLoop["sequence"], index: number) {
    const step = sequence.steps[index];
    leftTurns = Number(step?.motions.left.turns) || 0;
    rightTurns = Number(step?.motions.right.turns) || 0;
  }

  function selectCount(index: number) {
    const step = playback.sequence.steps[index];
    if (!step) return;
    syncTurnControls(playback.sequence, index);
    editingStep = index;
    playback.playing = false;
    playback.seekStep(index + 1);
  }

  /** A hand-path card stands for several sequences; keep the one playing. */
  function selectCard(members: readonly ModeLoop[]) {
    selectLoop(
      members.find((loop) => loop.id === selectedLoopId) ?? members[0]!,
      true
    );
  }

  function setApplyTo(value: "all" | "current") {
    applyTo = value;
    // One step is the one on screen, so it holds still while being edited.
    if (value === "current") {
      playback.playing = false;
      editingStep = currentStripStep;
    }
    syncTurnControls(playback.sequence, editingStep);
  }

  function chooseTurn(hand: "left" | "right", value: TurnValue) {
    if (typeof value !== "number" || !availableTurns.includes(value)) return;
    if (applyTo === "current" && playback.playing) {
      editingStep = currentStripStep;
      syncTurnControls(playback.sequence, editingStep);
    }
    const current = playback.sequence.steps[editingStep];
    const currentLeft =
      applyTo === "current"
        ? Number(current?.motions.left.turns) || 0
        : leftTurns;
    const currentRight =
      applyTo === "current"
        ? Number(current?.motions.right.turns) || 0
        : rightTurns;
    const nextLeft = hand === "left" ? value : currentLeft;
    const nextRight = hand === "right" ? value : currentRight;
    if (nextLeft === leftTurns && nextRight === rightTurns) return;
    void adjustTurns(nextLeft, nextRight);
  }

  const controlStatus = $derived(
    adjustmentError ??
      (showingHands
        ? "Turns change only the props. Switch to Props to set them."
        : !turnLoopClosed
          ? "Props finish at a different orientation. Plays once."
          : applyTo === "current"
            ? `Turns change step ${editingStep + 1} of all ${loopCountWord} sequences.`
            : `Changes apply to all ${loopCountWord} sequences.`)
  );
  // Hands view hides the props, so turns rest there instead of vanishing:
  // the rail keeps its shape and says why.
  const turnsLocked = $derived(adjusting || showingHands);

  const jsonLd = $derived({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        mainEntityOfPage: canonical,
        headline: article.name,
        name: article.name,
        description: article.metaDescription,
        url: canonical,
        inLanguage: "en-US",
        citation: {
          "@type": "CreativeWork",
          name: TIMING_DIRECTION_SOURCE.label,
          url: TIMING_DIRECTION_SOURCE.url,
        },
        author: {
          "@type": "Person",
          name: "Austen Cloud",
          url: "https://tkaflowarts.com/about",
        },
        isPartOf: {
          "@type": "CollectionPage",
          name: "Timing and Direction in Flow Arts",
          url: "https://tkaflowarts.com/timing-and-direction",
        },
        about: {
          "@type": "DefinedTerm",
          name: article.name,
          alternateName: article.aliases,
          description: article.definition,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://tkaflowarts.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Timing and Direction",
            item: "https://tkaflowarts.com/timing-and-direction",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: article.name,
            item: canonical,
          },
        ],
      },
    ],
  });
</script>

<Seo
  title={`${article.name}: Flow Arts Timing & Direction`}
  description={article.metaDescription}
  {canonical}
  ogType="article"
>
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}<\/script>`}
</Seo>

{#snippet transformActions(panel: boolean)}
  <SequenceTransformActions
    hasSequence={!!selectedLoop}
    hasSelection={false}
    isTransforming={adjusting}
    showEditInConstructor={false}
    isDesktopPanel={panel}
    mobileColumns={4}
    resetPlacement="transform"
    actionSubject={`all ${loopCountWord} sequences`}
    onMirror={() => void transformAllLoops("mirror")}
    onFlip={() => void transformAllLoops("flip")}
    onSwap={() => void transformAllLoops("swap")}
    onReset={resetAllLoops}
  />
{/snippet}

{#snippet playerControls()}
  <div class="player-controls">
    <div class="rail-head">
      <SegmentedControl
        options={[
          { value: "staff", label: "With props", shortLabel: "Props" },
          { value: "hands", label: "Hands" },
        ]}
        value={playback.propDisplay}
        onchange={(value) => (playback.propDisplay = value)}
        ariaLabel="Player display"
        density="tight"
        color="accent"
      />
      {#if browser}
        <TransportControls
          isPlaying={playback.playing && !!selectedLoop}
          disabled={!selectedLoop}
          onPlaybackToggle={playback.togglePlayback}
        />
      {/if}
    </div>

    <section class="rail-group turns-group" aria-labelledby="turns-label">
      <h2 id="turns-label" class="group-label">Turns</h2>
      <div class="turn-scope">
        <SegmentedControl
          options={[
            { value: "all", label: "All steps", disabled: showingHands },
            { value: "current", label: "This step", disabled: showingHands },
          ]}
          value={applyTo}
          onchange={setApplyTo}
          ariaLabel="Which steps the turns change"
          density="tight"
          color="accent"
        />
        <PanelButton
          onclick={resetTurns}
          disabled={turnsLocked || turnsAreReset}
          ariaLabel="Reset turns"
          title="Reset turns"
        >
          <i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
        </PanelButton>
      </div>
      <div class="turn-values" aria-busy={adjusting}>
        <!-- A tall rail lays every value out. A short one keeps each
               hand's values behind its own menu so the actions still fit. -->
        <div class="turns-inline">
          <TurnNotationControls
            layout="inline"
            leftTurn={leftTurns}
            rightTurn={rightTurns}
            labelMode={turnLabelMode}
            onlabelmodechange={(value) => (turnLabelMode = value)}
            onturn={chooseTurn}
            turnValues={availableTurns}
            primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
            disabled={turnsLocked}
          />
        </div>
        <div class="turns-menu">
          <TurnNotationControls
            leftTurn={leftTurns}
            rightTurn={rightTurns}
            labelMode={turnLabelMode}
            onlabelmodechange={(value) => (turnLabelMode = value)}
            onturn={chooseTurn}
            turnValues={availableTurns}
            primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
            disabled={turnsLocked}
          />
        </div>
      </div>
    </section>

    <section class="rail-group actions-group" aria-label="Sequence actions">
      <!-- A tall rail gets the panel tiles. A short one puts all four
           actions on one row so nothing scrolls out of view. -->
      <div class="actions-tiles">
        {@render transformActions(true)}
      </div>
      <div class="actions-row">
        {@render transformActions(false)}
      </div>
    </section>

    <div class="rail-status" aria-live="polite">
      <Crossfade key={controlStatus}>
        <p>{controlStatus}</p>
      </Crossfade>
    </div>
  </div>
{/snippet}

<article
  class="mode-page"
  style:--mode-accent={mode.element.accentColor}
  style:--loops-per-grid={loopsPerGrid}
>
  <div class="mode-top">
    <header class="mode-header">
      <nav class="page-nav" aria-label="Timing and direction">
        <PanelButton href="/timing-and-direction">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          <span class="nav-label">All six modes</span>
        </PanelButton>
      </nav>
      <div class="mode-title">
        <img src={mode.element.iconPath} alt="" width="48" height="48" />
        <h1 id="mode-title">{article.name}</h1>
      </div>
    </header>

    <section class="mode-hero" aria-labelledby="mode-title">
      <figure
        class="demonstration"
        aria-label={`${selectedWord} sequence player`}
      >
        <div class="mode-showcase" bind:this={examplePlayer}>
          <SequenceShowcasePreview
            word={selectedWord}
            sequence={selectedLoop ? playback.sequence : null}
            transitionKey={selectedLoop ? `timing-${selectedLoop.id}` : null}
            alwaysLive
            playbackActive={playback.playing}
            externalPlaying={playback.playing}
            initialStep={playback.step}
            onExternalPlayingChange={(value) => {
              if (value !== playback.playing) playback.togglePlayback();
            }}
            onStepChange={playback.followStep}
            onSeekRef={playback.registerSeek}
            onCellClick={(stepNumber) => selectCount(stepNumber - 1)}
            singlePlay={!turnLoopClosed}
            leftPropType={displayPropType}
            rightPropType={displayPropType}
            primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
            controls={playerControls}
          />
        </div>
      </figure>

      <section class="loop-library" aria-labelledby="loop-library-title">
        <h2 id="loop-library-title">Choose a sequence</h2>
        <div class="loop-groups" aria-busy={loopsLoading}>
          {#each loopGroups as group (group.title)}
            <section
              class="loop-group"
              aria-labelledby={`${group.title}-loops`}
            >
              <h3 id={`${group.title}-loops`}>{group.title}</h3>
              <div
                class="loop-grid"
                style:--shown={group.cards.length || loopsPerGrid}
              >
                {#each group.cards as card (card.loop.id)}
                  <div
                    class="loop-cell"
                    animate:flip={{ duration: flipDuration() }}
                    in:opaqueFade
                    out:opaqueFade
                  >
                    <PanelButton
                      fullWidth
                      ariaPressed={card.members.some(
                        (loop) => loop.id === selectedLoopId
                      )}
                      ariaLabel={showingHands
                        ? `Hand path of ${card.words.join(" and ")}, ${group.title}`
                        : `${card.words[0]}, ${group.title}`}
                      onclick={() => selectCard(card.members)}
                    >
                      <div class="loop-card" aria-hidden="true" inert>
                        <!-- The view is part of the key: switching between
                             props and hands redraws rather than gliding. -->
                        <ChoreoCard
                          sequence={card.loop.sequence}
                          transitionKey={`timing-${card.loop.id}:${showingHands ? "hands" : "props"}`}
                          showMandala={!showingHands}
                          includeStartPlacement={true}
                          startPlacementLayoutOverride="row"
                          columnCount={2}
                          showQRCode={false}
                          showWord={true}
                          showDifficultyLevel={false}
                          showNotes={false}
                          showLoopGlyph={false}
                          handPathMode={showingHands}
                          customTitleText={showingHands
                            ? card.words.join(" / ")
                            : undefined}
                          darkMode={true}
                          leftPropType={displayPropType}
                          rightPropType={displayPropType}
                          primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
                          fitWidth={true}
                        />
                      </div>
                    </PanelButton>
                  </div>
                {:else}
                  <!-- Reserve each card's box so loading never moves the page. -->
                  {#each { length: loopsPerGrid } as _, slot (slot)}
                    <div class="loop-cell loop-slot" aria-hidden="true">
                      <div class="loop-card"></div>
                    </div>
                  {/each}
                {/each}
              </div>
            </section>
          {/each}
          {#if loopsLoading || loopsError}
            <div class="loop-status" role="status">
              {#if loopsError}
                <p>{loopsError}</p>
                <PanelButton onclick={retryLoops}>Try again</PanelButton>
              {:else}
                <p>Loading {loopCountWord} sequences…</p>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    </section>
  </div>

  <div class="further">
    <section class="credit" aria-labelledby="credit-title">
      <h2 id="credit-title">Where the names come from</h2>
      <p>
        These names come from Noel Yee's Vulcan Tech Gospel. It sorts two-hand
        patterns by timing, together or split, and by direction, same or
        opposite.{#if article.timing === "Quarter"}{" "}Quarter time sits
          between together and split, with the hands a quarter cycle apart.{/if}
      </p>
      <LinkChip href={TIMING_DIRECTION_SOURCE.url}
        >{TIMING_DIRECTION_SOURCE.label}</LinkChip
      >
    </section>

    <nav class="related" aria-label="Other timing and direction modes">
      <h2>Other modes</h2>
      <div class="related-modes">
        {#each relatedArticles as related (related.code)}
          <TimingDirectionModeCard article={related} />
        {/each}
      </div>
    </nav>
  </div>
</article>

<style>
  /*
   * The first view is one composed frame: a title row, then the player beside
   * (or above) the sequence chooser. Every length below is a design token, so
   * the hero height can be solved from the space alone, before any sequence
   * or canvas loads. The player is H + rail - strip wide when H tall; the
   * chooser is as tall as the player, with its cards sized to fit.
   */
  .mode-page {
    --sequence-seek-target-size: 48px;
    --page-pad: 1.5rem;
    --header-h: var(--marketing-header-h, 64px);
    --title-h: 3rem;
    --title-gap: 1rem;
    --hero-foot: 1.5rem;
    --hero-gap: 1.5rem;
    /* Wide enough for the turn values and two columns of action tiles. */
    --rail-w: 15rem;
    --strip-h: 6.5rem;
    --lib-head: 2.5rem;
    --lib-gap: 0.5rem;
    --group-head: 1.5rem;
    --group-head-gap: 0.5rem;
    --group-gap: 1rem;
    --card-gap: 0.5rem;
    /* PanelButton's 4px padding and 1px border on both sides. */
    --card-chrome: 10px;
    --n: var(--loops-per-grid, 3);
    /* Chooser height that is not card: heading, two group labels, one gap. */
    --chooser-stacked: calc(
      var(--lib-head) + var(--lib-gap) + 2 *
        (var(--group-head) + var(--group-head-gap)) + var(--group-gap)
    );
    /* The same with Diamond and Box side by side: one row of labels. */
    --chooser-row: calc(
      var(--lib-head) + var(--lib-gap) + var(--group-head) +
        var(--group-head-gap)
    );
    /* svh, not dvh: a collapsing mobile toolbar must not resize the frame. */
    --fit-h: calc(
      100svh - var(--header-h) - 1rem - var(--title-h) - var(--title-gap) -
        var(--hero-foot)
    );
    container: mode-page / inline-size;
    position: relative;
    max-width: var(--shell-w);
    margin: 0 auto;
    padding: calc(var(--header-h) + 1rem) var(--page-pad) 3rem;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }
  .mode-top {
    display: grid;
    gap: var(--title-gap);
  }
  /* The title sits centered over the frame below it; the back button keeps
     to the left without pushing it off center. */
  .mode-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.75rem 1rem;
    min-height: var(--title-h);
  }
  .page-nav {
    justify-self: start;
  }
  .mode-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .mode-title img {
    flex: none;
    width: 48px;
    height: 48px;
    object-fit: contain;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.375rem, 0.875rem + 1.25vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-weight: 720;
    text-wrap: balance;
  }
  .mode-hero {
    display: grid;
    gap: var(--hero-gap);
  }
  .demonstration {
    min-width: 0;
    margin: 0;
  }
  .mode-showcase :global(.sequence-preview) {
    container-name: showcase;
    border-color: color-mix(
      in srgb,
      var(--mode-accent) 55%,
      var(--theme-stroke)
    );
  }

  /* The rail beside the player is exactly the player's height. Its content
     never grows that row, and it scrolls only when a short window leaves too
     little room. */
  .player-controls {
    container: rail / size;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  /* Margins rather than gap: a child's cqh measures the rail itself, so a
     short rail packs its groups closer. */
  .player-controls > :global(* + *) {
    margin-top: clamp(0.75rem, 2.5cqh, 1.5rem);
  }
  .rail-head {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.5rem;
  }
  .rail-head :global(.segmented-control) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .rail-head :global(.transport-controls) {
    flex: none;
  }
  .rail-group {
    display: grid;
    flex: none;
    gap: 0.5rem;
    min-width: 0;
  }
  .turn-scope {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
  }
  .turn-scope :global(.segmented-control) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .turn-scope :global(.panel-btn) {
    flex: none;
    min-height: 0;
    aspect-ratio: 1;
    padding: 0;
    justify-content: center;
  }
  /* Matches the section labels of the action tiles below. */
  .group-label {
    margin: 0;
    padding-left: 4px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--theme-text-dim);
  }
  .turn-values {
    display: grid;
    min-width: 0;
  }
  .turns-inline {
    display: none;
  }
  /* Every value laid out needs about 48rem of rail, 12rem more than the
     menus. */
  @container rail (min-height: 49rem) {
    .turns-inline {
      display: block;
    }
    .turns-menu {
      display: none;
    }
  }
  /* The tiles' own side padding is for a full side panel; in the rail they
     line up with the controls above. */
  .actions-group :global(.actions-container.desktop) {
    padding-inline: 0;
  }
  .actions-row {
    display: none;
  }
  /* Below about 35rem the panel tiles push the status out of view. */
  @container rail (max-height: 35rem) {
    .actions-tiles {
      display: none;
    }
    .actions-row {
      display: block;
    }
  }
  .player-controls > .rail-status {
    flex: none;
    margin-top: auto;
    padding-top: clamp(0.75rem, 2.5cqh, 1.5rem);
  }
  .rail-status p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--theme-text-dim);
  }

  .loop-library {
    min-width: 0;
  }
  .loop-library h2 {
    display: flex;
    align-items: center;
    height: var(--lib-head);
    margin: 0 0 var(--lib-gap);
  }
  .loop-groups {
    position: relative;
    display: grid;
    gap: var(--group-gap);
  }
  .loop-group {
    min-width: 0;
  }
  .loop-group h3 {
    height: var(--group-head);
    margin: 0 0 var(--group-head-gap);
    font-size: 1rem;
    line-height: var(--group-head);
  }
  /* Every card keeps the width it has with all n showing. Hands can show
     fewer, which then sit centered. */
  .loop-grid {
    --cell-w: calc((100% - (var(--n) - 1) * var(--card-gap)) / var(--n));
    display: grid;
    grid-template-columns: repeat(var(--shown, var(--n)), var(--cell-w));
    justify-content: center;
    gap: var(--card-gap);
  }
  .loop-cell {
    display: grid;
    min-width: 0;
  }
  .loop-cell :global(.panel-btn),
  .loop-slot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    padding: 0.25rem;
  }
  .loop-slot {
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
  }
  .loop-card {
    width: 100%;
    aspect-ratio: 5 / 8;
    pointer-events: none;
  }
  .loop-cell :global(.panel-btn[aria-pressed="true"]) {
    outline: 2px solid var(--mode-accent);
    outline-offset: -2px;
    background: color-mix(
      in srgb,
      var(--mode-accent) 10%,
      var(--theme-card-bg)
    );
  }
  .loop-status {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.5rem;
    text-align: center;
  }
  .loop-status p {
    margin: 0;
    font-size: 1rem;
    color: var(--theme-text-dim);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    line-height: 1.3;
    font-weight: 650;
  }
  p {
    margin: 0 0 1.5lh;
    font-size: 1.125rem;
    line-height: 1.6;
    color: var(--theme-text);
  }
  .credit,
  .related {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--theme-stroke);
  }
  .credit p {
    margin-bottom: 1rem;
  }
  .related-modes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .mode-page :global(.panel-btn) {
    font-size: 1rem;
    min-height: 48px;
  }
  .mode-page .loop-grid :global(.panel-btn) {
    min-height: 0;
  }
  .mode-page :global(.panel-btn:focus-visible),
  .mode-page :global(.progress-bar-container.interactive:focus-visible) {
    outline: 3px solid var(--theme-text);
    outline-offset: -3px;
  }

  /* Wherever the title row is short of room, the back button keeps its name
     for assistive tech but shows only its arrow. */
  @media (max-width: 599.98px),
    (orientation: landscape) and (max-height: 599.98px) {
    .mode-header {
      gap: 0.75rem;
    }
    .nav-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .mode-title img {
      width: 40px;
      height: 40px;
    }
  }
  /* The centered title leaves each side half of what it does not use. Below
     about 60rem that half is too narrow for the back button's name. */
  @container mode-page (max-width: 60rem) {
    .nav-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* Phones held upright: one column, the player first, so the title and the
     whole player fit the first screen. */
  @media (max-width: 599.98px) {
    .mode-page {
      --page-pad: 1rem;
      --title-gap: 0.625rem;
      --card-gap: 0.375rem;
      max-width: 100%;
      padding: calc(var(--header-h) + 0.75rem) var(--page-pad) 2rem;
    }
  }

  /* A narrow upright frame stacks the rail under the player. There it grows
     with its content, lays every turn value out, and keeps the actions to
     one row. */
  @media (orientation: portrait) {
    @container showcase (max-width: 28rem) {
      .player-controls {
        container-type: inline-size;
        overflow: visible;
      }
      .turns-inline {
        display: block;
      }
      .turns-menu {
        display: none;
      }
      .actions-tiles {
        display: none;
      }
      .actions-row {
        display: block;
      }
      .player-controls > .rail-status {
        margin-top: 0;
      }
    }
  }

  /* Upright tablets: the player above one row of every card, both sized so
     the pair fills the first screen. */
  @media (orientation: portrait) and (min-width: 600px) {
    .mode-page {
      --card-w: calc(
        ((100cqw - var(--group-gap)) / 2 - (var(--n) - 1) * var(--card-gap)) /
          var(--n)
      );
      --chooser-h: calc(
        var(--chooser-row) + (var(--card-w) - var(--card-chrome)) * 1.6 +
          var(--card-chrome)
      );
    }
    .mode-showcase {
      --sequence-showcase-rail-width: var(--rail-w);
      --sequence-showcase-strip-height: var(--strip-h);
      width: min(
        100cqw,
        max(
          28.5rem,
          var(--fit-h) - var(--chooser-h) - var(--hero-gap) + var(--rail-w) -
            var(--strip-h)
        )
      );
      margin-inline: auto;
    }
    .loop-groups {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Landscape screens with room to spare: player and chooser side by side at
     one height H. With n cards per grid and the groups stacked, the pair is
     band wide when H(1 + 5n/16) = band - rail + strip - gap + 5n/16 * C
     - 3n/8 * chrome - (n - 1) * card gap, where C is the chooser's non-card
     height. H never exceeds the height left under the title. */
  @media (orientation: landscape) and (min-height: 600px) {
    .mode-page {
      --hero-h: min(
        var(--fit-h),
        (
            100cqw - var(--rail-w) + var(--strip-h) - var(--hero-gap) + 0.3125 *
              var(--n) * var(--chooser-stacked) - 0.375 * var(--n) *
              var(--card-chrome) - (var(--n) - 1) * var(--card-gap)
          ) /
          (1 + 0.3125 * var(--n))
      );
      --art-h: calc(
        (var(--hero-h) - var(--chooser-stacked)) / 2 - var(--card-chrome)
      );
      /* The chooser keeps its all-cards width when Hands shows fewer, so
         the frame never moves. */
      --lib-w: calc(
        var(--n) * (var(--art-h) * 0.625 + var(--card-chrome)) +
          (var(--n) - 1) * var(--card-gap)
      );
    }
    .mode-top {
      width: fit-content;
      max-width: 100%;
      margin-inline: auto;
    }
    .mode-hero {
      grid-template-columns: auto auto;
      align-items: start;
    }
    .mode-showcase {
      --sequence-showcase-rail-width: var(--rail-w);
      --sequence-showcase-strip-height: var(--strip-h);
      width: calc(var(--hero-h) + var(--rail-w) - var(--strip-h));
    }
    .loop-library {
      width: var(--lib-w);
      height: var(--hero-h);
    }
    .loop-grid {
      grid-template-columns: repeat(var(--shown, var(--n)), auto);
    }
    .loop-card {
      width: calc(var(--art-h) * 0.625);
      height: var(--art-h);
      aspect-ratio: auto;
    }
  }

  /* Squarer screens, and a 4K panel at 100%, have height to spare once the
     band is full. Diamond and Box then stand side by side as two columns of
     n cards, which gives the player more of the width: H(1 + 1.25/n) = band
     - rail + strip - gap - 3/4 * chrome - group gap + 1.25/n * (C + (n - 1)
     * card gap). */
  @media (orientation: landscape) and (min-height: 600px) and (max-aspect-ratio: 4/3),
    (min-width: 2955px) and (min-height: 1953px) {
    .mode-page {
      --hero-h: min(
        var(--fit-h),
        (
            100cqw - var(--rail-w) + var(--strip-h) - var(--hero-gap) - 0.75 *
              var(--card-chrome) - var(--group-gap) + 1.25 / var(--n) *
              (var(--chooser-row) + (var(--n) - 1) * var(--card-gap))
          ) /
          (1 + 1.25 / var(--n))
      );
      --art-h: calc(
        (
            var(--hero-h) - var(--chooser-row) - (var(--n) - 1) *
              var(--card-gap)
          ) /
          var(--n) - var(--card-chrome)
      );
      --lib-w: calc(
        2 * (var(--art-h) * 0.625 + var(--card-chrome)) + var(--group-gap)
      );
    }
    .loop-library {
      display: flex;
      flex-direction: column;
    }
    .loop-groups {
      flex: 1 1 auto;
      min-height: 0;
      grid-template-columns: auto auto;
    }
    .loop-group {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    /* Each grid is one column here; fewer hand-path cards center in it. */
    .loop-grid {
      grid-template-columns: auto;
      align-content: center;
    }
  }

  /* Short landscape (a phone on its side, or a zoomed-in window): the player
     docks on the left from the top of the page, sized to the window's height,
     and holds still while the title and chooser scroll beside it. The hero
     only groups those parts, so here they join the top grid directly. */
  @media (orientation: landscape) and (max-height: 599.98px) {
    .mode-page {
      --page-pad: 1rem;
      /* Wide enough for the step choice and its reset on one line. */
      --rail-w: 14rem;
      --strip-h: 4rem;
      --sticky-top: calc(var(--header-h) + 0.5rem);
      /* The title and chooser column never gets narrower than this. */
      --side-min: 16rem;
      padding-top: var(--sticky-top);
    }
    .mode-top {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto 1fr;
      column-gap: var(--hero-gap);
    }
    .mode-header {
      grid-column: 2;
      grid-row: 1;
    }
    .mode-hero {
      display: contents;
    }
    .demonstration {
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: start;
      position: sticky;
      top: var(--sticky-top);
    }
    .loop-library {
      grid-column: 2;
      grid-row: 2;
    }
    .mode-showcase {
      --sequence-showcase-rail-width: var(--rail-w);
      --sequence-showcase-strip-height: var(--strip-h);
      width: min(
        100svh - var(--sticky-top) - 0.5rem + var(--rail-w) - var(--strip-h),
        100cqw - var(--hero-gap) - var(--side-min)
      );
    }
  }

  /* A narrow short window, such as a small phone on its side or a laptop
     zoomed to 200%, gives the shell's side margins to the player. */
  @media (orientation: landscape) and (max-height: 599.98px) and (max-width: 759.98px) {
    .mode-page {
      max-width: 100%;
      padding-left: max(var(--page-pad), env(safe-area-inset-left));
      padding-right: max(var(--page-pad), env(safe-area-inset-right));
    }
  }
</style>
