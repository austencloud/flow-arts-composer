<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import CopyForAIButton from "$lib/shared/foundation/ui/CopyForAIButton.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import SmartCollectionReviewFrame from "./_components/SmartCollectionReviewFrame.svelte";
  import SequenceActionsReviewPage from "../sequence-actions/+page.svelte";

  const isSequenceActionsReview = $derived(
    page.url.searchParams.get("review") === "sequence-actions"
  );

  type ReviewStatus = "not-reviewed" | "approved" | "needs-changes";

  const REVIEW_STEPS = [
    {
      id: "entry",
      title: "Find the entry point",
      hint: "Compare standard and Smart Collection creation in the library rail.",
      icon: "fa-door-open",
    },
    {
      id: "builder-start",
      title: "Start the rule",
      hint: "The empty builder should focus attention on choosing the first filter.",
      icon: "fa-filter-circle-plus",
    },
    {
      id: "builder-refine",
      title: "Refine the rule",
      hint: "The rule and matching sequences should remain readable together.",
      icon: "fa-wand-magic-sparkles",
    },
    {
      id: "summary",
      title: "Read the rule back",
      hint: "Source, sorting, filters, and the live count should scan as one receipt.",
      icon: "fa-receipt",
    },
    {
      id: "save",
      title: "Confirm and save",
      hint: "Check the suggested name and a custom name before saving.",
      icon: "fa-floppy-disk",
    },
    {
      id: "cards",
      title: "Return to the library",
      hint: "Personal and built-in cards should explain why membership changes.",
      icon: "fa-folder-tree",
    },
    {
      id: "detail",
      title: "Open the collection",
      hint: "Review empty, loading, error, and built-in detail states.",
      icon: "fa-table-cells-large",
    },
  ] as const;

  type ReviewStepId = (typeof REVIEW_STEPS)[number]["id"];

  interface ReviewDecision {
    status: ReviewStatus;
    note: string;
  }

  type ReviewDecisions = Record<ReviewStepId, ReviewDecision>;

  interface PreviewViewport {
    id: string;
    label: string;
    shortLabel: string;
    width: number;
    height: number;
    scale: number;
  }

  interface VariantOption {
    value: string;
    label: string;
    shortLabel?: string;
  }

  const VIEWPORTS = [
    {
      id: "phone",
      label: "Phone 375 × 667",
      shortLabel: "Phone",
      width: 375,
      height: 667,
      scale: 0.88,
    },
    {
      id: "fold-cover-portrait",
      label: "Z Fold cover portrait 412 × 960",
      shortLabel: "Cover P",
      width: 412,
      height: 960,
      scale: 0.65,
    },
    {
      id: "fold",
      label: "Z Fold cover landscape 960 × 412",
      shortLabel: "Cover L",
      width: 960,
      height: 412,
      scale: 0.75,
    },
    {
      id: "fold-open-portrait",
      label: "Z Fold open portrait 750 × 832",
      shortLabel: "Open P",
      width: 750,
      height: 832,
      scale: 0.68,
    },
    {
      id: "fold-open-landscape",
      label: "Z Fold open landscape 832 × 750",
      shortLabel: "Open L",
      width: 832,
      height: 750,
      scale: 0.68,
    },
    {
      id: "tablet",
      label: "Tablet 820 × 1180",
      shortLabel: "Tablet",
      width: 820,
      height: 1180,
      scale: 0.62,
    },
    {
      id: "desktop",
      label: "Desktop 1440 × 900",
      shortLabel: "1440",
      width: 1440,
      height: 900,
      scale: 0.58,
    },
    {
      id: "desktop-hd",
      label: "Desktop 1920 × 1080",
      shortLabel: "1920",
      width: 1920,
      height: 1080,
      scale: 0.46,
    },
    {
      id: "desktop-qhd",
      label: "Desktop 2560 × 1440",
      shortLabel: "2560",
      width: 2560,
      height: 1440,
      scale: 0.35,
    },
    {
      id: "4k",
      label: "4K 3840 × 2160",
      shortLabel: "4K",
      width: 3840,
      height: 2160,
      scale: 0.29,
    },
  ] satisfies PreviewViewport[];

  const VARIANT_OPTIONS: Record<ReviewStepId, VariantOption[]> = {
    entry: [],
    "builder-start": [
      {
        value: "start-chooser",
        label: "Filter chooser",
        shortLabel: "Filters",
      },
      { value: "start-level", label: "Pick a level", shortLabel: "Level" },
      { value: "start-length", label: "Pick a length", shortLabel: "Length" },
      {
        value: "start-letter",
        label: "Pick a starting letter",
        shortLabel: "Letters",
      },
      {
        value: "start-placement",
        label: "Pick a start position",
        shortLabel: "Position",
      },
      {
        value: "start-gridmode",
        label: "Pick a grid mode",
        shortLabel: "Grid",
      },
      { value: "start-loop", label: "Pick LOOP types", shortLabel: "LOOPs" },
      { value: "start-author", label: "Pick a creator", shortLabel: "Creator" },
      {
        value: "start-family",
        label: "Pick Timing and Direction",
        shortLabel: "T&D",
      },
      {
        value: "start-max_turn_intensity",
        label: "Pick max turn intensity",
        shortLabel: "Turns",
      },
    ],
    "builder-refine": [
      { value: "focused", label: "Focused result set", shortLabel: "Focused" },
      { value: "dense", label: "Dense result set", shortLabel: "Dense" },
      {
        value: "filter-chooser",
        label: "Choose a filter",
        shortLabel: "Filters",
      },
      { value: "filter-level", label: "Pick a level", shortLabel: "Level" },
      { value: "filter-length", label: "Pick a length", shortLabel: "Length" },
      {
        value: "filter-letter",
        label: "Pick a starting letter",
        shortLabel: "Letters",
      },
      {
        value: "filter-position",
        label: "Pick a start position",
        shortLabel: "Position",
      },
      {
        value: "filter-gridmode",
        label: "Pick a grid mode",
        shortLabel: "Grid",
      },
      { value: "filter-loop", label: "Pick LOOP types", shortLabel: "LOOPs" },
      {
        value: "filter-author",
        label: "Pick a creator",
        shortLabel: "Creator",
      },
      {
        value: "filter-family",
        label: "Pick Timing and Direction",
        shortLabel: "T&D",
      },
      {
        value: "filter-max_turn_intensity",
        label: "Pick max turn intensity",
        shortLabel: "Turns",
      },
    ],
    summary: [
      { value: "community", label: "Community rule", shortLabel: "Community" },
      { value: "library", label: "My Library rule", shortLabel: "My Library" },
      { value: "counting", label: "Counting matches", shortLabel: "Counting" },
    ],
    save: [
      {
        value: "empty",
        label: "Suggested name",
        shortLabel: "Suggested",
      },
      { value: "long", label: "Custom name", shortLabel: "Custom" },
    ],
    cards: [
      { value: "personal", label: "Personal rule", shortLabel: "Personal" },
      { value: "built-in", label: "Built-in rule", shortLabel: "Built in" },
      { value: "long", label: "Long collection name", shortLabel: "Long name" },
    ],
    detail: [
      { value: "empty", label: "Empty personal rule", shortLabel: "Empty" },
      { value: "loading", label: "Loading matches", shortLabel: "Loading" },
      { value: "error", label: "Connection error", shortLabel: "Error" },
      {
        value: "built-in",
        label: "Empty built-in rule",
        shortLabel: "Built in",
      },
    ],
  };

  const STORAGE_KEY = "tka-smart-collection-review-v1";
  const isFrame = $derived(page.url.searchParams.get("frame") === "1");
  const frameSurface = $derived(
    page.url.searchParams.get("surface") ?? "entry"
  );
  const frameVariant = $derived(
    page.url.searchParams.get("variant") ?? "default"
  );

  function createEmptyDecisions(): ReviewDecisions {
    return Object.fromEntries(
      REVIEW_STEPS.map((step) => [
        step.id,
        { status: "not-reviewed", note: "" },
      ])
    ) as ReviewDecisions;
  }

  function createInitialVariants(): Record<ReviewStepId, string> {
    return Object.fromEntries(
      REVIEW_STEPS.map((step) => [
        step.id,
        VARIANT_OPTIONS[step.id][0]?.value ?? "default",
      ])
    ) as Record<ReviewStepId, string>;
  }

  function isReviewStatus(value: unknown): value is ReviewStatus {
    return (
      value === "not-reviewed" ||
      value === "approved" ||
      value === "needs-changes"
    );
  }

  let activeStepIndex = $state(0);
  let viewportId = $state("phone");
  let decisions = $state<ReviewDecisions>(createEmptyDecisions());
  let selectedVariants = $state<Record<ReviewStepId, string>>(
    createInitialVariants()
  );
  let finalApproved = $state(false);
  let reviewLoaded = $state(false);
  let storageAvailable = $state(true);

  const activeStep = $derived(REVIEW_STEPS[activeStepIndex] ?? REVIEW_STEPS[0]);
  const activeDecision = $derived(decisions[activeStep.id]);
  const activeVariants = $derived(VARIANT_OPTIONS[activeStep.id]);
  const selectedViewport = $derived(
    VIEWPORTS.find((viewport) => viewport.id === viewportId) ?? VIEWPORTS[0]!
  );
  const approvedCount = $derived(
    REVIEW_STEPS.filter((step) => decisions[step.id].status === "approved")
      .length
  );
  const changesCount = $derived(
    REVIEW_STEPS.filter((step) => decisions[step.id].status === "needs-changes")
      .length
  );
  const allApproved = $derived(approvedCount === REVIEW_STEPS.length);
  const finalGatePassed = $derived(allApproved && finalApproved);
  const frameSource = $derived(
    `/test/smart-collections?frame=1&surface=${activeStep.id}&variant=${selectedVariants[activeStep.id]}`
  );

  onMount(() => {
    // This route intentionally runs in landing-lite mode. A Vite process that
    // was already running before the route was registered can retain the app
    // boot screen from its startup HTML, so the review surface clears it once
    // the real component tree has mounted.
    document.getElementById("app-loading")?.remove();

    if (isFrame) return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as {
          activeStepId?: unknown;
          viewportId?: unknown;
          decisions?: Partial<Record<ReviewStepId, Partial<ReviewDecision>>>;
          selectedVariants?: Partial<Record<ReviewStepId, string>>;
          finalApproved?: unknown;
        };
        const restoredDecisions = createEmptyDecisions();
        const restoredVariants = createInitialVariants();

        for (const step of REVIEW_STEPS) {
          const storedDecision = stored.decisions?.[step.id];
          if (isReviewStatus(storedDecision?.status)) {
            restoredDecisions[step.id].status = storedDecision.status;
          }
          if (typeof storedDecision?.note === "string") {
            restoredDecisions[step.id].note = storedDecision.note;
          }

          const storedVariant = stored.selectedVariants?.[step.id];
          if (
            typeof storedVariant === "string" &&
            VARIANT_OPTIONS[step.id].some(
              (option) => option.value === storedVariant
            )
          ) {
            restoredVariants[step.id] = storedVariant;
          }
        }

        decisions = restoredDecisions;
        selectedVariants = restoredVariants;
        finalApproved =
          stored.finalApproved === true &&
          REVIEW_STEPS.every(
            (step) => restoredDecisions[step.id].status === "approved"
          );

        const restoredStepIndex = REVIEW_STEPS.findIndex(
          (step) => step.id === stored.activeStepId
        );
        if (restoredStepIndex >= 0) activeStepIndex = restoredStepIndex;

        if (
          typeof stored.viewportId === "string" &&
          VIEWPORTS.some((viewport) => viewport.id === stored.viewportId)
        ) {
          viewportId = stored.viewportId;
        }
      }
    } catch {
      storageAvailable = false;
    }

    reviewLoaded = true;
  });

  $effect(() => {
    if (isFrame || !reviewLoaded) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeStepId: activeStep.id,
          viewportId,
          decisions,
          selectedVariants,
          finalApproved,
        })
      );
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  });

  function selectStep(stepId: ReviewStepId) {
    const nextIndex = REVIEW_STEPS.findIndex((step) => step.id === stepId);
    if (nextIndex >= 0) activeStepIndex = nextIndex;
  }

  function setCurrentStatus(status: ReviewStatus) {
    decisions[activeStep.id].status = status;
    finalApproved = false;
  }

  function approveAndContinue() {
    setCurrentStatus("approved");
    if (activeStepIndex < REVIEW_STEPS.length - 1) activeStepIndex += 1;
  }

  function markNeedsChanges() {
    setCurrentStatus("needs-changes");
  }

  function updateCurrentNote(note: string) {
    decisions[activeStep.id].note = note;
  }

  function resetReview() {
    if (
      !window.confirm("Clear every Smart Collection review decision and note?")
    ) {
      return;
    }

    decisions = createEmptyDecisions();
    selectedVariants = createInitialVariants();
    activeStepIndex = 0;
    viewportId = "phone";
    finalApproved = false;
  }

  function statusLabel(status: ReviewStatus): string {
    switch (status) {
      case "approved":
        return "Approved";
      case "needs-changes":
        return "Needs changes";
      default:
        return "Not reviewed";
    }
  }

  function statusIcon(status: ReviewStatus): string {
    switch (status) {
      case "approved":
        return "fa-check";
      case "needs-changes":
        return "fa-triangle-exclamation";
      default:
        return "fa-circle";
    }
  }

  function reviewSummary(): string {
    const gate = finalGatePassed
      ? "Approved"
      : changesCount > 0
        ? "Blocked by requested changes"
        : "Awaiting approval";
    const steps = REVIEW_STEPS.flatMap((step, index) => {
      const decision = decisions[step.id];
      return [
        `## ${index + 1}. ${step.title}`,
        `Status: ${statusLabel(decision.status)}`,
        `Notes: ${decision.note.trim() || "None"}`,
        "",
      ];
    });

    return [
      "# Smart Collection redesign review",
      `Final gate: ${gate}`,
      "",
      ...steps,
    ].join("\n");
  }
