import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { inboxState } from "#lib/shared/inbox/state/inbox-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type {
  IntakeClassification,
  IntakeProblem,
  ShareIntakeStatus,
} from "../domain/share-intake-models";
import { classifyIntake } from "./intake-classifier";
import { routeIntake } from "./intake-router";
import {
  deleteIntake,
  getIntake,
  listIntakes,
  reapExpired,
  updateStatus,
} from "./intake-store";

/**
 * The consumer. Without this the whole pipeline is write-only: intakes land in
 * IndexedDB and nothing ever reads them back out.
 *
 * It is called from exactly one place - ShareIntakeHost.svelte - because
 * routing needs the app shell mounted. Everything it can open (the inbox
 * picker, the sequence viewer overlay) renders inside MainApplication; calling
 * this from the native initializer, as an earlier revision did, routes into a
 * page that does not exist yet.
 */

/**
 * A record in one of these states still has somewhere to go.
 *
 * `ready` is in the set deliberately: it means "picker open, bytes staged, not
 * sent yet". On a fresh boot nothing is on screen, so a `ready` record has to
 * re-open its picker or the share is silently stranded. Within a session the
 * in-picker guard below stops it re-opening on top of itself.
 *
 * `failed` is NOT in the set: a failed record must not be retried in a loop.
 * The TTL reaps it.
 */
const UNCONSUMED: readonly ShareIntakeStatus[] = ["received", "needs-auth", "ready"];

/**
 * Records this session has already prompted for. Without it, every host effect
 * that fires while the user is signed out re-opens the auth drawer on top of
 * whatever they were doing.
 */
const prompted = new Set<string>();

let running: Promise<void> | null = null;
let rerunRequested = false;

/**
 * Coalesced entry point. The host's mount, signal and auth effects can all
 * fire in one flush; the guard means an intake arriving mid-run gets one extra
 * pass instead of a second concurrent run over the same rows.
 */
export function scheduleIntakeRun(): Promise<void> {
  if (running) {
    rerunRequested = true;
    return running;
  }

  running = (async () => {
    try {
      do {
        rerunRequested = false;
        await runPendingIntakes();
      } while (rerunRequested);
    } finally {
      running = null;
    }
  })();

  return running;
}

/**
 * An image cannot be sent without a full account:
 * services/implementations/MessageImageSender.ts throws for
 * `!user || user.isAnonymous`. Cards can - resolveForImport takes
 * `userId: string | null` and ScanCardSheet files printed cards for guests.
 */
function requiresFullAccount(classification: IntakeClassification): boolean {
  return classification.items.some((item) => item.kind === "image");
}

export async function runPendingIntakes(): Promise<void> {
  await reapExpired();

  const pending = (await listIntakes())
    .filter((record) => UNCONSUMED.includes(record.status))
    .sort((a, b) => a.receivedAt - b.receivedAt);

  for (const record of pending) {
    // The picker is open on this very record right now. Routing it again would
    // replace the user's in-progress selection with a fresh sheet.
    if (
      record.status === "ready" &&
      inboxState.shareAttachmentReceiptId === record.receiptId
    ) {
      continue;
    }

    try {
      const classification = await classifyIntake({
        files: record.files,
        text: record.text,
      });

      // Trace 3.10. Park BEFORE routing, not after: the store is the only copy
      // of the bytes and needs-auth is the one status exempt from the TTL and
      // from quota eviction.
      if (requiresFullAccount(classification) && !authState.isFullAccount) {
        await updateStatus(record.receiptId, "needs-auth", classification.problems);
        promptForSignIn(record.receiptId);
        continue;
      }

      const result = await routeIntake(
        classification,
        authState.effectiveUserId ?? null,
        { receiptId: record.receiptId }
      );

      // The router authors every resolve-failed itself; synthesizing more from
      // `result.unresolved` here produced one duplicate per bad code.
      const problems: IntakeProblem[] = [
        ...classification.problems,
        ...result.problems,
      ];

      if (result.opened === "picker") {
        // Trace 2.12. The bytes are staged in a picker the user has not
        // submitted. completeShareIntake (below), called from the drawer's
        // onSent, is what finally consumes them.
        await updateStatus(record.receiptId, "ready", problems);
        continue;
      }

      if (result.unresolved.length > 0 || result.queued.length > 0) {
        // Something this share carried never reached a destination and nothing
        // is on screen to finish it. Keeping the record is the point: the
        // bytes are still there to retry with.
        await updateStatus(record.receiptId, "partially-sent", problems);

        // When nothing opened, console.warn is the ONLY signal a human gets,
        // which is the "TKA opened and nothing happened" symptom this whole
        // feature exists to avoid. Found on-device 2026-07-29: sharing a card
        // link whose code does not resolve booted the app to Construct and
        // reported the failure to logcat alone.
        //
        // Scoped to opened === null on purpose. When a viewer or picker DID
        // open, openFiledCard's extraCards toast and routeIntake's queued-image
        // toast already cover the leftovers, and a second toast here would
        // double-report the cards-won-a-mixed-share case.
        if (result.opened === null && result.unresolved.length > 0) {
          toast.info(
            result.unresolved.length === 1
              ? "Couldn't open that shared TKA card."
              : `Couldn't open ${result.unresolved.length} shared TKA cards.`
          );
        }

        console.warn(
          `[ShareIntake] ${record.receiptId} kept: ${result.unresolved.length} unresolved, ${result.queued.length} queued`
        );
        continue;
      }

      if (problems.length > 0) {
        console.warn(`[ShareIntake] ${record.receiptId} completed with problems`, problems);
      }

      // Everything reached a destination. Only NOW is deleting safe - reads
      // never delete precisely so a crash mid-route leaves the bytes intact.
      await deleteIntake(record.receiptId);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      console.error(`[ShareIntake] Routing ${record.receiptId} failed:`, detail);
      // "failed" leaves the UNCONSUMED set, so this is not retried in a loop.
      // It stays visible until the TTL reaps it.
      await updateStatus(record.receiptId, "failed", [
        { name: "", reason: "route-failed", detail },
      ]);
    }
  }
}

/** Trace 3.12: a VISIBLE prompt, once per record per session. */
function promptForSignIn(receiptId: string): void {
  if (prompted.has(receiptId)) return;
  prompted.add(receiptId);

  authDrawerState.show("signin", "share-image-signin");
  toast.info("Sign in to send the image you shared. It's saved until you do.");
}

/**
 * Trace 2.14. Called by InboxDrawer when the image has actually been SENT,
 * which is the only moment the bytes are genuinely consumed.
 *
 * A record carrying send-dropped problems still has files the user has not
 * dealt with, so it is held as partially-sent rather than deleted.
 */
export async function completeShareIntake(receiptId: string): Promise<void> {
  const record = await getIntake(receiptId);
  if (!record) return;

  const leftovers = record.problems.some(
    (problem) => problem.reason === "send-dropped"
  );

  if (leftovers) {
    await updateStatus(receiptId, "partially-sent");
    console.warn(
      `[ShareIntake] ${receiptId} sent one file; ${record.files.length - 1} still queued`
    );
    return;
  }

  await deleteIntake(receiptId);
}
