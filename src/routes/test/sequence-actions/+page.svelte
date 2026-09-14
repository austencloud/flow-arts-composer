<script lang="ts">
  import { page } from "$app/state";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import SequenceActionsReviewFrame from "./_components/SequenceActionsReviewFrame.svelte";

  const REVIEW_STEPS = [
    {
      id: "root",
      title: "Action categories",
      hint: "The header, tabs, and action grid stay stable as content changes.",
      variants: [
        { value: "transform", label: "Transform" },
        { value: "patterns", label: "Patterns" },
        { value: "edit", label: "Edit" },
        { value: "first-step", label: "Choose Start active" },
      ],
    },
    {
      id: "turn",
      title: "Turn Patterns",
      hint: "The pattern can scroll while Apply remains available.",
      variants: [{ value: "default", label: "Editor" }],
    },
    {
      id: "direction",
      title: "Direction",
      hint: "Review every nested Direction mode without losing the workspace.",
      variants: [
        { value: "hub", label: "Hub" },
        { value: "reversals", label: "Reversals" },
        { value: "apply", label: "Rotation apply" },
        { value: "save", label: "Rotation save" },
      ],
    },
    {
      id: "duration",
      title: "Duration Patterns",
      hint: "Editing and completion remain legible in the compact drawer.",
      variants: [{ value: "default", label: "Editor" }],
    },
    {
      id: "extend",
      title: "Extend",
      hint: "At least one complete LOOP choice is visible without nested scrolling.",
      variants: [
        { value: "loop", label: "Closed LOOP" },
        { value: "repeat", label: "Orientation repeat" },
      ],
    },
    {
      id: "help",
      title: "Long-press Help",
      hint: "Closing a direct mobile explanation returns to Sequence Actions.",
      variants: [{ value: "direction", label: "Direction Help" }],
    },
  ] as const;

  const VIEWPORTS = [
    { id: "phone", label: "375 × 667", width: 375, height: 667, scale: 0.88 },
    { id: "cover-p", label: "412 × 960", width: 412, height: 960, scale: 0.65 },
    { id: "cover-l", label: "960 × 412", width: 960, height: 412, scale: 0.75 },
    { id: "open-p", label: "750 × 832", width: 750, height: 832, scale: 0.68 },
    {
      id: "tablet",
      label: "820 × 1180",
      width: 820,
      height: 1180,
      scale: 0.62,
    },
    { id: "1440", label: "1440 × 900", width: 1440, height: 900, scale: 0.58 },
    {
      id: "1920",
      label: "1920 × 1080",
      width: 1920,
      height: 1080,
      scale: 0.46,
    },
    {
      id: "2560",
      label: "2560 × 1440",
      width: 2560,
      height: 1440,
      scale: 0.35,
    },
    { id: "4k", label: "3840 × 2160", width: 3840, height: 2160, scale: 0.29 },
  ] as const;

  type StepId = (typeof REVIEW_STEPS)[number]["id"];

  const isFrame = $derived(page.url.searchParams.get("frame") === "1");
  const reviewBaseUrl = $derived(
    page.url.pathname === "/test/smart-collections"
      ? "/test/smart-collections?review=sequence-actions&"
      : "/test/sequence-actions?"
  );
  const frameSurface = $derived(page.url.searchParams.get("surface") ?? "root");
  const frameVariant = $derived(
    page.url.searchParams.get("variant") ?? "transform"
  );

  let activeStepId = $state<StepId>("root");
  let viewportId = $state<(typeof VIEWPORTS)[number]["id"]>("phone");
  let selectedVariants = $state<Record<StepId, string>>({
    root: "transform",
    turn: "default",
    direction: "hub",
    duration: "default",
    extend: "loop",
    help: "direction",
  });

  const activeStep = $derived(
    REVIEW_STEPS.find((step) => step.id === activeStepId) ?? REVIEW_STEPS[0]
  );
  const selectedViewport = $derived(
    VIEWPORTS.find((viewport) => viewport.id === viewportId) ?? VIEWPORTS[0]
  );
  const frameSource = $derived(
    `${reviewBaseUrl}frame=1&surface=${activeStep.id}&variant=${selectedVariants[activeStep.id]}`
  );

  function selectStep(stepId: StepId) {
    activeStepId = stepId;
  }
</script>

<svelte:head>
  <title
    >{isFrame
      ? "Sequence Actions review frame"
      : "Sequence Actions review"}</title
  >
</svelte:head>

