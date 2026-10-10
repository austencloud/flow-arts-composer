import type { SeoDashboardSnapshot } from "#lib/features/admin/domain/models/seo-dashboard-model.js";

const integerFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatInteger(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "Not measured"
    : integerFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not measured";
  const percentage = value * 100;
  const digits = Number.isInteger(percentage) ? 0 : 1;
  return `${percentage.toFixed(digits)}%`;
}

export function formatPosition(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "Not ranked"
    : value.toFixed(1);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not registered";
  return dateFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

export function formatLift(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Baseline";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}% vs control`;
}

const CATEGORY_QUERY_GROUP_IDS = new Set([
  "software_category",
  "notation_category",
]);

export interface SeoCategorySearchMetrics {
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
}

/**
 * Named category queries are a useful lower-bound diagnostic. The broader
 * treatment-page total remains the primary signal because Search Console does
 * not expose every query.
 */
export function getKnownCategorySearchMetrics(
  snapshot: Pick<SeoDashboardSnapshot, "queryGroups" | "search">
): SeoCategorySearchMetrics {
  const useCurrentWindow = snapshot.search.current !== null;
  const metrics = snapshot.queryGroups
    .filter((group) => CATEGORY_QUERY_GROUP_IDS.has(group.id))
    .map((group) => (useCurrentWindow ? group.current : group.baseline))
    .filter((group): group is NonNullable<typeof group> => group !== null);
  const clicks = metrics.reduce((total, group) => total + group.clicks, 0);
  const impressions = metrics.reduce(
    (total, group) => total + group.impressions,
    0
  );
  const weightedPosition = metrics.reduce(
    (total, group) => total + (group.position ?? 0) * group.impressions,
    0
  );

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? weightedPosition / impressions : null,
  };
}

export type SeoGrowthTone = "waiting" | "positive" | "negative" | "neutral";

export interface SeoGrowthStory {
  value: string;
  headline: string;
  explanation: string;
  nextStep: string;
  tone: SeoGrowthTone;
}

export interface SeoAutomationStory {
  healthy: boolean;
  value: "On" | "Late";
  headline: string;
  explanation: string;
}

const MAX_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * A daily collector should never make the owner wonder whether this screen is
 * still alive. Two missed days turn the quiet success state into a warning.
 */
export function getSeoAutomationStory(
  snapshot: Pick<SeoDashboardSnapshot, "generatedAt">,
  now = new Date()
): SeoAutomationStory {
  const generatedAt = Date.parse(snapshot.generatedAt);
  const age = now.getTime() - generatedAt;
  const healthy =
    Number.isFinite(generatedAt) &&
    age >= -MAX_FUTURE_CLOCK_SKEW_MS &&
    age <= MAX_SNAPSHOT_AGE_MS;

  if (healthy) {
    return {
      healthy: true,
      value: "On",
      headline: "Nothing to do.",
      explanation: "A fresh reading is saved every morning.",
    };
  }

  return {
    healthy: false,
    value: "Late",
    headline: "The daily check needs attention.",
    explanation: "No fresh reading has been saved in the last two days.",
  };
}

