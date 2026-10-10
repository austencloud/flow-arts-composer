import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TnDSelection } from "#lib/shared/create/domain/hand-relationship.js";

/** Words shown by the Create timing card; the selection codes remain stable. */
export function describeCreateTnDSelection(selection: TnDSelection): string {
  const key = {
    free: "create_deep_free",
    SS: "create_deep_split_same",
    TS: "create_deep_together_same",
    QS: "create_deep_quarter_same",
    SO: "create_deep_split_opposite",
    TO: "create_deep_together_opposite",
    QO: "create_deep_quarter_opposite",
  } as const;
  return t(key[selection]);
}
