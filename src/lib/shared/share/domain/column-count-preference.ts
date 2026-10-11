import { getCanonicalCardStepColumnCounts } from "#lib/shared/render/services/card-step-column-options.js";

export const COLUMN_COUNT_PREFERENCE_VERSION = 1 as const;
export const GUEST_COLUMN_COUNT_PREFERENCE_OWNER = "guest";

export interface ColumnCountPreferenceSource {
  columnCountOverrides?: Record<string, unknown>;
  columnCountPreferenceVersion?: number;
  columnCountPreferenceOwner?: string;
}

export interface SanitizedColumnCountPreference {
  columnCountOverrides: Record<string, number | null>;
  columnCountPreferenceVersion: typeof COLUMN_COUNT_PREFERENCE_VERSION;
  columnCountPreferenceOwner: string;
  changed: boolean;
}

export function getColumnCountPreferenceOwner(
  user: { uid: string } | null | undefined
): string {
  return user ? `user:${user.uid}` : GUEST_COLUMN_COUNT_PREFERENCE_OWNER;
}

function isValidStepCountKey(key: string): boolean {
  const stepCount = Number(key);
  return Number.isInteger(stepCount) && stepCount >= 4;
}

function isValidExplicitColumnCount(
  stepCount: number,
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    getCanonicalCardStepColumnCounts(stepCount).includes(value)
  );
}

/**
 * A numeric override is trusted only when the current schema version records
 * that the same Firebase identity created it. Older values have no provenance,
 * so they migrate to explicit Auto (`null`) instead of being mistaken for a
 * default or crossing an account boundary.
 */
export function sanitizeColumnCountPreference(
  source: ColumnCountPreferenceSource | null | undefined,
  expectedOwner: string
): SanitizedColumnCountPreference {
  const sourceOverrides = source?.columnCountOverrides ?? {};
  const trusted =
    source?.columnCountPreferenceVersion === COLUMN_COUNT_PREFERENCE_VERSION &&
    source.columnCountPreferenceOwner === expectedOwner;
  const columnCountOverrides: Record<string, number | null> = {};
  const validSourceEntries = Object.entries(sourceOverrides).filter(([key]) =>
    isValidStepCountKey(key)
  );

  for (const [key, value] of validSourceEntries) {
    const stepCount = Number(key);
    if (
      trusted &&
      (value === null || isValidExplicitColumnCount(stepCount, value))
    ) {
      columnCountOverrides[key] = value;
    } else {
      // Keep the key as null so Firestore merge writes overwrite a stale number.
      columnCountOverrides[key] = null;
    }
  }

  const changed =
    !trusted ||
    validSourceEntries.length !== Object.keys(columnCountOverrides).length ||
    Object.entries(columnCountOverrides).some(
      ([key, value]) => sourceOverrides[key] !== value
    );

  return {
    columnCountOverrides,
    columnCountPreferenceVersion: COLUMN_COUNT_PREFERENCE_VERSION,
    columnCountPreferenceOwner: expectedOwner,
    changed,
  };
}
