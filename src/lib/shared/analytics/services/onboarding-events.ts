/**
 * Onboarding Events
 *
 * Thin captureEvent wrappers for the app-entry / create-tutorial funnel
 * (offered -> accepted -> completed, or offered -> declined) plus first-run
 * completion. Keeping every call site behind these functions means the event
 * names and property shape live in one place instead of drifting per
 * call site, mirroring the captureEvent wrappers in
 * `#lib/shared/analytics/landing-events.js`.
 *
 * `source` distinguishes the normal automatic app-entry flow from a user
 * manually re-triggering the tutorial (Settings "replay tutorial").
 */
import { captureWhenReady } from "./posthog";

export type OnboardingEventSource = "app_entry" | "manual";

export interface OnboardingEventProps {
  source?: OnboardingEventSource;
  [key: string]: unknown;
}

export type CreateTutorialStep =
  | "pick-start"
  | "add-step"
  | "play-sequence"
  | "ready";

export type GenerateTourSource = "first_run_offer" | "help_button";

export type AccountSetupTask =
  | "display-name"
  | "profile-photo"
  | "props"
  | "theme";

function captureOnboardingEvent(
  event: string,
  properties: Record<string, unknown> = {}
): void {
  captureWhenReady(event, properties);
}

/** The guided-build tutorial prompt was shown. */
export function logOnboardingTutorialOffered(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_tutorial_offered", props);
}

/** The inline offer was actually mounted where the user could see it. */
export function logOnboardingTutorialPromptViewed(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_tutorial_prompt_viewed", props);
}

/** The visible offer disappeared without either action being chosen. */
export function logOnboardingTutorialIgnored(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_tutorial_ignored", props);
}

/** The user accepted the guided-build tutorial prompt (or replayed it). */
export function logOnboardingTutorialAccepted(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_tutorial_accepted", props);
}

/** The user declined the guided-build tutorial prompt. */
export function logOnboardingTutorialDeclined(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_tutorial_declined", props);
}

/** The guided-build tutorial ran to completion (all steps finished). */
export function logOnboardingTutorialCompleted(
  props: OnboardingEventProps = {}
): void {
  captureOnboardingEvent("onboarding_tutorial_completed", props);
}

/** A concrete step became the visible tutorial surface. */
export function logOnboardingTutorialStepViewed(props: {
  source: OnboardingEventSource;
  step: CreateTutorialStep;
  step_index: number;
  total_steps: number;
}): void {
  captureOnboardingEvent("onboarding_tutorial_step_viewed", props);
}

/** The action required by a concrete tutorial step was completed. */
export function logOnboardingTutorialStepCompleted(props: {
  source: OnboardingEventSource;
  step: CreateTutorialStep;
  step_index: number;
  total_steps: number;
}): void {
  captureOnboardingEvent("onboarding_tutorial_step_completed", props);
}

/** The walkthrough was left after it had already been accepted. */
export function logOnboardingTutorialSkipped(props: {
  source: OnboardingEventSource;
  step: CreateTutorialStep;
  step_index: number;
  total_steps: number;
}): void {
  captureOnboardingEvent("onboarding_tutorial_skipped", props);
}

/** The first-run wizard (display-name step) was completed. */
export function logOnboardingFirstRunCompleted(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_first_run_completed", props);
}

/** The guest first-save keep-your-work prompt (AuthNudge) was shown, after markPresented(). */
export function logOnboardingGuestFirstSavePromptShown(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_guest_first_save_prompt_shown", props);
}

/** The user chose "Create account" from the guest first-save prompt. */
export function logOnboardingGuestFirstSavePromptAccepted(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_guest_first_save_prompt_accepted", props);
}

/** The user dismissed the guest first-save prompt without acting. */
export function logOnboardingGuestFirstSavePromptDeclined(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_guest_first_save_prompt_declined", props);
}

/** The user chose "Log in" (existing account) from the guest first-save prompt. */
export function logOnboardingGuestFirstSavePromptLogin(
  props: OnboardingEventProps = {}
): void {
  captureWhenReady("onboarding_guest_first_save_prompt_login", props);
}

export function logGenerateTourOfferViewed(): void {
  captureOnboardingEvent("onboarding_generate_tour_offer_viewed", {
    source: "first_run_offer",
  });
}

export function logGenerateTourAccepted(): void {
  captureOnboardingEvent("onboarding_generate_tour_accepted", {
    source: "first_run_offer",
  });
}

export function logGenerateTourDeclined(): void {
  captureOnboardingEvent("onboarding_generate_tour_declined", {
    source: "first_run_offer",
  });
}

export function logGenerateTourStarted(
  source: GenerateTourSource,
  stop: string
): void {
  captureOnboardingEvent("onboarding_generate_tour_started", {
    source,
    stop,
  });
}

export function logGenerateTourStepViewed(props: {
  source: GenerateTourSource;
  stop: string;
  step_index: number;
  total_steps: number;
}): void {
  captureOnboardingEvent("onboarding_generate_tour_step_viewed", props);
}

export function logGenerateTourCompleted(props: {
  source: GenerateTourSource;
  step_count: number;
}): void {
  captureOnboardingEvent("onboarding_generate_tour_completed", props);
}

export function logGenerateTourSkipped(props: {
  source: GenerateTourSource;
  stop: string;
  step_index: number;
  total_steps: number;
}): void {
  captureOnboardingEvent("onboarding_generate_tour_skipped", props);
}

export function logAccountSetupViewed(props: {
  surface: "first_run_wizard" | "settings_checklist" | "reminder";
  completed_count: number;
  total_count: number;
}): void {
  captureOnboardingEvent("account_setup_viewed", props);
}

export function logAccountSetupTaskSelected(props: {
  task: AccountSetupTask;
  was_complete: boolean;
  surface: "settings_checklist" | "reminder";
}): void {
  captureOnboardingEvent("account_setup_task_selected", props);
}

export function logAccountSetupNameSave(
  outcome: "started" | "succeeded" | "failed",
  properties: { failure_code?: string } = {}
): void {
  captureOnboardingEvent(`account_setup_name_save_${outcome}`, properties);
}

export function logAccountSetupReminder(
  outcome: "shown" | "opened" | "dismissed",
  props: { completed_count: number; total_count: number }
): void {
  captureOnboardingEvent(`account_setup_reminder_${outcome}`, props);
}

// The first-session starter (SP3b) and its four
// onboarding_first_sequence_starter_* events were removed 2026-07-29.
