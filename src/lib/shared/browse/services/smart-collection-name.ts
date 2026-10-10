import type { SmartFilterSpec } from "#lib/shared/library/domain/models/collection.js";

export const SMART_COLLECTION_NAME_MAX_LENGTH = 60;

const FALLBACK_NAME = "Smart Collection";
const LABEL_SEPARATOR = " · ";

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function truncateName(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return "…".slice(0, maxLength);

  const available = maxLength - 1;
  const clipped = value.slice(0, available);
  const wordBoundary = clipped.lastIndexOf(" ");
  const minimumUsefulBoundary = Math.floor(available * 0.6);
  const stem =
    wordBoundary >= minimumUsefulBoundary
      ? clipped.slice(0, wordBoundary)
      : clipped;

  return `${stem.trimEnd()}…`;
}

function summarizeLabels(labels: readonly string[], maxLength: number): string {
  if (labels.length === 0) return FALLBACK_NAME;

  const maximumVisibleLabels = Math.min(3, labels.length);
  for (
    let visibleCount = maximumVisibleLabels;
    visibleCount >= 1;
    visibleCount--
  ) {
    const remaining = labels.length - visibleCount;
    const suffix = remaining > 0 ? ` +${remaining}` : "";
    const summary = `${labels.slice(0, visibleCount).join(LABEL_SEPARATOR)}${suffix}`;
    if (summary.length <= maxLength) return summary;
  }

  const hiddenCount = labels.length - 1;
  const suffix = hiddenCount > 0 ? ` +${hiddenCount}` : "";
  return `${truncateName(labels[0]!, maxLength - suffix.length)}${suffix}`;
}

function uniqueLabels(spec: SmartFilterSpec): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const filter of spec.filters) {
    const label = normalizeLabel(filter.label);
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  return labels;
}

function avoidDuplicateName(
  baseName: string,
  existingNames: readonly string[],
  maxLength: number
): string {
  const used = new Set(
    existingNames.map((name) => normalizeLabel(name).toLocaleLowerCase())
  );
  if (!used.has(baseName.toLocaleLowerCase())) return baseName;

  for (let copyNumber = 2; copyNumber < 10_000; copyNumber++) {
    const suffix = ` (${copyNumber})`;
    const candidate = `${truncateName(baseName, maxLength - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }

  return truncateName(`${baseName} copy`, maxLength);
}

/**
 * Build a short, literal title from the same labels shown on the rule chips.
 * Untouched suggestions stay understandable because the name never invents
 * information that is absent from the saved filter rule.
 */
export function suggestSmartCollectionName(
  spec: SmartFilterSpec,
  existingNames: readonly string[] = [],
  maxLength = SMART_COLLECTION_NAME_MAX_LENGTH
): string {
  const safeMaxLength = Math.max(1, maxLength);
  const summary = summarizeLabels(uniqueLabels(spec), safeMaxLength);
  return avoidDuplicateName(summary, existingNames, safeMaxLength);
}
