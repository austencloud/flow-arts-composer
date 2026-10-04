<script lang="ts">
  import type { SeoDashboardSnapshot } from "$lib/features/admin/domain/models/seo-dashboard-model";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import {
    formatCriterion,
    formatDate,
    formatInteger,
    formatPercent,
    getSeoOutcomeStatus,
    type SeoOutcomeStatus,
  } from "./seo-dashboard-format";

  const PLAIN_LABELS: Record<string, string> = {
    treatment_impressions: "Enough Google appearances",
    treatment_clicks: "Enough visits from Google",
    adjusted_impression_lift: "Visibility grew against comparison pages",
    adjusted_click_lift: "Google visits grew against comparison pages",
    head_term_position: "“Flow arts software” moved high enough",
    indexed_sample_rate: "Google indexed enough sample pages",
    organic_activation_rate: "Enough search visitors started creating",
    head_term_ai_citation_rank: "TKA ranked high enough in the AI answer",
    ai_overview_citation_rate: "Enough AI answers mentioned TKA",
    independent_sites: "Independent sites mention TKA or Composer",
    composer_specific_sites: "Independent sites describe Composer",
    linked_sites: "Independent sites link to TKA",
  };

  type EvidenceView = "summary" | "exact";

  const OUTCOME_GROUPS = [
    {
      label: "Search visitors start creating",
      note: "Traffic only counts when people use the Composer.",
      criterionIds: ["organic_activation_rate"],
    },
    {
      label: "Google can use the pages",
      note: "The tracked pages must be indexed and searchable.",
      criterionIds: ["indexed_sample_rate"],
    },
  ] as const;

  let {
    snapshot,
    view = "summary",
  }: { snapshot: SeoDashboardSnapshot; view?: EvidenceView } = $props();

  const passCount = $derived(
    snapshot.decision.criteria.filter(
      (criterion) => criterion.status === "pass"
    ).length
  );
  const milestonePassCount = $derived(
    snapshot.milestones.filter((milestone) => milestone.status === "pass")
      .length
  );
  const activeSources = $derived(
    snapshot.reputation.sources.filter((source) => source.status === "active")
  );

  const visibilityOutcome = $derived(
    snapshot.evaluationMode === "visibility_emergence"
      ? {
          label: "People see and visit TKA pages",
          note: "Google appearances and visits must reach fixed targets.",
          criterionIds: ["treatment_impressions", "treatment_clicks"],
        }
      : {
          label: "More people see and visit TKA pages",
          note: "Google appearances and clicks both rise.",
          criterionIds: [
            "treatment_impressions",
            "adjusted_impression_lift",
            "adjusted_click_lift",
          ],
        }
  );

  const outcomes = $derived(
    [visibilityOutcome, ...OUTCOME_GROUPS].map((group) => ({
      ...group,
      status: getSeoOutcomeStatus(
        snapshot.decision.criteria,
        group.criterionIds
      ),
    }))
  );
  const passedOutcomeCount = $derived(
    outcomes.filter((outcome) => outcome.status === "pass").length
  );

  function outcomeLabel(status: SeoOutcomeStatus): string {
    if (status === "pass") return "Met";
    if (status === "fail") return "Missed";
    return "Waiting";
  }

  function milestoneLabel(
    status: SeoDashboardSnapshot["milestones"][number]["status"]
  ): string {
    if (status === "pass") return "Reached";
    if (status === "fail") return "Building";
    return "Waiting";
  }

  function milestoneValue(
    milestone: SeoDashboardSnapshot["milestones"][number]
  ): string {
    if (milestone.actual !== null) return formatCriterion(milestone);
    if (milestone.id === "head_term_position") return "Not found";
    if (milestone.id === "head_term_ai_citation_rank") return "No AI answer";
    if (milestone.id === "ai_overview_citation_rate") return "No AI answers";
    return "Waiting";
  }

  function targetText(
    criterion: SeoDashboardSnapshot["decision"]["criteria"][number]
  ): string {
    if (criterion.unit === "ratio") {
      return "Goal: " + formatPercent(criterion.target);
    }
    if (criterion.unit === "position") {
      return "Goal: position " + criterion.target + " or better";
    }
    return "Goal: " + formatInteger(criterion.target);
  }