function formatGrowth(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

/**
 * Turns the experiment state into the one answer the dashboard should lead
 * with. Supporting metrics can explain the verdict after it is understood.
 */
export function getSeoGrowthStory(
  snapshot: SeoDashboardSnapshot
): SeoGrowthStory {
  if (snapshot.phase === "baseline") {
    return {
      value: "Not started",
      headline: "The SEO clock has not started.",
      explanation: "Today's numbers are the before picture.",
      nextStep: snapshot.experimentDates.deploymentDate
        ? "The daily check will tell you when Google finds the pages."
        : "Record the day the SEO changes went live.",
      tone: "waiting",
    };
  }

  if (snapshot.phase === "awaiting_indexing") {
    return {
      value: "Not yet",
      headline: "Google is still finding the updated pages.",
      explanation: "This page checks them every morning.",
      nextStep: "The first growth check starts automatically.",
      tone: "waiting",
    };
  }

  if (snapshot.evaluationMode === "visibility_emergence") {
    const impressions = snapshot.search.current?.impressions;
    if (impressions === null || impressions === undefined) {
      return {
        value: "Waiting",
        headline: "Google found the page. Its first number is not ready.",
        explanation: "Google's search numbers arrive about three days late.",
        nextStep: "The daily check will pick it up.",
        tone: "waiting",
      };
    }

    const targetMet =
      snapshot.decision.status === "primary_target_met" ||
      snapshot.decision.status === "confirmed_target_met";
    const targetMissed = snapshot.decision.status === "below_target";
    const hasVisibility = impressions > 0;
    return {
      value: hasVisibility
        ? `${formatInteger(impressions)} appearances`
        : "Not yet",
      headline: targetMet
        ? "The visibility target was met."
        : targetMissed
          ? "The measurement window missed its target."
          : hasVisibility
            ? "Google has started showing the tracked pages."
            : "Google has not shown the tracked pages yet.",
      explanation: hasVisibility
        ? `That is ${formatInteger(impressions)} more appearances than before launch.`
        : "The check is running. Google's search numbers arrive about three days late.",
      nextStep:
        snapshot.phase === "confirmed"
          ? "Done. The result is saved."
          : snapshot.phase === "primary_complete"
            ? "The proof check runs next."
            : "This page checks again every morning.",
      tone: targetMet
        ? "positive"
        : targetMissed
          ? "negative"
          : hasVisibility
            ? "positive"
            : "waiting",
    };
  }

  const impressionLift = snapshot.search.controlAdjusted?.impressionLift;
  if (impressionLift === null || impressionLift === undefined) {
    return {
      value: "Measuring now",
      headline: "The before-and-after check is running.",
      explanation:
        "The updated pages are being compared with the starting point and with similar pages left unchanged.",
      nextStep: "Let the measurement window finish.",
      tone: "waiting",
    };
  }

  const tone: SeoGrowthTone =
    impressionLift > 0.005
      ? "positive"
      : impressionLift < -0.005
        ? "negative"
        : "neutral";
  const headline =
    snapshot.phase === "confirmed"
      ? tone === "positive"
        ? "The increase held up twice."
        : "The second check is complete."
      : tone === "positive"
        ? "The first comparison points upward."
        : tone === "negative"
          ? "The first comparison points downward."
          : "The first comparison shows no clear movement.";

  return {
    value: formatGrowth(impressionLift),
    headline,
    explanation:
      "This percentage removes movement also seen on similar pages that were left unchanged.",
    nextStep:
      snapshot.phase === "confirmed"
        ? "The full before-and-after test is complete."
        : snapshot.phase === "primary_complete"
          ? "Repeat the check with fresh dates before trusting the result."
          : "Let the measurement window finish.",
    tone,
  };
}

export interface SeoHistoryStory {
  headline: string;
  explanation: string;
  tone: SeoGrowthTone;
}

export type SeoOutcomeStatus = "pass" | "fail" | "waiting";

export function getSeoOutcomeStatus(
  criteria: readonly SeoDashboardSnapshot["decision"]["criteria"][number][],
  criterionIds: readonly string[]
): SeoOutcomeStatus {
  const checks = criteria.filter((criterion) =>
    criterionIds.includes(criterion.id)
  );
  if (checks.some((criterion) => criterion.status === "fail")) return "fail";
  if (
    checks.length === criterionIds.length &&
    checks.every((criterion) => criterion.status === "pass")
  ) {
    return "pass";
  }
  return "waiting";
}

export function getSeoHistoryStory(
  history: readonly {
    phase: SeoDashboardSnapshot["phase"];
    treatmentImpressions: number;
  }[]
): SeoHistoryStory {
  if (history.length === 0) {
    return {
      headline: "No readings yet",
      explanation: "The first measurement run will save a starting number.",
      tone: "waiting",
    };
  }

  const first = history[0];
  const latest = history[history.length - 1];
  if (!first || !latest) {
    return {
      headline: "No readings yet",
      explanation: "The first measurement run will save a starting number.",
      tone: "waiting",
    };
  }

  if (latest.phase === "baseline") {
    return {
      headline: "Still setting the starting point",
      explanation:
        history.length === 1
          ? `${formatInteger(latest.treatmentImpressions)} Google appearances recorded. This is not a growth result yet.`
          : `${history.length} starting-point readings are saved. They do not measure growth yet.`,
      tone: "waiting",
    };
  }

  if (history.length === 1) {
    return {
      headline: "One reading saved",
      explanation: `${formatInteger(latest.treatmentImpressions)} Google appearances. Another reading is needed to show movement.`,
      tone: "waiting",
    };
  }

  const difference = latest.treatmentImpressions - first.treatmentImpressions;
  if (difference === 0) {
    return {
      headline: "No movement yet",
      explanation: `Google appearances stayed at ${formatInteger(latest.treatmentImpressions)} from the first reading to the latest.`,
      tone: "neutral",
    };
  }

  const direction = difference > 0 ? "more" : "fewer";
  return {
    headline:
      difference > 0
        ? "Google appearances increased"
        : "Google appearances decreased",
    explanation: `${formatInteger(Math.abs(difference))} ${direction} appearances than the first reading.`,
    tone: difference > 0 ? "positive" : "negative",
  };
}

export function formatCriterion(
  criterion: SeoDashboardSnapshot["decision"]["criteria"][number]
): string {
  if (criterion.actual === null) return "Waiting";
  if (criterion.unit === "ratio") return formatPercent(criterion.actual);
  if (criterion.unit === "position") return criterion.actual.toFixed(1);
  return formatInteger(criterion.actual);
}