</script>

<svelte:head>
  <title
    >{isSequenceActionsReview
      ? "Sequence Actions review"
      : isFrame
        ? "Smart Collection review frame"
        : "Smart Collection design review"}</title
  >
</svelte:head>

{#if isSequenceActionsReview}
  <SequenceActionsReviewPage />
{:else if isFrame}
  <SmartCollectionReviewFrame surface={frameSurface} variant={frameVariant} />
{:else}
  <main class="review-page">
    <header class="review-header">
      <div class="review-heading">
        <span class="eyebrow">Design review</span>
        <h1>Smart Collections</h1>
        <p>Approve each production surface before the final gate opens.</p>
      </div>

      <div class="header-actions">
        <span class="review-progress">
          <strong>{approvedCount}</strong> of {REVIEW_STEPS.length} approved
        </span>
        <CopyForAIButton
          getData={reviewSummary}
          variant="icon-text"
          size="md"
          idleIcon="fa-clipboard-list"
          ariaLabel="Copy Smart Collection review summary"
          labels={{
            idle: "Copy review summary",
            loading: "Preparing summary",
            success: "Review copied",
            error: "Copy failed",
          }}
          class="review-copy"
        />
      </div>
    </header>

    <div class="review-layout">
      <aside class="review-rail">
        <div class="rail-head">
          <div>
            <span>Review steps</span>
            <small>
              {storageAvailable
                ? "Saved on this device"
                : "Saved until this tab closes"}
            </small>
          </div>
          {#if changesCount > 0}
            <span class="change-count">{changesCount} open</span>
          {/if}
        </div>

        <nav aria-label="Smart Collection review steps">
          <ol class="step-list">
            {#each REVIEW_STEPS as step, index (step.id)}
              {@const decision = decisions[step.id]}
              <li>
                <button
                  type="button"
                  class="step-button"
                  class:active={activeStep.id === step.id}
                  data-status={decision.status}
                  onclick={() => selectStep(step.id)}
                  aria-current={activeStep.id === step.id ? "step" : undefined}
                >
                  <span class="step-index">{index + 1}</span>
                  <span class="step-copy">
                    <strong>{step.title}</strong>
                    <span class="step-status">
                      <i
                        class="fas {statusIcon(decision.status)}"
                        aria-hidden="true"
                      ></i>
                      {statusLabel(decision.status)}
                    </span>
                  </span>
                  <i class="fas fa-chevron-right step-arrow" aria-hidden="true"
                  ></i>
                </button>
              </li>
            {/each}
          </ol>
        </nav>

        <section
          class="final-gate"
          class:ready={allApproved}
          class:passed={finalGatePassed}
        >
          <span class="gate-icon">
            <i
              class="fas {finalGatePassed
                ? 'fa-check'
                : allApproved
                  ? 'fa-lock-open'
                  : 'fa-lock'}"
              aria-hidden="true"
            ></i>
          </span>
          <div>
            <h2>Final gate</h2>
            <p>
              {#if finalGatePassed}
                Redesign approved.
              {:else if allApproved}
                Every step is approved.
              {:else}
                {REVIEW_STEPS.length - approvedCount} steps still need approval.
              {/if}
            </p>
          </div>

          {#if finalGatePassed}
            <div class="gate-result">
              <i class="fas fa-circle-check" aria-hidden="true"></i>
              Approval recorded
            </div>
          {:else}
            <PanelButton
              variant="primary"
              fullWidth
              disabled={!allApproved}
              onclick={() => (finalApproved = true)}
            >
              <i class="fas fa-stamp" aria-hidden="true"></i>
              Approve redesign
            </PanelButton>
          {/if}
        </section>

        <PanelButton variant="secondary" fullWidth onclick={resetReview}>
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          Reset review
        </PanelButton>
      </aside>

      <section class="review-workspace" aria-labelledby="active-step-title">
        <header class="step-head">
          <div class="step-title">
            <span>Step {activeStepIndex + 1} of {REVIEW_STEPS.length}</span>
            <h2 id="active-step-title">{activeStep.title}</h2>
            <p>{activeStep.hint}</p>
          </div>
          <span class="current-status" data-status={activeDecision.status}>
            <i
              class="fas {statusIcon(activeDecision.status)}"
              aria-hidden="true"
            ></i>
            {statusLabel(activeDecision.status)}
          </span>
        </header>

        <div class="review-toolbar">
          <div class="control-group viewport-control">
            <span id="review-viewport-label">Preview viewport</span>
            <div class="viewport-options-scroll">
              <SegmentedControl
                options={VIEWPORTS.map((viewport) => ({
                  value: viewport.id,
                  label: viewport.label,
                  shortLabel: viewport.shortLabel,
                }))}
                value={viewportId}
                onchange={(value) => (viewportId = value)}
                color="accent"
                size="sm"
                semantics="radiogroup"
                ariaLabelledby="review-viewport-label"
              />
            </div>
          </div>

          {#if activeVariants.length > 0}
            <div
              class="control-group state-control"
              class:many-states={activeVariants.length > 4}
            >
              <span id="review-state-label">Component state</span>
              <div class="state-options-scroll">
                <SegmentedControl
                  options={activeVariants}
                  value={selectedVariants[activeStep.id]}
                  onchange={(value) =>
                    (selectedVariants[activeStep.id] = value)}
                  color="accent"
                  size="sm"
                  semantics="radiogroup"
                  ariaLabelledby="review-state-label"
                />
              </div>
            </div>
          {/if}
        </div>

        <section
          class="preview-panel"
          aria-label="Production component preview"
        >
          <header class="preview-head">
            <span>{selectedViewport.label}</span>
            <span>{Math.round(selectedViewport.scale * 100)}% review scale</span
            >
          </header>
          <div class="preview-scroll">
            <div
              class="viewport-shell"
              style={`--frame-width: ${selectedViewport.width}px; --frame-height: ${selectedViewport.height}px; --frame-scale: ${selectedViewport.scale}; --display-width: ${selectedViewport.width * selectedViewport.scale}px; --display-height: ${selectedViewport.height * selectedViewport.scale}px;`}
            >
              {#key `${activeStep.id}-${selectedVariants[activeStep.id]}`}
                <iframe
                  src={frameSource}
                  title={`${activeStep.title}, ${selectedViewport.label}`}
                  width={selectedViewport.width}
                  height={selectedViewport.height}
                ></iframe>
              {/key}
            </div>
          </div>
        </section>

        <section class="decision-panel" data-status={activeDecision.status}>
          <label for="review-note">
            <span>Review notes</span>
            <textarea
              id="review-note"
              rows="3"
              value={activeDecision.note}
              placeholder={activeDecision.status === "needs-changes"
                ? "Describe the change that blocks approval"
                : "Optional notes for this step"}
              oninput={(event) => updateCurrentNote(event.currentTarget.value)}
            ></textarea>
          </label>

          <div class="decision-actions">
            <PanelButton
              variant="secondary"
              disabled={activeStepIndex === 0}
              onclick={() =>
                (activeStepIndex = Math.max(0, activeStepIndex - 1))}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              Previous
            </PanelButton>

            <div class="decision-choices">
              <div
                class="needs-action"
                class:active={activeDecision.status === "needs-changes"}
              >
                <PanelButton variant="secondary" onclick={markNeedsChanges}>
                  <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                  Needs changes
                </PanelButton>
              </div>
              <div class="approve-action">
                <PanelButton variant="primary" onclick={approveAndContinue}>
                  <i class="fas fa-check" aria-hidden="true"></i>
                  {activeStepIndex < REVIEW_STEPS.length - 1
                    ? "Approve and continue"
                    : "Approve step"}
                </PanelButton>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #0b0d13;
  }

  .review-page {
    min-height: 100dvh;
    padding: clamp(16px, 2.5vw, 48px);
    background:
      radial-gradient(
        circle at 8% 0%,
        rgba(139, 108, 255, 0.14),
        transparent 28rem
      ),
      #0b0d13;
    color: var(--theme-text, #f7f8fb);
    font-family: system-ui, sans-serif;
    --theme-panel-bg: #11141c;
    --theme-card-bg: rgba(255, 255, 255, 0.045);
    --theme-card-hover-bg: rgba(255, 255, 255, 0.075);
    --theme-stroke: rgba(255, 255, 255, 0.11);
    --theme-stroke-strong: rgba(255, 255, 255, 0.2);
    --theme-text: #f7f8fb;
    --theme-text-dim: rgba(235, 239, 248, 0.66);
    --theme-accent: #8b6cff;
    --semantic-success: #36c879;
    --semantic-warning: #f2ad3b;
    --min-touch-target: 44px;
    --font-size-compact: 12px;
    --font-size-sm: 14px;
    --font-size-base: 16px;
  }

  .review-header,
  .review-layout {
    width: min(100%, var(--shell-w, min(1720px, 92vw)));
    margin-inline: auto;
  }

  .review-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: clamp(20px, 3vw, 38px);
  }

  .review-heading h1 {
    margin: 4px 0 0;
    font-size: clamp(34px, 4vw, 62px);
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .review-heading p {
    margin: 10px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  .eyebrow,
  .step-title > span,
  .control-group > span {
    color: color-mix(in srgb, var(--theme-accent) 76%, white);
    font-size: var(--font-size-compact);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  .review-progress {
    display: inline-flex;
    min-height: var(--min-touch-target);
    align-items: center;
    padding: 0 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }

  .review-progress strong {
    margin-right: 4px;
    color: var(--theme-text);
  }

  .header-actions :global(.review-copy) {
    min-width: 190px;
  }

  .review-layout {
    display: grid;
    grid-template-columns: minmax(270px, 320px) minmax(0, 1fr);
    align-items: start;
    gap: clamp(18px, 2.4vw, 36px);
  }

  .review-rail {
    display: flex;
    position: sticky;
    top: 20px;
    min-width: 0;
    flex-direction: column;
    gap: 14px;
  }

  .rail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-inline: 4px;
  }

  .rail-head > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .rail-head span {
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  .rail-head small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .change-count {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    padding: 0 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--semantic-warning) 15%, transparent);
    color: var(--semantic-warning);
    font-variant-numeric: tabular-nums;
  }

  .step-list {
    display: flex;
    margin: 0;
    padding: 0;
    flex-direction: column;
    gap: 8px;
    list-style: none;
  }

  .step-button {
    display: grid;
    width: 100%;
    min-height: 68px;
    grid-template-columns: 34px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 13px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .step-button:hover {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }

  .step-button.active {
    border-color: color-mix(in srgb, var(--theme-accent) 72%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 10%,
      var(--theme-card-bg)
    );
    box-shadow: inset 3px 0 0 var(--theme-accent);
  }

  .step-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .step-index {
    display: inline-flex;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.035);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .step-button[data-status="approved"] .step-index {
    border-color: color-mix(in srgb, var(--semantic-success) 54%, transparent);
    background: color-mix(in srgb, var(--semantic-success) 12%, transparent);
    color: var(--semantic-success);
  }

  .step-button[data-status="needs-changes"] .step-index {
    border-color: color-mix(in srgb, var(--semantic-warning) 54%, transparent);
    background: color-mix(in srgb, var(--semantic-warning) 12%, transparent);
    color: var(--semantic-warning);
  }

  .step-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .step-copy strong {
    overflow: hidden;
    font-size: var(--font-size-sm);
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .step-status i {
    width: 12px;
    font-size: 8px;
    text-align: center;
  }

  .step-button[data-status="approved"] .step-status {
    color: var(--semantic-success);
  }

  .step-button[data-status="needs-changes"] .step-status {
    color: var(--semantic-warning);
  }

  .step-arrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .final-gate {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 10px 12px;
    padding: 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 15px;
    background: var(--theme-panel-bg);
  }

  .final-gate.ready {
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  .final-gate.passed {
    border-color: color-mix(in srgb, var(--semantic-success) 56%, transparent);
    background: color-mix(
      in srgb,
      var(--semantic-success) 7%,
      var(--theme-panel-bg)
    );
  }

  .gate-icon {
    display: inline-flex;
    width: 40px;
    height: 40px;
    grid-row: 1;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
  }

  .ready .gate-icon {
    color: var(--theme-accent);
  }

  .passed .gate-icon {
    color: var(--semantic-success);
  }

  .final-gate h2 {
    margin: 0;
    font-size: var(--font-size-base);
  }

  .final-gate p {
    margin: 3px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.35;
  }

  .final-gate > :global(.panel-btn),
  .gate-result {
    grid-column: 1 / -1;
  }

  .gate-result {
    display: flex;
    min-height: var(--min-touch-target);
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--semantic-success) 13%, transparent);
    color: var(--semantic-success);
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  .review-workspace {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 20px;
    background: var(--theme-panel-bg);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
  }

  .step-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 20px;
    padding: clamp(18px, 2vw, 28px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .step-title h2 {
    margin: 5px 0 0;
    font-size: clamp(24px, 2.4vw, 36px);
    letter-spacing: -0.025em;
  }

  .step-title p {
    margin: 7px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  .current-status {
    display: inline-flex;
    min-width: 132px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 650;
    white-space: nowrap;
  }

  .current-status[data-status="approved"] {
    border-color: color-mix(in srgb, var(--semantic-success) 44%, transparent);
    color: var(--semantic-success);
  }

  .current-status[data-status="needs-changes"] {
    border-color: color-mix(in srgb, var(--semantic-warning) 48%, transparent);
    color: var(--semantic-warning);
  }

  .review-toolbar {
    display: flex;
    align-items: end;
    gap: 16px;
    padding: 14px clamp(16px, 2vw, 24px);
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 68%, transparent);
  }

  .control-group {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 7px;
  }

  .viewport-control {
    width: min(100%, 660px);
    flex: 1 1 520px;
  }

  .state-control {
    width: min(100%, 440px);
    flex: 1 1 340px;
  }

  .review-toolbar:has(.state-control.many-states) {
    flex-wrap: wrap;
  }

  .state-control.many-states {
    width: 100%;
    flex: 1 1 100%;
  }

  .state-options-scroll {
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }

  .state-control.many-states .state-options-scroll :global(.segmented-control) {
    width: max-content;
    min-width: 100%;
  }

  .state-control.many-states .state-options-scroll :global(.segment) {
    min-width: 76px;
  }

  .preview-panel {
    border-bottom: 1px solid var(--theme-stroke);
    background: #080a0f;
  }

  .preview-head {
    display: flex;
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
  }

  .preview-head span:first-child {
    color: var(--theme-text);
    font-weight: 650;
  }

  .preview-scroll {
    display: flex;
    max-height: min(72dvh, 900px);
    overflow: auto;
    padding: clamp(12px, 2vw, 26px);
  }

  .viewport-shell {
    width: var(--display-width);
    height: var(--display-height);
    flex: 0 0 auto;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: clamp(10px, 1vw, 18px);
    background: #0b0d13;
    box-shadow: 0 16px 52px rgba(0, 0, 0, 0.48);
  }

  .viewport-shell iframe {
    display: block;
    width: var(--frame-width);
    height: var(--frame-height);
    border: 0;
    transform: scale(var(--frame-scale));
    transform-origin: top left;
  }

  .decision-panel {
    display: grid;
    gap: 14px;
    padding: clamp(16px, 2vw, 24px);
    background: color-mix(in srgb, var(--theme-card-bg) 48%, transparent);
  }

  .decision-panel[data-status="needs-changes"] {
    box-shadow: inset 4px 0 0 var(--semantic-warning);
  }

  .decision-panel[data-status="approved"] {
    box-shadow: inset 4px 0 0 var(--semantic-success);
  }

  .decision-panel label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 650;
  }

  .decision-panel textarea {
    width: 100%;
    min-height: 86px;
    resize: vertical;
    padding: 12px 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    outline: none;
    background: #0b0d13;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: 400;
    line-height: 1.45;
  }

  .decision-panel textarea::placeholder {
    color: var(--theme-text-dim);
  }

  .decision-panel textarea:focus-visible {
    border-color: var(--theme-accent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 16%, transparent);
  }

  .decision-actions,
  .decision-choices {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .decision-actions {
    justify-content: space-between;
  }

  .needs-action,
  .approve-action {
    display: flex;
  }

  .needs-action :global(.panel-btn) {
    min-width: 148px;
  }

  .needs-action.active :global(.panel-btn) {
    border-color: var(--semantic-warning);
    background: color-mix(
      in srgb,
      var(--semantic-warning) 12%,
      var(--theme-card-bg)
    );
    color: var(--semantic-warning);
  }

  .approve-action :global(.panel-btn) {
    min-width: 202px;
  }

  @media (max-width: 900px) {
    .review-header {
      align-items: stretch;
      flex-direction: column;
    }

    .header-actions {
      justify-content: flex-start;
    }

    .review-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .review-rail {
      position: static;
    }

    .step-list {
      flex-direction: row;
      overflow-x: auto;
      padding: 2px 2px 8px;
      scroll-snap-type: x proximity;
    }

    .step-list li {
      min-width: min(250px, 76vw);
      scroll-snap-align: start;
    }

    .final-gate {
      grid-template-columns: 40px minmax(0, 1fr) minmax(190px, 0.55fr);
      align-items: center;
    }

    .final-gate > :global(.panel-btn),
    .gate-result {
      grid-column: 3;
      grid-row: 1;
    }

    .review-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .viewport-control,
    .state-control {
      width: 100%;
      flex: none;
    }
  }

  @media (max-width: 560px) {
    .review-page {
      padding: 12px;
    }

    .review-heading h1 {
      font-size: 34px;
    }

    .header-actions {
      display: grid;
      grid-template-columns: 1fr;
    }

    .review-progress,
    .header-actions :global(.review-copy) {
      width: 100%;
      justify-content: center;
    }

    .final-gate {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .final-gate > :global(.panel-btn),
    .gate-result {
      grid-column: 1 / -1;
      grid-row: auto;
    }

    .review-workspace {
      border-radius: 16px;
    }

    .step-head {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }

    .current-status {
      align-self: flex-start;
    }

    .review-toolbar {
      padding: 12px;
    }

    .viewport-options-scroll {
      overflow-x: auto;
      overscroll-behavior-inline: contain;
    }

    .viewport-options-scroll :global(.segmented-control) {
      min-width: 330px;
    }

    .preview-scroll {
      padding: 10px;
    }

    .decision-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .decision-actions > :global(.panel-btn) {
      width: 100%;
    }

    .decision-choices {
      display: grid;
      grid-template-columns: 1fr;
    }

    .needs-action,
    .approve-action,
    .needs-action :global(.panel-btn),
    .approve-action :global(.panel-btn) {
      width: 100%;
    }
  }

  @media (min-width: 700px) and (max-height: 520px) {
    .review-page {
      padding: 10px 14px 18px;
    }

    .review-header {
      align-items: center;
      margin-bottom: 12px;
    }

    .review-heading h1 {
      font-size: 32px;
    }

    .review-heading p {
      display: none;
    }

    .review-layout {
      grid-template-columns: 250px minmax(0, 1fr);
    }

    .review-rail {
      position: sticky;
      top: 10px;
      max-height: calc(100dvh - 20px);
      overflow-y: auto;
    }

    .step-list {
      flex-direction: column;
      overflow: visible;
      padding: 0;
    }

    .step-list li {
      min-width: 0;
    }

    .step-button {
      min-height: 54px;
      grid-template-columns: 28px minmax(0, 1fr) 14px;
      padding: 7px 9px;
    }

    .step-index {
      width: 26px;
      height: 26px;
    }

    .final-gate {
      grid-template-columns: 34px minmax(0, 1fr);
    }

    .final-gate > :global(.panel-btn),
    .gate-result {
      grid-column: 1 / -1;
      grid-row: auto;
    }

    .step-head {
      padding: 14px 16px;
    }

    .step-title h2 {
      font-size: 24px;
    }

    .review-toolbar {
      padding: 8px 12px;
    }

    .preview-scroll {
      max-height: 300px;
    }
  }

  @media (min-width: 1680px) {
    .review-layout {
      grid-template-columns: minmax(320px, 370px) minmax(0, 1fr);
    }
  }

  @media (min-width: 2600px) {
    .review-page {
      --font-size-compact: clamp(12px, 0.38vw, 16px);
      --font-size-sm: clamp(14px, 0.44vw, 18px);
      --font-size-base: clamp(16px, 0.5vw, 20px);
      --min-touch-target: clamp(44px, 1.35vw, 56px);
    }

    .review-layout {
      grid-template-columns: minmax(400px, 470px) minmax(0, 1fr);
    }

    .step-button {
      min-height: 84px;
      grid-template-columns: 46px minmax(0, 1fr) 20px;
      padding: 14px 16px;
    }

    .step-index {
      width: 42px;
      height: 42px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-button {
      transition: none;
    }
  }
</style>