{#if isFrame}
  <SequenceActionsReviewFrame surface={frameSurface} variant={frameVariant} />
{:else}
  <main class="review-page">
    <header class="review-header">
      <div>
        <span class="eyebrow">Responsive review</span>
        <h1>Sequence Actions</h1>
        <p>One live production tree at every drawer depth and viewport.</p>
      </div>
      <a class="direct-frame" href={frameSource}>Open direct frame</a>
    </header>

    <div class="review-layout">
      <aside class="review-rail">
        <nav aria-label="Sequence Actions review steps">
          {#each REVIEW_STEPS as step, index}
            <button
              class="review-step"
              class:active={step.id === activeStep.id}
              onclick={() => selectStep(step.id)}
            >
              <span class="step-number">{index + 1}</span>
              <span
                ><strong>{step.title}</strong><small>{step.hint}</small></span
              >
            </button>
          {/each}
        </nav>
      </aside>

      <section class="review-workspace" aria-labelledby="active-step-title">
        <header class="workspace-header">
          <div>
            <span
              >Step {REVIEW_STEPS.indexOf(activeStep) + 1} of {REVIEW_STEPS.length}</span
            >
            <h2 id="active-step-title">{activeStep.title}</h2>
          </div>
        </header>

        <div class="review-toolbar">
          <div class="toolbar-control">
            <span id="sequence-actions-viewport-label">Viewport</span>
            <SegmentedControl
              options={VIEWPORTS.map((viewport) => ({
                value: viewport.id,
                label: viewport.label,
              }))}
              value={viewportId}
              onchange={(value) =>
                (viewportId = value as (typeof VIEWPORTS)[number]["id"])}
              ariaLabelledby="sequence-actions-viewport-label"
              size="sm"
            />
          </div>

          <div class="toolbar-control">
            <span id="sequence-actions-state-label">State</span>
            <SegmentedControl
              options={activeStep.variants.map((variant) => ({
                value: variant.value,
                label: variant.label,
              }))}
              value={selectedVariants[activeStep.id]}
              onchange={(value) => (selectedVariants[activeStep.id] = value)}
              ariaLabelledby="sequence-actions-state-label"
              size="sm"
            />
          </div>
        </div>

        <div class="preview-panel">
          <header>
            <span>{selectedViewport.width} × {selectedViewport.height}</span>
            <span>{Math.round(selectedViewport.scale * 100)}% review scale</span
            >
          </header>
          <div class="preview-scroll">
            <div
              class="viewport-shell"
              style={`--frame-width:${selectedViewport.width}px;--frame-height:${selectedViewport.height}px;--frame-scale:${selectedViewport.scale};--display-width:${selectedViewport.width * selectedViewport.scale}px;--display-height:${selectedViewport.height * selectedViewport.scale}px;`}
            >
              <iframe
                src={frameSource}
                title={`${activeStep.title} production preview`}
              ></iframe>
            </div>
          </div>
        </div>

        <div class="review-actions">
          <PanelButton
            variant="secondary"
            onclick={() => {
              const index = REVIEW_STEPS.indexOf(activeStep);
              activeStepId = REVIEW_STEPS[Math.max(0, index - 1)]!.id;
            }}
            disabled={activeStep.id === REVIEW_STEPS[0].id}
            >Previous</PanelButton
          >
          <PanelButton
            variant="primary"
            onclick={() => {
              const index = REVIEW_STEPS.indexOf(activeStep);
              activeStepId =
                REVIEW_STEPS[Math.min(REVIEW_STEPS.length - 1, index + 1)]!.id;
            }}
            disabled={activeStep.id === REVIEW_STEPS.at(-1)?.id}
            >Next surface</PanelButton
          >
        </div>
      </section>
    </div>
  </main>
{/if}

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background: #090b11;
  }

  .review-page {
    min-height: 100dvh;
    padding: clamp(16px, 2vw, 36px);
    background:
      radial-gradient(
        circle at 10% 8%,
        rgba(139, 108, 255, 0.13),
        transparent 28%
      ),
      #090b11;
    color: var(--theme-text, #f7f8fb);
    font-family: system-ui, sans-serif;
  }

  .review-header,
  .review-layout {
    width: min(100%, 1760px);
    margin-inline: auto;
  }

  .review-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 20px;
  }

  .eyebrow {
    color: var(--theme-accent, #9b7cff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 4px;
    font-size: clamp(28px, 3vw, 48px);
  }

  .review-header p {
    margin-top: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
  }

  .direct-frame {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    padding: 0 16px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    text-decoration: none;
  }

  .review-layout {
    display: grid;
    grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
    gap: 18px;
  }

  .review-rail,
  .review-workspace {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 18px;
    background: var(--theme-panel-bg, #11131a);
  }

  .review-rail {
    padding: 10px;
  }

  .review-rail nav {
    display: grid;
    gap: 6px;
  }

  .review-step {
    display: grid;
    min-height: var(--min-touch-target, 44px);
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--theme-text, #fff);
    text-align: left;
    cursor: pointer;
  }

  .review-step.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 48%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 14%,
      transparent
    );
  }

  .step-number {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .review-step strong,
  .review-step small {
    display: block;
  }

  .review-step small {
    margin-top: 3px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .review-workspace {
    min-width: 0;
    padding: 14px;
  }

  .workspace-header span,
  .toolbar-control > span,
  .preview-panel > header {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
  }

  .workspace-header h2 {
    margin-top: 3px;
    font-size: var(--font-size-xl, 22px);
  }

  .review-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(220px, 1fr);
    gap: 12px;
    margin-top: 12px;
  }

  .toolbar-control {
    min-width: 0;
  }

  .toolbar-control > span {
    display: block;
    margin-bottom: 6px;
    font-weight: 700;
  }

  .toolbar-control :global(.segmented-control) {
    max-width: 100%;
    overflow-x: auto;
  }

  .preview-panel {
    margin-top: 14px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    background: #05070a;
  }

  .preview-panel > header {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-variant-numeric: tabular-nums;
  }

  .preview-scroll {
    min-height: 520px;
    padding: 18px;
    overflow: auto;
  }

  .viewport-shell {
    width: var(--display-width);
    height: var(--display-height);
    margin-inline: auto;
  }

  .viewport-shell iframe {
    display: block;
    width: var(--frame-width);
    height: var(--frame-height);
    border: 0;
    transform: scale(var(--frame-scale));
    transform-origin: top left;
    background: #07121b;
  }

  .review-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  @media (max-width: 980px) {
    .review-layout {
      grid-template-columns: 1fr;
    }

    .review-rail nav {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .review-toolbar {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 620px) {
    .review-page {
      padding: 10px;
    }

    .review-header {
      align-items: start;
      flex-direction: column;
    }

    .review-rail nav {
      grid-template-columns: 1fr;
    }

    .preview-scroll {
      min-height: 420px;
      padding: 8px;
    }
  }
</style>
