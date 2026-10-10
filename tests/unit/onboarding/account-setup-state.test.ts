import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountSetupState } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
import { createDefaultAccountSetupProgress } from "#lib/shared/onboarding/domain/account-setup-progress.js";
import type { OnboardingStatus } from "#lib/shared/onboarding/services/types.js";

function createStatus(
  accountSetup = createDefaultAccountSetupProgress()
): OnboardingStatus {
  return {
    appCompleted: false,
    appSkipped: false,
    appCompletedAt: null,
    lastSeenVersion: null,
    accountSetup,
  };
}

describe("account setup state", () => {
  let now: number;

  beforeEach(() => {
    now = Date.parse("2026-08-05T12:00:00.000Z");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  function createHarness({
    displayName = "Austen",
    photoURL = "https://example.com/avatar.png",
    propsISpinWith = ["staff"],
    accountSetup = createDefaultAccountSetupProgress(),
    isFullAccount = true,
  }: {
    displayName?: string | null;
    photoURL?: string | null;
    propsISpinWith?: string[];
    accountSetup?: ReturnType<typeof createDefaultAccountSetupProgress>;
    isFullAccount?: boolean;
  } = {}) {
    let status = createStatus(accountSetup);
    const saveStatus = vi.fn(async (next: OnboardingStatus) => {
      status = structuredClone(next);
    });

    const state = createAccountSetupState({
      getIdentity: () => ({
        userId: isFullAccount ? "user-1" : null,
        isFullAccount,
        displayName,
        photoURL,
      }),
      loadStatus: async () => structuredClone(status),
      saveStatus,
      loadPropPreferences: async () => ({
        propsISpinWith: propsISpinWith as never,
        favoriteProp: null,
        favoriteCatdog: null,
      }),
      now: () => now,
    });

    return { state, saveStatus, getStatus: () => status };
  }

  it("derives four tasks from canonical account data and requires an explicit theme choice", async () => {
    const { state } = createHarness();
    await state.loadForCurrentUser();

    expect(state.completedCount).toBe(3);
    expect(state.tasks.find((task) => task.id === "theme")).toMatchObject({
      label: "Theme",
      complete: false,
    });

    await state.markThemeChosen();

    expect(state.completedCount).toBe(4);
    expect(state.isComplete).toBe(true);
  });

  it("completes the prop task from selected props without requiring a favorite", async () => {
    const status = createStatus();
    const state = createAccountSetupState({
      getIdentity: () => ({
        userId: "user-1",
        isFullAccount: true,
        displayName: null,
        photoURL: null,
      }),
      loadStatus: async () => status,
      saveStatus: async () => {},
      loadPropPreferences: async () => ({
        propsISpinWith: ["staff", "fan"] as never,
        favoriteProp: null,
        favoriteCatdog: null,
      }),
    });

    await state.loadForCurrentUser();

    expect(state.tasks.find((task) => task.id === "props")?.complete).toBe(
      true
    );
  });

  it("shows a requested reminder once per session and snoozes a dismissal for seven days", async () => {
    const { state, getStatus } = createHarness({
      displayName: null,
      photoURL: null,
      propsISpinWith: [],
    });
    await state.loadForCurrentUser();

    expect(state.requestReminder()).toBe(true);
    expect(state.consumeReminderRequest()).toBe(true);
    expect(state.requestReminder()).toBe(false);

    await state.dismissReminder();

    expect(getStatus().accountSetup.reminderDismissals).toBe(1);
    expect(getStatus().accountSetup.reminderSnoozedUntil).toBe(
      "2026-08-12T12:00:00.000Z"
    );
  });

  it("suppresses reminders after two dismissals", async () => {
    const { state } = createHarness({
      displayName: null,
      photoURL: null,
      propsISpinWith: [],
      accountSetup: {
        backgroundChosenAt: null,
        reminderDismissals: 2,
        reminderSnoozedUntil: null,
      },
    });
    await state.loadForCurrentUser();

    state.requestReminder();

    expect(state.canShowReminder()).toBe(false);
    expect(state.consumeReminderRequest()).toBe(false);
  });

  it("does not remind guests", async () => {
    const { state } = createHarness({
      isFullAccount: false,
      displayName: null,
      photoURL: null,
      propsISpinWith: [],
    });
    await state.loadForCurrentUser();

    expect(state.requestReminder()).toBe(false);
  });

  it("becomes unavailable and suppresses reminders when canonical loading fails", async () => {
    const state = createAccountSetupState({
      getIdentity: () => ({
        userId: "user-1",
        isFullAccount: true,
        displayName: null,
        photoURL: null,
      }),
      loadStatus: async () => {
        throw new Error("offline");
      },
      saveStatus: async () => {},
      loadPropPreferences: async () => ({
        propsISpinWith: [],
        favoriteProp: null,
        favoriteCatdog: null,
      }),
    });

    await state.loadForCurrentUser();

    expect(state.loading).toBe(false);
    expect(state.available).toBe(false);
    expect(state.requestReminder()).toBe(false);
    expect(state.canShowReminder()).toBe(false);
  });

  it("rolls back a Theme completion when persistence fails and retries it", async () => {
    let shouldFail = true;
    let status = createStatus();
    const state = createAccountSetupState({
      getIdentity: () => ({
        userId: "user-1",
        isFullAccount: true,
        displayName: "Austen",
        photoURL: "https://example.com/avatar.png",
      }),
      loadStatus: async () => structuredClone(status),
      saveStatus: async (next) => {
        if (shouldFail) throw new Error("write failed");
        status = structuredClone(next);
      },
      loadPropPreferences: async () => ({
        propsISpinWith: ["staff"] as never,
        favoriteProp: null,
        favoriteCatdog: null,
      }),
      now: () => now,
    });
    await state.loadForCurrentUser();

    await state.markThemeChosen();

    expect(state.tasks.find((task) => task.id === "theme")?.complete).toBe(
      false
    );
    expect(state.saveError).toBe("Account setup couldn't be saved. Try again.");

    shouldFail = false;
    await state.retrySave();

    expect(state.tasks.find((task) => task.id === "theme")?.complete).toBe(
      true
    );
    expect(state.saveError).toBeNull();
    expect(status.accountSetup.backgroundChosenAt).toBe(
      "2026-08-05T12:00:00.000Z"
    );
  });
});
