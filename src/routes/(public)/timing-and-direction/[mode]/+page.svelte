<script lang="ts">
  import type { PageData } from "./$types";
  import { untrack } from "svelte";
  import { Popover } from "bits-ui";
  import { browser } from "$app/environment";
  import { TIMING_DIRECTION_MODES } from "$lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SequenceTransformActions from "$lib/shared/create/components/SequenceTransformActions.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TurnNotationControls from "$lib/shared/shape-matrix/app/components/TurnNotationControls.svelte";
  import type { MatrixLabelMode } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    turnValuesForLevel,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import SequenceShowcasePreview from "$lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { flyFade, reducedMotion } from "$lib/shared/transitions/motion";
  import { getTimingDirectionState } from "../_state/timing-direction-state.svelte";
  import TimingDirectionModeCard from "../_components/TimingDirectionModeCard.svelte";
  import {
    getTimingDirectionArticle,
    TIMING_DIRECTION_ARTICLES,
  } from "../_data/timing-direction-articles";
  import {
    adjustModeLoops,
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
  let turnEditorOpen = $state(false);
  let turnTrigger = $state<HTMLButtonElement | null>(null);
  let actionEditorOpen = $state(false);
  let actionTrigger = $state<HTMLButtonElement | null>(null);
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
  // Cards group by the grid each sequence actually uses, so a quarter
  // rotation moves them between Diamond and Box.
  const loopGroups = $derived(
    gridTitles.map(({ gridMode, title }) => ({
      title,
      loops: loops.filter((loop) => loop.gridMode === gridMode),
    }))
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
      turnEditorOpen = false;
      actionEditorOpen = false;
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
          loopsError = "No loops are available for this mode yet.";
          return;
        }
        originalLoops = loaded;
        loops = loaded;
        untrack(() => selectLoop(loaded[0]!));
      })
      .catch(() => {
        if (request !== loopsRequest) return;
        loopsError = "Loops could not load. Try again.";
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
    turnEditorOpen = false;
    actionEditorOpen = false;
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

  function openTurnEditor() {
    editingStep = currentStripStep;
    syncTurnControls(playback.sequence, editingStep);
    adjustmentError = null;
    playback.playing = false;
    turnEditorOpen = !turnEditorOpen;
  }

  function setApplyTo(value: "all" | "current") {
    applyTo = value;
    syncTurnControls(playback.sequence, editingStep);
  }

  function chooseTurn(hand: "left" | "right", value: TurnValue) {
    if (typeof value !== "number" || !availableTurns.includes(value)) return;
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
        citation: article.sources.map((source) => ({
          "@type": "CreativeWork",
          name: source.label,
          url: source.url,
        })),
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

{#snippet playerControls()}
  <div class="player-controls">
    <div class="display-switch">
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
    </div>
    {#if playback.propDisplay === "staff"}
      <div class="turn-editor-toggle">
        <PanelButton
          bind:ref={turnTrigger}
          onclick={openTurnEditor}
          ariaExpanded={turnEditorOpen}
          disabled={!selectedLoop}
          fullWidth
        >
          Turns
        </PanelButton>
      </div>
    {/if}
    <div class="action-editor-toggle">
      <PanelButton
        bind:ref={actionTrigger}
        onclick={() => (actionEditorOpen = !actionEditorOpen)}
        ariaExpanded={actionEditorOpen}
        disabled={!selectedLoop}
        fullWidth
      >
        Actions
      </PanelButton>
    </div>
    {#if browser}
      <TransportControls
        isPlaying={playback.playing}
        onPlaybackToggle={playback.togglePlayback}
      />
    {/if}
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

      <Popover.Root
        open={playback.propDisplay === "staff" && turnEditorOpen}
        onOpenChange={(open) => (turnEditorOpen = open)}
      >
        <Popover.Portal>
          <Popover.Content
            customAnchor={turnTrigger ?? undefined}
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            onInteractOutside={(event) => {
              if (
                event.target instanceof Node &&
                turnTrigger?.contains(event.target)
              )
                event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (playback.propDisplay === "staff") turnTrigger?.focus();
            }}
            forceMount
          >
            {#snippet child({ open, wrapperProps, props })}
              <div {...wrapperProps} style:z-index="50">
                {#if open}
                  <section
                    {...props}
                    class="turn-disclosure"
                    aria-label="Prop turns"
                    transition:flyFade={{ y: -6 }}
                  >
                    <div class="turn-workbench">
                      <div class="turn-controls">
                        <div class="turn-scope">
                          <SegmentedControl
                            options={[
                              { value: "all", label: "All steps" },
                              { value: "current", label: "Current step" },
                            ]}
                            value={applyTo}
                            onchange={setApplyTo}
                            ariaLabel="Turn adjustment scope"
                            density="tight"
                            color="accent"
                          />
                          <PanelButton
                            onclick={resetTurns}
                            disabled={adjusting || turnsAreReset}
                            >Reset</PanelButton
                          >
                        </div>
                        <div aria-busy={adjusting}>
                          <TurnNotationControls
                            leftTurn={leftTurns}
                            rightTurn={rightTurns}
                            labelMode={turnLabelMode}
                            onlabelmodechange={(value) =>
                              (turnLabelMode = value)}
                            onturn={chooseTurn}
                            turnValues={availableTurns}
                            primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
                            disabled={adjusting}
                          />
                        </div>
                      </div>
                      <div class="turn-status" aria-live="polite">
                        <p>Applies to all {loopCountWord} sequences.</p>
                        {#if adjustmentError}
                          <p>{adjustmentError}</p>
                        {:else if !turnLoopClosed}
                          <p>
                            Props finish at a different orientation. Plays once.
                          </p>
                        {/if}
                      </div>
                    </div>
                  </section>
                {/if}
              </div>
            {/snippet}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root
        open={actionEditorOpen}
        onOpenChange={(open) => (actionEditorOpen = open)}
      >
        <Popover.Portal>
          <Popover.Content
            customAnchor={actionTrigger ?? undefined}
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            onInteractOutside={(event) => {
              if (
                event.target instanceof Node &&
                actionTrigger?.contains(event.target)
              )
                event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              actionTrigger?.focus();
            }}
            forceMount
          >
            {#snippet child({ open, wrapperProps, props })}
              <div {...wrapperProps} style:z-index="50">
                {#if open}
                  <section
                    {...props}
                    class="turn-disclosure action-disclosure"
                    aria-label="Sequence actions"
                    transition:flyFade={{ y: -6 }}
                  >
                    <SequenceTransformActions
                      hasSequence={!!selectedLoop}
                      hasSelection={false}
                      isTransforming={adjusting}
                      showEditInConstructor={false}
                      toolbar
                      actionSubject={`all ${loopCountWord} sequences`}
                      onMirror={() => void transformAllLoops("mirror")}
                      onFlip={() => void transformAllLoops("flip")}
                      onSwap={() => void transformAllLoops("swap")}
                      onReset={resetAllLoops}
                    />
                    <p class="action-scope">
                      Applies to all {loopCountWord} sequences. Reset restores the
                      originals.
                    </p>
                    {#if adjustmentError}
                      <p class="action-scope" aria-live="polite">
                        {adjustmentError}
                      </p>
                    {/if}
                  </section>
                {/if}
              </div>
            {/snippet}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <section class="loop-library" aria-labelledby="loop-library-title">
        <h2 id="loop-library-title">Choose a sequence</h2>
        <div class="loop-groups" aria-busy={loopsLoading}>
          {#each loopGroups as group (group.title)}
            <section
              class="loop-group"
              aria-labelledby={`${group.title}-loops`}
            >
              <h3 id={`${group.title}-loops`}>{group.title}</h3>
              <div class="loop-grid">
                {#each group.loops as loop (loop.id)}
                  <PanelButton
                    fullWidth
                    ariaPressed={selectedLoopId === loop.id}
                    ariaLabel={simplifyRepeatedWord(loop.word)}
                    onclick={() => selectLoop(loop, true)}
                  >
                    <div class="loop-card" aria-hidden="true" inert>
                      <ChoreoCard
                        sequence={loop.sequence}
                        showMandala={true}
                        includeStartPlacement={true}
                        startPlacementLayoutOverride="row"
                        columnCount={2}
                        showQRCode={false}
                        showWord={true}
                        showDifficultyLevel={false}
                        showNotes={false}
                        showLoopGlyph={false}
                        handPathMode={playback.propDisplay === "hands"}
                        darkMode={true}
                        leftPropType={displayPropType}
                        rightPropType={displayPropType}
                        primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
                        fitWidth={true}
                      />
                    </div>
                  </PanelButton>
                {:else}
                  <!-- Reserve each card's box so loading never moves the page. -->
                  {#each { length: loopsPerGrid } as _, slot (slot)}
                    <div class="loop-slot" aria-hidden="true">
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
                <p>Loading {loopCountWord} loops…</p>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    </section>
  </div>

  <section class="history" aria-labelledby="learning-title">
    <h2 id="learning-title">Learn from other spinners</h2>
    <ul class="sources">
      {#each article.learningResources as resource (resource.url)}
        <li>
          <PanelButton href={resource.url} fullWidth>
            <span class="source-copy">
              <strong>{resource.label}</strong>
              <span>{resource.detail}</span>
            </span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"
            ></i>
          </PanelButton>
        </li>
      {/each}
    </ul>
  </section>

  <section class="history" aria-labelledby="history-title">
    <h2 id="history-title">History & sources</h2>
    <p>{article.history}</p>
    <p class="source-note">
      These are dated examples of public use, not claims of invention.
    </p>
    <ul class="sources">
      {#each article.sources as source}
        <li>
          <PanelButton href={source.url} fullWidth>
            <span class="source-copy">
              <strong>{source.label}</strong>
              <span>{source.detail}</span>
            </span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"
            ></i>
          </PanelButton>
        </li>
      {/each}
    </ul>
  </section>

  <nav class="related" aria-label="Other timing and direction modes">
    <h2>Other modes</h2>
    <div class="related-modes">
      {#each relatedArticles as related (related.code)}
        <TimingDirectionModeCard article={related} />
      {/each}
    </div>
  </nav>
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
    --rail-w: 9rem;
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
  .mode-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    min-height: var(--title-h);
  }
  .mode-title {
    display: flex;
    align-items: center;
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
    border-color: color-mix(
      in srgb,
      var(--mode-accent) 55%,
      var(--theme-stroke)
    );
  }
  .player-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .display-switch {
    width: 100%;
  }
  .player-controls :global(.segmented-control) {
    width: 100%;
  }
  .player-controls :global(.transport-controls) {
    margin: auto 0 0;
    align-self: center;
  }
  .turn-workbench {
    display: grid;
    min-width: 0;
  }
  .turn-disclosure {
    width: min(32rem, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--sheet-bg-solid);
  }
  .turn-controls {
    display: grid;
    gap: 0.5rem;
  }
  .turn-scope {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .turn-scope :global(.segmented-control) {
    width: min(100%, 16rem);
  }
  .turn-status {
    display: grid;
  }
  .turn-status p {
    margin: 0.5rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
  }
  .action-disclosure {
    width: min(34rem, calc(100vw - 24px));
  }
  .action-scope {
    margin: 0.75rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
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
  .loop-grid {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: var(--card-gap);
  }
  .loop-grid :global(.panel-btn),
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
  .loop-grid :global(.panel-btn[aria-pressed="true"]) {
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
  .history,
  .related {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--theme-stroke);
  }
  .source-note {
    font-size: 1rem;
  }
  .sources {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
    gap: 0.5rem;
    padding: 0;
    margin: 1rem 0 0;
    list-style: none;
  }
  .sources li {
    min-width: 0;
  }
  .sources :global(.panel-btn) {
    height: 100%;
    justify-content: space-between;
    text-align: left;
  }
  .source-copy {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .source-copy strong {
    font-size: 1rem;
    font-weight: 600;
  }
  .source-copy > span {
    font-size: 1rem;
    font-weight: 400;
    color: var(--theme-text);
    line-height: 1.5;
  }
  .sources i {
    flex-shrink: 0;
    font-size: 0.875rem;
  }
  .related-modes {
    display: flex;
    flex-wrap: wrap;
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

  /* Phones held upright: one column, the player first. The back button keeps
     its name for assistive tech but shows only its arrow, so the title and
     the whole player fit the first screen. */
  @media (max-width: 599.98px) {
    .mode-page {
      --page-pad: 1rem;
      --title-gap: 0.75rem;
      max-width: 100%;
      padding: calc(var(--header-h) + 0.75rem) var(--page-pad) 2rem;
    }
    .mode-header {
      flex-wrap: nowrap;
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
    .loop-grid {
      gap: 0.375rem;
    }
  }

  /* A narrow upright frame stacks the rail under the player; lay its controls
     out in a row there. */
  @media (orientation: portrait) {
    @container (max-width: 28rem) {
      .player-controls {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: center;
      }
      .player-controls .display-switch {
        grid-column: 1 / -1;
      }
      .player-controls :global(.transport-controls) {
        margin: 0;
        justify-self: center;
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
      height: var(--hero-h);
    }
    .loop-grid {
      grid-template-columns: repeat(var(--n), auto);
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
    }
    .loop-groups {
      grid-template-columns: auto auto;
    }
    .loop-grid {
      grid-template-columns: auto;
    }
  }

  /* Short landscape (a phone on its side): the player holds still beside the
     chooser, sized to the window's height, while the cards scroll past. */
  @media (orientation: landscape) and (max-height: 599.98px) {
    .mode-page {
      --page-pad: 1rem;
      --rail-w: 8rem;
      --strip-h: 4rem;
      --sticky-top: calc(var(--header-h) + 0.5rem);
      padding-top: var(--sticky-top);
    }
    .mode-hero {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
    }
    .demonstration {
      position: sticky;
      top: var(--sticky-top);
    }
    .mode-showcase {
      --sequence-showcase-rail-width: var(--rail-w);
      --sequence-showcase-strip-height: var(--strip-h);
      width: calc(
        100svh - var(--sticky-top) - 0.5rem + var(--rail-w) - var(--strip-h)
      );
    }
  }
</style>
