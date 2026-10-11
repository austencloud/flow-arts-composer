import type { PendingActionType } from "#lib/shared/sequence-viewer/services/pending-action-queue.js";

/**
 * Actions that publish content to shared/public collections under a visible
 * identity require a permanent (non-anonymous) account. Own-subtree writes
 * (save, favorite) and no-write actions (remix navigates to Create; sendTo
 * shares a URL) are allowed for anonymous guests.
 *
 * download is here for the /q scan funnel: watching stays free, taking the
 * export home is the account-creation moment. Outside this set the gate
 * silently provisions an anonymous guest and never prompts — which would
 * make the gate a no-op.
 */
const FULL_ACCOUNT_ACTIONS: ReadonlySet<PendingActionType> = new Set([
  "publish",
  "download",
]);

export function requiresFullAccount(type: PendingActionType): boolean {
  return FULL_ACCOUNT_ACTIONS.has(type);
}
