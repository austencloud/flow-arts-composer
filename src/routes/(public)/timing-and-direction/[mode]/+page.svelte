<script lang="ts">
  import type { PageData } from "./$types";
  import { untrack } from "svelte";
  import { Popover } from "bits-ui";
  import { browser } from "$app/environment";
  import { TIMING_DIRECTION_MODES } from "$lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
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
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
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
    adjustTogetherOppositeLoops,
    loadTogetherOppositeLoops,
    transformTogetherOppositeLoops,
    type TogetherOppositeTransform,
    type TogetherOppositeLoop,
  } from "../_data/together-opposite-sequences";

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
  const lessonHref = $derived(
    article.timing === "Quarter"
      ? "/learn/concepts/gamma-motion"
      : "/learn/concepts/dual-shifts-alpha-beta"
  );
  const spinLabels = ["Pro-spin", "Anti-spin", "Mixed"] as const;
  let togetherOppositeLoops = $state<TogetherOppositeLoop[]>([]);
  let originalTogetherOppositeLoops = $state<TogetherOppositeLoop[]>([]);
  let selectedTogetherOppositeLoop = $state<string | null>(null);
  let loopsLoading = $state(false);
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
    togetherOppositeLoops.find(
      (loop) => loop.id === selectedTogetherOppositeLoop
    ) ??
      togetherOppositeLoops[0] ??
      null
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
  const loopGroups = $derived([
    {
      title: "Diamond",
      loops: togetherOppositeLoops.filter(
        (loop) => loop.gridMode === GridMode.DIAMOND
      ),
    },
    {
      title: "Box",
      loops: togetherOppositeLoops.filter(
        (loop) => loop.gridMode === GridMode.BOX
      ),
    },
  ]);
  const turnsAreReset = $derived(
    togetherOppositeLoops.every((loop) =>
      loop.sequence.steps.every(
        (step) =>
          (Number(step.motions.left.turns) || 0) === 0 &&
          (Number(step.motions.right.turns) || 0) === 0
      )
    )
  );

  $effect(() => {
    if (article.code !== "TO") {
      loopsRequest += 1;
      adjustmentRequest += 1;
      adjusting = false;
      adjustmentError = null;
      selectedTogetherOppositeLoop = null;
      togetherOppositeLoops = [];
      originalTogetherOppositeLoops = [];
      loopsError = null;
      loopsLoading = false;
      return;
    }
    loopsRetry;
    const request = ++loopsRequest;
    adjustmentRequest += 1;
    adjusting = false;
    adjustmentError = null;
    loopsLoading = true;
    loopsError = null;
    togetherOppositeLoops = [];
    originalTogetherOppositeLoops = [];
    void loadTogetherOppositeLoops()
      .then((loops) => {
        if (request !== loopsRequest || article.code !== "TO") return;
        if (loops.length === 0) {
          loopsError = "No Together-Opposite loops are available yet.";
          return;
        }
        originalTogetherOppositeLoops = loops;
        togetherOppositeLoops = loops;
        untrack(() => selectTogetherOppositeLoop(loops[0]!));
      })
      .catch(() => {
        if (request !== loopsRequest || article.code !== "TO") return;
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

  function selectTogetherOppositeLoop(
    loop: TogetherOppositeLoop,
    reveal = false
  ) {
    adjustmentRequest += 1;
    adjusting = false;
    adjustmentError = null;
    selectedTogetherOppositeLoop = loop.id;
    turnEditorOpen = false;
    actionEditorOpen = false;
    editingStep = 0;
    syncTurnControls(loop.sequence, editingStep);
    turnLoopClosed =
      (loop.sequence.metadata as { turnLoopClosed?: boolean } | undefined)
        ?.turnLoopClosed !== false;
    playback.selectExample(loop.sequence, 0);
    if (reveal && window.matchMedia("(max-width: 1439px)").matches) {
      examplePlayer?.scrollIntoView({
        block: "center",
        behavior: reducedMotion() ? "instant" : "smooth",
      });
    }
  }

  function retryTogetherOppositeLoops() {
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
      const loops = await adjustTogetherOppositeLoops(
        togetherOppositeLoops,
        nextLeftTurns,
        nextRightTurns,
        applyTo === "current" ? editingStep : undefined
      );
      if (request !== adjustmentRequest) return;
      togetherOppositeLoops = loops;
      const selected = loops.find(
        (loop) => loop.id === selectedTogetherOppositeLoop
      );
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
    if (!selectedLoop || originalTogetherOppositeLoops.length === 0) return;
    adjustmentRequest += 1;
    adjusting = false;
    adjustmentError = null;
    playback.playing = false;
    togetherOppositeLoops = originalTogetherOppositeLoops;
    const selected =
      originalTogetherOppositeLoops.find(
        (loop) => loop.id === selectedTogetherOppositeLoop
      ) ?? originalTogetherOppositeLoops[0];
    if (!selected) return;
    selectedTogetherOppositeLoop = selected.id;
    editingStep = 0;
    syncTurnControls(selected.sequence, editingStep);
    turnLoopClosed = true;
    playback.selectExample(selected.sequence, 0);
  }

  async function transformAllLoops(transform: TogetherOppositeTransform) {
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
      const loops = await transformTogetherOppositeLoops(
        togetherOppositeLoops,
        transform
      );
      if (request !== adjustmentRequest) return;
      togetherOppositeLoops = loops;
      const selected = loops.find(
        (loop) => loop.id === selectedTogetherOppositeLoop
      );
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

  function syncTurnControls(
    sequence: TogetherOppositeLoop["sequence"],
    index: number
  ) {
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

<article
  class="mode-page"
  class:sequence-reference={article.code === "TO"}
  style:--mode-accent={mode.element.accentColor}
>
  <nav class="page-nav" aria-label="Timing and direction">
    <PanelButton href="/timing-and-direction">
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      All six modes
    </PanelButton>
  </nav>

  {#if article.code === "TO"}
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
    <section class="to-reference" aria-labelledby="to-reference-title">
      <header class="to-header">
        <div class="to-title">
          <img src={mode.element.iconPath} alt="" width="64" height="64" />
          <h1 id="to-reference-title">Together Time, Opposite Direction</h1>
        </div>
      </header>

      <div class="to-stage">
        <figure
          class="demonstration"
          aria-label={`${selectedLoop?.word ?? "Together-Opposite"} sequence player`}
        >
          <div class="to-showcase" bind:this={examplePlayer}>
            <SequenceShowcasePreview
              word={selectedLoop?.word ?? "Together-Opposite"}
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
                      <div class="to-workbench">
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
                          <p>Applies to all six sequences.</p>
                          {#if adjustmentError}
                            <p>{adjustmentError}</p>
                          {:else if !turnLoopClosed}
                            <p>
                              Props finish at a different orientation. Plays
                              once.
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
                        actionSubject="all six sequences"
                        onMirror={() => void transformAllLoops("mirror")}
                        onFlip={() => void transformAllLoops("flip")}
                        onSwap={() => void transformAllLoops("swap")}
                        onReset={resetAllLoops}
                      />
                      <p class="action-scope">
                        Applies to all six sequences. Reset restores the
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
      </div>

      <section class="loop-library" aria-labelledby="loop-library-title">
        <div class="library-heading">
          <h2 id="loop-library-title">Choose a sequence</h2>
        </div>
        <div class="loop-columns" aria-busy={loopsLoading}>
          {#if loopsLoading}
            <p class="loop-status">Loading six loops…</p>
          {:else if loopsError}
            <div class="loop-status">
              <p>{loopsError}</p>
              <PanelButton onclick={retryTogetherOppositeLoops}
                >Try again</PanelButton
              >
            </div>
          {:else}
            {#each loopGroups as group (group.title)}
              <section
                class="loop-group"
                aria-labelledby={`${group.title}-loops`}
              >
                <h3 id={`${group.title}-loops`}>{group.title}</h3>
                <div class="spin-grid">
                  {#each spinLabels as spinLabel}
                    <div class="spin-column">
                      {#each group.loops.filter((loop) => loop.spinLabel === spinLabel) as loop (loop.id)}
                        <PanelButton
                          fullWidth
                          ariaPressed={selectedTogetherOppositeLoop === loop.id}
                          ariaLabel={loop.word}
                          onclick={() => selectTogetherOppositeLoop(loop, true)}
                        >
                          <span class="loop-preview" aria-hidden="true">
                            {#each loop.sequence.steps as pictograph, index (`${loop.id}-${index}`)}
                              <span class="loop-preview-step">
                                <PictographContainer
                                  pictographData={pictograph}
                                  gridMode={loop.gridMode}
                                  stepNumberOverride={true}
                                  darkMode={true}
                                  leftPropTypeOverride={displayPropType}
                                  rightPropTypeOverride={displayPropType}
                                  leftColorOverride={DEFAULT_VIEWER_CUSTOM_COLORS.left}
                                  rightColorOverride={DEFAULT_VIEWER_CUSTOM_COLORS.right}
                                  showGrid={true}
                                  showTKA={true}
                                  showElemental={false}
                                  showPositions={false}
                                  showReversals={false}
                                  showNonRadialPoints={false}
                                  showHandPoints={true}
                                  disableTransitions
                                />
                              </span>
                            {/each}
                          </span>
                          <span class="loop-word" aria-hidden="true">
                            <TKAWordGlyph
                              word={loop.word}
                              height={26}
                              darkMode
                              fitToParent
                            />
                          </span>
                        </PanelButton>
                      {/each}
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
          {/if}
        </div>
      </section>
    </section>
  {:else}
    <div class="mode-overview">
      <div class="mode-copy">
        <header>
          <div class="mode-identity">
            <img src={mode.element.iconPath} alt="" width="44" height="44" />
            <span>{article.code} · {mode.element.element}</span>
          </div>
          <h1>
            {article.timing} time <span>{article.direction} direction</span>
          </h1>
          <p class="definition">{article.definition}</p>
        </header>
        <p>{article.watchFor}</p>
        <PanelButton
          href="/learn/concepts/timing-and-direction"
          accentColor={mode.element.accentColor}
        >
          <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
          Try timing and direction
        </PanelButton>
      </div>
      <div class="mode-notes">
        <section class="practice" aria-labelledby="practice-title">
          <h2 id="practice-title">In practice</h2>
          <p>{article.example}</p>
        </section>
        <section aria-labelledby="distinction-title">
          <h2 id="distinction-title">
            {article.timing === "Quarter"
              ? "Timing and placement"
              : "Timing and direction"}
          </h2>
          <p>{article.commonMistake}</p>
        </section>
        <section aria-labelledby="tka-title">
          <h2 id="tka-title">In TKA</h2>
          <p>{article.tkaConnection}</p>
          <PanelButton href={lessonHref} accentColor={mode.element.accentColor}>
            <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
            Explore this in TKA
          </PanelButton>
        </section>
      </div>

      <figure class="demonstration">
        <div class="demo-toolbar">
          <span>Hand paths</span>
          {#if browser}
            <TransportControls
              isPlaying={playback.playing}
              onPlaybackToggle={() => (playback.playing = !playback.playing)}
            />
          {/if}
        </div>
        <div class="demo-canvas" use:playback.registerTarget></div>
        <figcaption>
          Drag the bar to follow the hands through the cycle.
        </figcaption>
      </figure>
    </div>
  {/if}

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
  .mode-page {
    --sequence-seek-target-size: 48px;
    position: relative;
    max-width: min(var(--shell-w), 100rem);
    margin: 0 auto;
    padding: 88px 1.5rem 3rem;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }
  .page-nav {
    margin-bottom: 1.5rem;
  }
  .mode-page.sequence-reference {
    max-width: min(var(--shell-w), 90rem);
    padding-top: 76px;
  }
  .sequence-reference .page-nav {
    margin-bottom: 1rem;
  }
  .mode-overview {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    gap: clamp(1.5rem, 4vw, 4rem);
    align-items: start;
  }
  .to-reference {
    max-width: 86rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 1.5rem;
    align-items: start;
  }
  .to-header {
    grid-column: 1 / -1;
    max-width: 100%;
    margin-bottom: 0;
  }
  .to-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    text-align: center;
  }
  .to-title img {
    flex: 0 0 auto;
    width: clamp(48px, 4.5vw, 64px);
    height: clamp(48px, 4.5vw, 64px);
    object-fit: contain;
  }
  .to-header h1 {
    margin-bottom: 0;
    font-size: clamp(1.75rem, 1.25rem + 1.5vw, 2.5rem);
    text-wrap: balance;
  }
  .to-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
  }
  .to-stage .demonstration {
    grid-column: auto;
    grid-row: auto;
    width: 100%;
  }
  .to-workbench {
    display: grid;
    min-width: 0;
    container-type: inline-size;
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
  .library-heading,
  .turn-scope {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .display-switch {
    width: 100%;
  }
  .to-showcase {
    width: 100%;
  }
  .to-showcase :global(.sequence-preview) {
    border-color: color-mix(
      in srgb,
      var(--mode-accent) 55%,
      var(--theme-stroke)
    );
  }
  .player-controls {
    display: grid;
    align-content: start;
    gap: 0.5rem;
    min-width: 0;
  }
  .player-controls :global(.segmented-control) {
    width: 100%;
  }
  .player-controls :global(.transport-controls) {
    margin: 0;
  }
  .turn-controls {
    display: grid;
    gap: 0.5rem;
  }
  .turn-scope {
    align-items: center;
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
  .library-heading {
    min-height: 48px;
    margin-bottom: 0.5rem;
  }
  .library-heading h2 {
    margin: 0;
  }
  .loop-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    margin-top: 0;
  }
  .loop-group {
    min-width: 0;
  }
  .loop-group h3 {
    margin: 0 0 0.625rem;
    font-size: 1rem;
  }
  .spin-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .spin-column {
    min-width: 0;
  }
  .spin-column :global(.panel-btn) {
    display: grid;
    min-height: 0;
    padding: 0.375rem;
  }
  .spin-column :global(.panel-btn[aria-pressed="true"]) {
    outline: 2px solid var(--mode-accent);
    outline-offset: -2px;
    background: color-mix(
      in srgb,
      var(--mode-accent) 10%,
      var(--theme-card-bg)
    );
  }
  .loop-word {
    display: block;
    width: 100%;
  }
  .loop-preview {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.125rem;
    width: 100%;
  }
  .loop-preview-step {
    display: block;
    aspect-ratio: 1;
  }
  .loop-status {
    display: grid;
    gap: 0.5rem;
    min-height: 6rem;
    align-content: center;
  }
  .loop-status p {
    margin: 0;
    font-size: 1rem;
  }
  .mode-copy,
  .mode-notes {
    min-width: 0;
    max-width: 65ch;
  }
  .mode-notes {
    grid-column: 1;
  }
  .mode-identity {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
    font-size: 1rem;
    font-weight: 650;
    text-transform: capitalize;
    color: var(--theme-text);
  }
  .mode-identity img {
    object-fit: contain;
  }
  h1 {
    margin: 0 0 1.25rem;
    font-size: clamp(2rem, 1.5rem + 1.5vw, 3rem);
    line-height: 1.12;
    letter-spacing: -0.025em;
    font-weight: 720;
  }
  h1 span {
    display: block;
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
  .definition {
    color: var(--theme-text);
    font-size: 1.125rem;
    line-height: 1.55;
  }
  .mode-notes section + section {
    margin-top: 1.5rem;
  }
  .demonstration {
    grid-column: 2;
    grid-row: 1 / span 2;
    min-width: 0;
    margin: 0;
  }
  .demo-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
  }
  .demo-canvas {
    width: 100%;
    aspect-ratio: 1;
  }
  .demo-toolbar :global(.transport-controls) {
    margin: 0;
  }
  figcaption {
    padding: 0.75rem 1rem 1rem;
    color: var(--theme-text);
    font-size: 1rem;
    line-height: 1.5;
  }
  .history,
  .related {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--theme-stroke);
  }
  .history > p {
    max-width: 68ch;
  }
  .source-note {
    font-size: 1rem;
  }
  .sources {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .mode-page :global(.panel-btn:focus-visible),
  .mode-page :global(.progress-bar-container.interactive:focus-visible) {
    outline: 3px solid var(--theme-text);
    outline-offset: -3px;
  }
  @media (max-width: 1100px) {
    .to-reference {
      grid-template-columns: minmax(0, 1fr);
    }
    .to-header {
      grid-column: auto;
    }
    .to-stage {
      width: min(100%, 38rem);
      justify-self: center;
    }
  }
  @media (max-width: 800px) {
    .to-stage .demonstration {
      justify-self: center;
    }
    .mode-overview {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
    }
    .mode-notes {
      grid-row: 3;
    }
    .demonstration {
      grid-column: 1;
      grid-row: 2;
      width: min(100%, 34rem);
      justify-self: center;
    }
    .sources {
      grid-template-columns: minmax(0, 1fr);
    }
    .loop-columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 600px) {
    .mode-page {
      max-width: 100%;
      padding: 76px 1rem 2rem;
    }
    .page-nav {
      margin-bottom: 1rem;
    }
    .library-heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
    .display-switch {
      width: 100%;
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .spin-grid {
      gap: 0.375rem;
    }
  }
  @container (max-width: 28rem) {
    .player-controls {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: center;
    }
    .player-controls .display-switch {
      grid-column: 1 / -1;
    }
    .player-controls :global(.transport-controls) {
      justify-self: center;
    }
  }
</style>
