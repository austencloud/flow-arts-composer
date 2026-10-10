<script lang="ts">
  import type { SeoDashboardSnapshot } from "#lib/features/admin/domain/models/seo-dashboard-model.js";
  import {
    formatDate,
    formatInteger,
    getSeoAutomationStory,
    getSeoGrowthStory,
    getKnownCategorySearchMetrics,
  } from "./seo-dashboard-format";

  let { snapshot }: { snapshot: SeoDashboardSnapshot } = $props();

  const activeSearch = $derived(
    snapshot.search.current ?? snapshot.search.baseline
  );
  const categorySearch = $derived(getKnownCategorySearchMetrics(snapshot));
  const growth = $derived(getSeoGrowthStory(snapshot));
  const automation = $derived(getSeoAutomationStory(snapshot));

  const ownerAction = $derived.by(() => {
    if (!automation.healthy) {
      return {
        value: "Check it",
        note: "Open the nerd stuff and check the daily workflow.",
      };
    }
    if (
      snapshot.phase === "baseline" &&
      !snapshot.experimentDates.deploymentDate
    ) {
      return {
        value: "Start it",
        note: "Record the day the SEO changes went live.",
      };
    }
    if (
      snapshot.reputation.lastReviewedDate &&
      snapshot.reputation.reviewOverdue
    ) {
      return {
        value: "Review mentions",
        note: "The independent-site list is due for its monthly check.",
      };
    }
    return { value: "Nothing", note: growth.nextStep };
  });

  const nextAnswer = $derived.by(() => {
    if (snapshot.phase === "confirmed") {
      return { value: "Done", note: "The final result is saved." };
    }
    if (snapshot.phase === "baseline") {
      return {
        value: "Not started",
        note: "Starts when the SEO changes go live.",
      };
    }
    if (snapshot.phase === "awaiting_indexing") {
      return {
        value: "Waiting",
        note: "Starts when Google finds the pages.",
      };
    }

    const window =
      snapshot.currentWindow === "confirmation"
        ? snapshot.windows.confirmation
        : snapshot.windows.primary;
    if (!window) {
      return { value: "Next check", note: "The date will appear here." };
    }
    return {
      value: formatDate(window.end),
      note:
        snapshot.currentWindow === "confirmation"
          ? "The proof check ends."
          : "The first 28-day check ends.",
    };
  });
</script>

<section class="one-glance" aria-label="SEO answer">
  <article class="verdict-card growth-{growth.tone}">
    <div class="verdict-heading">
      <span class="heading-icon" aria-hidden="true">
        <i class="fas fa-compass"></i>
      </span>
      <span>Is it working?</span>
    </div>

    <div class="verdict-main">
      <strong class="verdict-value">{growth.value}</strong>
      <div class="verdict-copy">
        <h3>{growth.headline}</h3>
        <p>{growth.explanation}</p>
      </div>
    </div>

    <div class="proof-row" aria-label="Why this is the answer">
      <div class="proof-item">
        <span>Tracked pages in Google</span>
        <strong>{formatInteger(activeSearch.impressions)} appearances</strong>
      </div>
      <div class="proof-item">
        <span>Known category searches</span>
        <strong>{formatInteger(categorySearch.impressions)} appearances</strong>
      </div>
      <div class="proof-item">
        <span>Independent sites</span>
        <strong>
          {snapshot.reputation.lastReviewedDate
            ? `${formatInteger(snapshot.reputation.independentSites)} known`
            : "Not loaded"}
        </strong>
      </div>
    </div>
  </article>

  <div class="plain-answers">
    <article class="plain-card action-card">
      <span class="plain-icon" aria-hidden="true">
        <i class="fas fa-hand"></i>
      </span>
      <div class="plain-copy">
        <span class="plain-question">What do I do?</span>
        <strong>{ownerAction.value}</strong>
        <p>{ownerAction.note}</p>
      </div>
    </article>

    <article class="plain-card">
      <span class="plain-icon" aria-hidden="true">
        <i class="fas fa-calendar-day"></i>
      </span>
      <div class="plain-copy">
        <span class="plain-question">When do I know more?</span>
        <strong>{nextAnswer.value}</strong>
        <p>{nextAnswer.note}</p>
      </div>
    </article>

    <article class:late={!automation.healthy} class="plain-card">
      <span class="plain-icon" aria-hidden="true">
        <i
          class="fas {automation.healthy
            ? 'fa-circle-check'
            : 'fa-triangle-exclamation'}"
        ></i>
      </span>
      <div class="plain-copy">
        <span class="plain-question">Is this page staying current?</span>
        <strong>{automation.value}</strong>
        <p>Last checked {formatDate(snapshot.generatedDate)}.</p>
      </div>
    </article>
  </div>
