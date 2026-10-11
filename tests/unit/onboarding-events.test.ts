import { beforeEach, describe, expect, it, vi } from "vitest";

const captureWhenReady = vi.hoisted(() => vi.fn());

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady,
}));

import {
  logOnboardingTutorialAccepted,
  logOnboardingTutorialDeclined,
  logOnboardingTutorialIgnored,
  logOnboardingTutorialOffered,
  logOnboardingTutorialPromptViewed,
  logOnboardingTutorialSkipped,
  logOnboardingTutorialStepCompleted,
  logOnboardingTutorialStepViewed,
  logGenerateTourOfferViewed,
  logGenerateTourAccepted,
  logGenerateTourDeclined,
  logAccountSetupNameSave,
} from "#lib/shared/analytics/services/onboarding-events.js";

describe("onboarding events", () => {
  beforeEach(() => captureWhenReady.mockClear());

  it("queues the complete tutorial-offer decision funnel until PostHog is ready", () => {
    logOnboardingTutorialOffered({ source: "app_entry" });
    logOnboardingTutorialPromptViewed({ source: "app_entry" });
    logOnboardingTutorialAccepted({ source: "app_entry" });
    logOnboardingTutorialDeclined({ source: "app_entry" });
    logOnboardingTutorialIgnored({
      source: "app_entry",
      reason: "offer_unmounted",
      visible_ms: 4_200,
    });

    expect(captureWhenReady.mock.calls).toEqual([
      ["onboarding_tutorial_offered", { source: "app_entry" }],
      ["onboarding_tutorial_prompt_viewed", { source: "app_entry" }],
      ["onboarding_tutorial_accepted", { source: "app_entry" }],
      ["onboarding_tutorial_declined", { source: "app_entry" }],
      [
        "onboarding_tutorial_ignored",
        {
          source: "app_entry",
          reason: "offer_unmounted",
          visible_ms: 4_200,
        },
      ],
    ]);
  });

  it("records tutorial progression, Generate decisions, and setup failures", () => {
    const tutorialStep = {
      source: "app_entry" as const,
      step: "add-step" as const,
      step_index: 1,
      total_steps: 4,
    };
    logOnboardingTutorialStepViewed(tutorialStep);
    logOnboardingTutorialStepCompleted(tutorialStep);
    logOnboardingTutorialSkipped(tutorialStep);
    logGenerateTourOfferViewed();
    logGenerateTourAccepted();
    logGenerateTourDeclined();
    logAccountSetupNameSave("failed", { failure_code: "permission-denied" });

    expect(captureWhenReady.mock.calls).toEqual([
      ["onboarding_tutorial_step_viewed", tutorialStep],
      ["onboarding_tutorial_step_completed", tutorialStep],
      ["onboarding_tutorial_skipped", tutorialStep],
      ["onboarding_generate_tour_offer_viewed", { source: "first_run_offer" }],
      ["onboarding_generate_tour_accepted", { source: "first_run_offer" }],
      ["onboarding_generate_tour_declined", { source: "first_run_offer" }],
      ["account_setup_name_save_failed", { failure_code: "permission-denied" }],
    ]);
  });
});