</script>

{#if view === "summary"}
  <section class="panel" aria-labelledby="gates-title">
    <div class="panel-heading">
      <div>
        <span class="panel-kicker">A real win</span>
        <h3 id="gates-title">What must improve?</h3>
      </div>
      <span class="gate-count">
        {snapshot.decision.criteria.length === 0
          ? "Checked later"
          : `${passedOutcomeCount}/${outcomes.length} required`}
      </span>
    </div>
    <p class="panel-explanation">
      {snapshot.evaluationMode === "visibility_emergence"
        ? "The pre-launch count was zero. These checks decide whether Google discovery produced real use."
        : "One good-looking number is not enough. These outcomes have to agree."}
    </p>

    <ul class="outcome-list">
      {#each outcomes as outcome (outcome.label)}
        <li class="outcome outcome-{outcome.status}">
          <span class="outcome-mark" aria-hidden="true">
            <i
              class="fas {outcome.status === 'pass'
                ? 'fa-check'
                : outcome.status === 'fail'
                  ? 'fa-xmark'
                  : 'fa-hourglass-half'}"
            ></i>
          </span>
          <div class="outcome-copy">
            <strong>{outcome.label}</strong>
            <span>{outcome.note}</span>
          </div>
          <span class="outcome-state">{outcomeLabel(outcome.status)}</span>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="panel exact-panel" aria-labelledby="exact-gates-title">
    <div class="panel-heading">
      <div>
        <span class="panel-kicker">Technical checks</span>
        <h3 id="exact-gates-title">Exact pass or fail rules</h3>
      </div>
      {#if snapshot.decision.criteria.length > 0}
        <span class="gate-count">
          {passCount}/{snapshot.decision.criteria.length} required
        </span>
      {/if}
    </div>
    <p class="panel-explanation">
      These checks decide the experiment. Phrase rank, AI citations, and
      independent reputation are tracked separately below.
    </p>

    {#if snapshot.decision.criteria.length === 0}
      <div class="exact-empty">
        The thresholds appear after the launch date and Google page check are
        complete.
      </div>
    {:else}
      <ul class="criteria-list">
        {#each snapshot.decision.criteria as criterion (criterion.id)}
          <li class="criterion criterion-{criterion.status}">
            <span class="criterion-mark" aria-hidden="true">
              <i
                class="fas {criterion.status === 'pass'
                  ? 'fa-check'
                  : criterion.status === 'fail'
                    ? 'fa-xmark'
                    : 'fa-ellipsis'}"
              ></i>
            </span>
            <div class="criterion-copy">
              <strong>{PLAIN_LABELS[criterion.id] ?? criterion.label}</strong>
              <span>{targetText(criterion)}</span>
            </div>
            <span class="criterion-value">{formatCriterion(criterion)}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if snapshot.milestones.length > 0}
      <div class="subsection-heading">
        <div>
          <span class="panel-kicker">Campaign milestones</span>
          <h4>Important, but not kill switches</h4>
        </div>
        <span class="gate-count">
          {milestonePassCount}/{snapshot.milestones.length} reached
        </span>
      </div>
      <p class="subsection-explanation">
        A missed milestone shows what to build next. It does not erase broader
        Google growth.
      </p>
      <ul class="criteria-list milestone-list">
        {#each snapshot.milestones as milestone (milestone.id)}
          <li
            class="criterion criterion-milestone criterion-{milestone.status}"
          >
            <span class="criterion-mark" aria-hidden="true">
              <i
                class="fas {milestone.status === 'pass'
                  ? 'fa-check'
                  : milestone.status === 'fail'
                    ? 'fa-arrow-trend-up'
                    : 'fa-ellipsis'}"
              ></i>
            </span>
            <div class="criterion-copy">
              <strong>{PLAIN_LABELS[milestone.id] ?? milestone.label}</strong>
              <span>{targetText(milestone)}</span>
            </div>
            <span class="criterion-value">
              {milestoneValue(milestone)} · {milestoneLabel(milestone.status)}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="subsection-heading reputation-heading">
      <div>
        <span class="panel-kicker">Reputation ledger</span>
        <h4>Which independent sites count?</h4>
      </div>
      <span
        class:overdue={snapshot.reputation.reviewOverdue}
        class="gate-count"
      >
        {snapshot.reputation.reviewOverdue ? "Review due" : "Current"}
      </span>
    </div>
    <p class="subsection-explanation">
      {#if snapshot.reputation.lastReviewedDate}
        Last checked {formatDate(snapshot.reputation.lastReviewedDate)}.
      {:else}
        No reputation review has been logged yet.
      {/if}
      Each website counts once. TKA pages and automatic domain listings do not count.
    </p>
    {#if activeSources.length === 0}
      <div class="exact-empty">No active independent sources are logged.</div>
    {:else}
      <ul class="source-list">
        {#each activeSources as source (source.id)}
          <li>
            <p>
              <LinkChip size="inline" href={source.sourceUrl}>
                {source.publisher}
              </LinkChip>
              <span> · {source.context}</span>
            </p>
            <small>
              {source.mentionScope === "composer"
                ? "Composer-specific"
                : "TKA mention"}
              · {source.linksToTka ? "Links to TKA" : "No TKA link"}
            </small>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .panel {
    container-type: inline-size;
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    padding: clamp(14px, 1.2vw, 20px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(15, 23, 42, 0.74));
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-kicker {
    color: var(--semantic-seo-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h3 {
    margin: 3px 0 0;
    font-size: clamp(1rem, 0.92rem + 0.35vw, 1.25rem);
  }

  .gate-count {
    min-width: 5.5rem;
    padding: 5px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 7%, transparent);
    text-align: center;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .panel-explanation {
    margin: 10px 0 12px;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.62));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  .outcome-list {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-rows: repeat(3, minmax(62px, 1fr));
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .outcome {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 4.8rem;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
  }

  .outcome-mark {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--semantic-seo-violet) 13%, transparent);
    color: var(--semantic-seo-violet);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .outcome-pass .outcome-mark {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .outcome-fail .outcome-mark {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .outcome-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .outcome-copy strong {
    font-size: var(--font-size-min, 0.875rem);
  }

  .outcome-copy span {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.3;
  }

  .outcome-state {
    min-width: 4.8rem;
    padding: 5px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 5%, transparent);
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.6));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    text-align: center;
  }

  .outcome-pass .outcome-state {
    color: var(--semantic-success, #22c55e);
  }

  .outcome-fail .outcome-state {
    color: var(--semantic-error, #ef4444);
  }

  .exact-panel {
    height: auto;
  }

  .exact-empty {
    padding: 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.62));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  .criteria-list {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .subsection-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .subsection-heading h4 {
    margin: 3px 0 0;
    font-size: var(--font-size-min, 0.875rem);
  }

  .subsection-explanation {
    margin: 8px 0 10px;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
  }

  .milestone-list {
    overflow: visible;
  }

  .criterion-milestone.criterion-fail .criterion-mark {
    color: var(--semantic-seo-violet);
  }

  .criterion-milestone .criterion-value {
    min-width: 15ch;
  }

  .reputation-heading .gate-count.overdue {
    color: var(--semantic-error, #ef4444);
  }

  .source-list {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .source-list li {
    padding: 10px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--theme-text, #fff) 4%, transparent);
  }

  .source-list p {
    margin: 0;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
    --theme-accent: var(--semantic-seo-accent);
  }

  .source-list small {
    display: block;
    margin-top: 4px;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.52));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .criterion {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--theme-text, #fff) 4%, transparent);
  }

  .criterion-mark {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, #fff) 7%, transparent);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .criterion-pass .criterion-mark {
    color: var(--semantic-success, #22c55e);
  }

  .criterion-fail .criterion-mark {
    color: var(--semantic-error, #ef4444);
  }

  .criterion-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .criterion-copy strong {
    font-size: var(--font-size-compact, 0.75rem);
  }

  .criterion-copy span,
  .criterion-value {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.56));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .criterion-value {
    min-width: 7ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  @container (max-width: 520px) {
    .panel-heading {
      flex-direction: column;
    }

    .outcome-list {
      grid-template-rows: none;
    }

    .outcome {
      grid-template-columns: 30px minmax(0, 1fr);
    }

    .outcome-state {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
