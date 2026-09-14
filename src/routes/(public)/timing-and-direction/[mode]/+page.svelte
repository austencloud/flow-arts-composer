<script lang="ts">
  import type { PageData } from "./$types";
  import { untrack } from "svelte";
  import { browser } from "$app/environment";
  import { TIMING_DIRECTION_MODES } from "$lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PropTurnsControl from "$lib/features/create/shared/components/sequence-actions/PropTurnsControl.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import SequenceShowcasePreview from "$lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { growFade, reducedMotion } from "$lib/shared/transitions/motion";
  import { getTimingDirectionState } from "../_state/timing-direction-state.svelte";
  import TimingDirectionModeCard from "../_components/TimingDirectionModeCard.svelte";
  import {
    getTimingDirectionArticle,
    TIMING_DIRECTION_ARTICLES,
  } from "../_data/timing-direction-articles";
  import {
    adjustTogetherOppositeLoop,
    loadTogetherOppositeLoops,
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
  let selectedTogetherOppositeLoop = $state<string | null>(null);
  let loopsLoading = $state(false);
  let loopsError = $state<string | null>(null);
  let loopsRetry = $state(0);
  let loopsRequest = 0;
  let leftTurns = $state(0);
  let rightTurns = $state(0);
  let applyTo = $state<"all" | "current">("all");
  let adjustmentRequest = 0;
  let adjusting = $state(false);
  let adjustmentError = $state<string | null>(null);
  let turnLoopClosed = $state(true);
  let turnEditorOpen = $state(false);
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

  $effect(() => {
    if (article.code !== "TO") {
      loopsRequest += 1;
      adjustmentRequest += 1;
      adjusting = false;
      adjustmentError = null;
      selectedTogetherOppositeLoop = null;
      togetherOppositeLoops = [];
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
    void loadTogetherOppositeLoops()
      .then((loops) => {
        if (request !== loopsRequest || article.code !== "TO") return;
        if (loops.length === 0) {
          loopsError = "No Together-Opposite loops are available yet.";
          return;
        }
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
    leftTurns = 0;
    rightTurns = 0;
    turnLoopClosed = true;
    turnEditorOpen = false;
    editingStep = 0;
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
      const sequence = await adjustTogetherOppositeLoop(
        { ...selectedLoop, sequence: playback.sequence },
        nextLeftTurns,
        nextRightTurns,
        applyTo === "current" ? editingStep : undefined
      );
      if (request !== adjustmentRequest) return;
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
    if (!selectedLoop) return;
    adjustmentRequest += 1;
    adjusting = false;
    adjustmentError = null;
    turnLoopClosed = true;
    leftTurns = 0;
    rightTurns = 0;
    playback.playing = false;
    playback.selectExample(
      selectedLoop.sequence,
      Math.max(
        0,
        Math.min(selectedLoop.sequence.steps.length + 1, playback.step)
      )
    );
  }

  function selectCount(index: number) {
    const step = playback.sequence.steps[index];
    if (!step) return;
    leftTurns = Number(step.motions.left.turns) || 0;
    rightTurns = Number(step.motions.right.turns) || 0;
    editingStep = index;
    playback.playing = false;
    playback.seekStep(index + 1);
  }

  function openTurnEditor() {
    const step = playback.sequence.steps[currentStripStep];
    editingStep = currentStripStep;
    leftTurns = Number(step?.motions.left.turns) || 0;
    rightTurns = Number(step?.motions.right.turns) || 0;
    adjustmentError = null;
    playback.playing = false;
    turnEditorOpen = !turnEditorOpen;
  }

  function setApplyTo(value: "all" | "current") {
    applyTo = value;
    const step = playback.sequence.steps[editingStep];
    leftTurns = Number(step?.motions.left.turns) || 0;
    rightTurns = Number(step?.motions.right.turns) || 0;
  }

  function nudgeTurns(hand: "left" | "right", delta: number) {
    const current = playback.sequence.steps[editingStep];
    const currentLeft =
      applyTo === "current"
        ? Number(current?.motions.left.turns) || 0
        : leftTurns;
    const currentRight =
      applyTo === "current"
        ? Number(current?.motions.right.turns) || 0
        : rightTurns;
    const nextLeft =
      hand === "left"
        ? Math.max(0, Math.min(3, currentLeft + delta))
        : currentLeft;
    const nextRight =
      hand === "right"
        ? Math.max(0, Math.min(3, currentRight + delta))
        : currentRight;
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
    <section class="to-reference" aria-labelledby="to-reference-title">
      <header class="to-header">
        <div class="mode-identity">
          <img src={mode.element.iconPath} alt="" width="44" height="44" />
          <span>{article.code} · {mode.element.element}</span>
        </div>
        <h1 id="to-reference-title">Together time, opposite direction</h1>
        <p class="definition">{article.definition}</p>
      </header>

      <div class="to-stage">
        <figure class="demonstration">
          <div class="demo-toolbar">
            <h2>{selectedLoop?.word ?? "Four-count loop"}</h2>
            <div class="display-switch">
              <SegmentedControl
                options={[
                  { value: "staff", label: "With props" },
                  { value: "hands", label: "Hands" },
                ]}
                value={playback.propDisplay}
                onchange={(value) => (playback.propDisplay = value)}
                ariaLabel="Player display"
                density="tight"
                color="accent"
              />
            </div>
            {#if browser}
              <TransportControls
                isPlaying={playback.playing}
                onPlaybackToggle={playback.togglePlayback}
              />
            {/if}
          </div>
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
            />
          </div>
          <figcaption>Tap a pictograph to pause on that count.</figcaption>
        </figure>

        <div class="to-workbench">
          {#if playback.propDisplay === "staff"}
            <section
              class="turn-disclosure"
              aria-labelledby="turn-controls-title"
              transition:growFade={{ axis: "y" }}
            >
              <div class="turn-disclosure-heading">
                <h2 id="turn-controls-title">Turns</h2>
                <PanelButton
                  onclick={openTurnEditor}
                  ariaPressed={turnEditorOpen}
                >
                  {turnEditorOpen ? "Close" : "Adjust turns"}
                </PanelButton>
              </div>
              {#if turnEditorOpen}
                <div class="turn-controls" transition:growFade={{ axis: "y" }}>
                  <div class="turn-scope">
                    <span>Apply to</span>
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
                  </div>
                  <div class="turn-pairs" aria-busy={adjusting}>
                    <div class="turn-prop">
                      <span>Left</span>
                      <PropTurnsControl
                        hand="left"
                        turns={leftTurns}
                        rotationDirection={RotationDirection.NO_ROTATION}
                        showRotation={false}
                        compact
                        onTurnsChange={(delta) => nudgeTurns("left", delta)}
                        onRotationChange={() => {}}
                      />
                    </div>
                    <div class="turn-prop">
                      <span>Right</span>
                      <PropTurnsControl
                        hand="right"
                        turns={rightTurns}
                        rotationDirection={RotationDirection.NO_ROTATION}
                        showRotation={false}
                        compact
                        onTurnsChange={(delta) => nudgeTurns("right", delta)}
                        onRotationChange={() => {}}
                      />
                    </div>
                    <PanelButton
                      onclick={resetTurns}
                      disabled={playback.sequence.id ===
                        selectedLoop?.sequence.id}>Reset</PanelButton
                    >
                  </div>
                </div>
              {/if}
              <div class="turn-status" aria-live="polite">
                {#if adjustmentError}
                  <p>{adjustmentError}</p>
                {:else if !turnLoopClosed}
                  <p>Props finish at a different orientation. Plays once.</p>
                {/if}
              </div>
            </section>
          {/if}
        </div>
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
                      <h4>{spinLabel}</h4>
                      {#each group.loops.filter((loop) => loop.spinLabel === spinLabel) as loop (loop.id)}
                        <PanelButton
                          fullWidth
                          ariaPressed={selectedTogetherOppositeLoop === loop.id}
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
                          <span class="loop-word">{loop.word}</span>
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
    grid-template-columns: minmax(18rem, 32rem) minmax(0, 1fr);
    gap: clamp(1rem, 3vw, 2rem);
    align-items: start;
  }
  .to-header {
    grid-column: 1 / -1;
    max-width: 100%;
    margin-bottom: 1.5rem;
  }
  .to-header h1 {
    margin-bottom: 0.75rem;
    text-wrap: balance;
  }
  .to-header .definition {
    max-width: 68ch;
    margin-bottom: 0;
  }
  .to-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }
  .to-stage .demonstration {
    grid-column: auto;
    grid-row: auto;
    width: min(100%, 32rem);
  }
  .to-workbench {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
  }
  .turn-disclosure {
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg);
  }
  .library-heading,
  .turn-scope {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }
  .turn-controls p {
    margin: 0;
    font-size: 1rem;
  }
  .display-switch {
    width: 12rem;
  }
  .to-stage .demo-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0.75rem;
  }
  .to-stage .demo-toolbar h2 {
    margin: 0;
  }
  .to-showcase {
    width: 100%;
    aspect-ratio: 1;
  }
  .to-showcase :global(.sequence-preview) {
    height: 100%;
    aspect-ratio: auto;
    border-color: color-mix(
      in srgb,
      var(--mode-accent) 55%,
      var(--theme-stroke)
    );
  }
  .turn-controls {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }
  .turn-disclosure-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .turn-scope {
    align-items: center;
  }
  .turn-scope > span {
    font-size: 0.875rem;
    font-weight: 650;
    white-space: nowrap;
  }
  .turn-scope :global(.segmented-control) {
    width: min(100%, 16rem);
  }
  .turn-pairs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: end;
  }
  .turn-prop {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 650;
  }
  .turn-prop :global(.turns-controls) {
    --prop-color: var(--dm-motion-blue);
  }
  .turn-prop + .turn-prop :global(.turns-controls) {
    --prop-color: var(--dm-motion-red);
  }
  .turn-status {
    min-height: 1.5rem;
    margin-top: 0.75rem;
  }
  .turn-status p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
  }
  .turn-pairs :global(.panel-btn) {
    min-height: 44px;
  }
  .loop-library {
    min-width: 0;
  }
  .loop-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    margin-top: 1rem;
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
  .spin-column h4 {
    min-height: 2.5em;
    margin: 0 0 0.35rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    line-height: 1.25;
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
    overflow-wrap: anywhere;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.025em;
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
    .to-stage .demonstration {
      width: min(100%, 32rem);
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
    .to-stage .demo-toolbar {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .turn-pairs {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .turn-pairs :global(.panel-btn) {
      grid-column: 1 / -1;
    }
    .spin-grid {
      gap: 0.375rem;
    }
  }
</style>
