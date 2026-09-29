export interface AccountSetupProgress {
  backgroundChosenAt: string | null;
  reminderDismissals: number;
  reminderSnoozedUntil: string | null;
}

export function createDefaultAccountSetupProgress(): AccountSetupProgress {
  return {
    backgroundChosenAt: null,
    reminderDismissals: 0,
    reminderSnoozedUntil: null,
  };
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

export function normalizeAccountSetupProgress(
  value: unknown
): AccountSetupProgress {
  if (!value || typeof value !== "object") {
    return createDefaultAccountSetupProgress();
  }

  const candidate = value as Partial<AccountSetupProgress>;
  const dismissals =
    typeof candidate.reminderDismissals === "number" &&
    Number.isFinite(candidate.reminderDismissals)
      ? Math.max(0, Math.floor(candidate.reminderDismissals))
      : 0;

  return {
    backgroundChosenAt: normalizeDate(candidate.backgroundChosenAt),
    reminderDismissals: dismissals,
    reminderSnoozedUntil: normalizeDate(candidate.reminderSnoozedUntil),
  };
}

export function isSameAccountSetupProgress(
  left: AccountSetupProgress,
  right: AccountSetupProgress
): boolean {
  const sameField: Record<keyof AccountSetupProgress, boolean> = {
    backgroundChosenAt: left.backgroundChosenAt === right.backgroundChosenAt,
    reminderDismissals: left.reminderDismissals === right.reminderDismissals,
    reminderSnoozedUntil:
      left.reminderSnoozedUntil === right.reminderSnoozedUntil,
  };
  return Object.values(sameField).every(Boolean);
}

function latestDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function mergeAccountSetupProgress(
  localValue: unknown,
  cloudValue: unknown
): AccountSetupProgress {
  const local = normalizeAccountSetupProgress(localValue);
  const cloud = normalizeAccountSetupProgress(cloudValue);

  return {
    backgroundChosenAt: latestDate(
      local.backgroundChosenAt,
      cloud.backgroundChosenAt
    ),
    reminderDismissals: Math.max(
      local.reminderDismissals,
      cloud.reminderDismissals
    ),
    reminderSnoozedUntil: latestDate(
      local.reminderSnoozedUntil,
      cloud.reminderSnoozedUntil
    ),
  };
}