</section>

<style>
  .one-glance {
    display: grid;
    height: 100%;
    min-height: 420px;
    grid-template-columns: minmax(520px, 1.35fr) minmax(340px, 0.65fr);
    gap: clamp(10px, 0.8vw, 14px);
  }

  .verdict-card,
  .plain-card {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    background: var(--theme-card-bg, rgba(15, 23, 42, 0.8));
  }

  .verdict-card {
    display: flex;
    min-height: 420px;
    flex-direction: column;
    padding: clamp(22px, 2vw, 38px);
    border-color: color-mix(
      in srgb,
      var(--semantic-seo-accent) 44%,
      transparent
    );
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--semantic-seo-accent) 12%, transparent),
        transparent 62%
      ),
      var(--theme-card-bg, rgba(15, 23, 42, 0.84));
  }

  .verdict-card::after {
    position: absolute;
    inset: auto -70px -100px auto;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--semantic-seo-accent) 7%, transparent);
    content: "";
  }

  .growth-positive {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 55%,
      transparent
    );
  }

  .growth-negative {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      transparent
    );
  }

  .verdict-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.72));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 800;
  }

  .heading-icon,
  .plain-icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 10px;
    background: color-mix(in srgb, var(--semantic-seo-accent) 14%, transparent);
    color: var(--semantic-seo-accent);
  }

  .verdict-main {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: clamp(16px, 1.6vw, 28px);
    padding: clamp(24px, 3cqh, 44px) 0;
  }

  .verdict-value {
    font-size: clamp(3.5rem, 2.2rem + 3.2vw, 7rem);
    line-height: 0.88;
    letter-spacing: -0.055em;
    font-variant-numeric: tabular-nums;
  }

  .verdict-copy h3 {
    margin: 0;
    font-size: clamp(1.25rem, 1rem + 0.7vw, 2rem);
    line-height: 1.15;
  }

  .verdict-copy p {
    max-width: 52rem;
    margin: 8px 0 0;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.66));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .proof-row {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
  }

  .proof-item {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
    padding: 14px 16px;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .proof-item:first-child {
    border-left: 0;
  }

  .proof-item span {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.58));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .proof-item strong {
    overflow: hidden;
    font-size: var(--font-size-min, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plain-answers {
    display: grid;
    min-height: 0;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: clamp(10px, 0.8vw, 14px);
  }

  .plain-card {
    display: grid;
    min-height: 124px;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
    gap: 15px;
    padding: clamp(16px, 1.3vw, 24px);
  }

  .action-card {
    border-color: color-mix(
      in srgb,
      var(--semantic-seo-accent) 34%,
      transparent
    );
    background:
      linear-gradient(
        110deg,
        color-mix(in srgb, var(--semantic-seo-accent) 8%, transparent),
        transparent 60%
      ),
      var(--theme-card-bg, rgba(15, 23, 42, 0.8));
  }

  .plain-card.late {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      transparent
    );
  }

  .plain-card.late .plain-icon {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 14%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .plain-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .plain-question {
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.65));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .plain-copy strong {
    font-size: clamp(1.6rem, 1.15rem + 1vw, 2.6rem);
    line-height: 1;
    letter-spacing: -0.035em;
    font-variant-numeric: tabular-nums;
  }

  .plain-copy p {
    margin: 2px 0 0;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.58));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.35;
  }

  @container seo-center (max-width: 1050px) {
    .one-glance {
      height: auto;
      grid-template-columns: 1fr;
    }

    .plain-answers {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: none;
    }

    .plain-card {
      min-height: 150px;
      grid-template-columns: 1fr;
      align-content: start;
    }
  }

  @container seo-center (max-width: 680px) {
    .verdict-card,
    .one-glance {
      min-height: 0;
    }

    .plain-answers,
    .proof-row {
      grid-template-columns: 1fr;
    }

    .proof-item {
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      border-left: 0;
    }

    .proof-item:first-child {
      border-top: 0;
    }

    .verdict-value {
      white-space: normal;
    }
  }
</style>
