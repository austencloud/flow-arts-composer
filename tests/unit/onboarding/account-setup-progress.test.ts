import { describe, expect, it } from "vitest";
import {
  createDefaultAccountSetupProgress,
  mergeAccountSetupProgress,
  normalizeAccountSetupProgress,
} from "#lib/shared/onboarding/domain/account-setup-progress.js";

describe("account setup progress persistence", () => {
  it("normalizes old and damaged onboarding documents to safe defaults", () => {
    expect(normalizeAccountSetupProgress(undefined)).toEqual(
      createDefaultAccountSetupProgress()
    );
    expect(
      normalizeAccountSetupProgress({
        backgroundChosenAt: "not-a-date",
        reminderDismissals: -4,
        reminderSnoozedUntil: 123,
      })
    ).toEqual(createDefaultAccountSetupProgress());
  });

  it("keeps the strongest completion and reminder policy across devices", () => {
    const localBackground = "2026-08-01T12:00:00.000Z";
    const localSnooze = "2026-08-12T12:00:00.000Z";
    const cloudSnooze = "2026-08-10T12:00:00.000Z";

    expect(
      mergeAccountSetupProgress(
        {
          backgroundChosenAt: localBackground,
          reminderDismissals: 1,
          reminderSnoozedUntil: localSnooze,
        },
        {
          backgroundChosenAt: null,
          reminderDismissals: 2,
          reminderSnoozedUntil: cloudSnooze,
        }
      )
    ).toEqual({
      backgroundChosenAt: localBackground,
      reminderDismissals: 2,
      reminderSnoozedUntil: localSnooze,
    });
  });
});
