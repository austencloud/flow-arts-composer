import { CapacitorShareTarget } from "@capgo/capacitor-share-target";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { deriveReceiptId } from "../domain/derive-receipt-id";
import type {
  SharedFileDescriptor,
  SharedIntake,
} from "../domain/share-intake-models";
import { bumpIntakeSignal } from "../state/share-intake-signal.svelte";
import { getIntake, putIntake } from "./intake-store";
import { screenDescriptors, validateIntake } from "./intake-validator";
import { sharedFilesToFiles } from "./shared-file-bridge";
import { consumeLaunchShortcutId } from "./sharing-shortcuts-publisher";

/**
 * Arrival only. This module persists bytes and raises a flag; it does NOT
 * route, and it must never import the intake runner.
 *
 * Routing opens the inbox picker and the sequence viewer overlay, both of
 * which render inside MainApplication. This code runs during native boot, when
 * that tree may not exist yet. ShareIntakeHost owns the reaction (Task 12).
 */

/**
 * The plugin's event shape, read from
 * node_modules/@capgo/capacitor-share-target/dist/esm/definitions.d.ts.
 * SharedFile is { uri, name, mimeType } - there is NO size field, which is the
 * whole reason the durable receipt id is derived after bridging.
 */
export interface ShareReceivedEvent {
  title: string;
  texts: string[];
  files: SharedFileDescriptor[];
}

/**
 * Deliveries currently being processed. Held in memory rather than in
 * IndexedDB because the check has to be SYNCHRONOUS - see the listener.
 */
const inFlight = new Set<string>();

/** Handlers not yet settled. Exists so tests can await real completion. */
const handling = new Set<Promise<void>>();

/**
 * The in-flight dedup key, derived with NO I/O so it can be claimed before any
 * await.
 *
 * Unlike the durable receiptId this DOES include the uri. Capacitor replays
 * both retained cold-launch events with the identical uri, so including it
 * still collapses the twin; and when copyFileToCache fails, getFileData falls
 * back to uri.toString() (CapacitorShareTargetPlugin.java:114), giving two
 * simultaneous shares of same-named files distinct content:// uris that a
 * name+mime key would wrongly merge.
 */
function deriveDeliveryKey(event: ShareReceivedEvent): string {
  const files = event.files ?? [];
  const base = deriveReceiptId({ files, texts: event.texts ?? [] });
  // Length-prefixed for the same reason deriveReceiptId prefixes its fields:
  // a uri is sender-influenced and must not be able to shift a boundary.
  const uris = files.map((file) => `${file.uri.length}:${file.uri}`).join("");
  return `${base}|${uris}`;
}

/** Resolves when every delivery received so far has been fully handled. */
export function whenIdle(): Promise<void> {
  return Promise.all([...handling]).then(() => undefined);
}

/**
 * Bridge the plugin's events into a persisted, normalized intake.
 *
 * Resolves as soon as the listener is attached. It deliberately does NOT wait
 * for a first delivery or a grace period: nothing downstream needs the store
 * to be populated before boot continues, because ShareIntakeHost reacts to the
 * signal whenever it arrives. An earlier revision raced a 300 ms timer here and
 * charged it to every share-less cold start.
 */
export async function registerNativeShareTarget(): Promise<void> {
  await CapacitorShareTarget.addListener(
    "shareReceived",
    (event: ShareReceivedEvent) => {
      // SYNCHRONOUS claim, before any await. Capacitor replays both retained
      // cold-launch events back to back; an await-then-check against IndexedDB
      // lets both pass the check before either one writes.
      const deliveryKey = deriveDeliveryKey(event);
      if (inFlight.has(deliveryKey)) return;
      inFlight.add(deliveryKey);

      const settled = handleShareReceived(event)
        .catch((caught: unknown) => {
          console.error("[ShareIntake] Handling a share failed:", caught);
        })
        .finally(() => {
          inFlight.delete(deliveryKey);
          handling.delete(settled);
        });

      handling.add(settled);
    }
  );
}

async function handleShareReceived(event: ShareReceivedEvent): Promise<void> {
  const texts = event.texts ?? [];

  // Type and count are screened BEFORE the bridge reads a byte.
  const screen = screenDescriptors(event.files ?? []);
  const { bridged, problems: bridgeProblems } = await sharedFilesToFiles(
    screen.admitted
  );

  const gate = validateIntake({
    files: bridged.map((entry) => entry.file),
    text: texts.length > 0 ? texts.join("\n") : undefined,
    title: event.title || undefined,
  });

  // Only NOW is the durable id derivable: the bridged descriptors carry a real
  // byte size, so two different screenshots that happen to share a name and
  // mime type no longer collide.
  const receiptId = deriveReceiptId({
    files: bridged.map((entry) => entry.descriptor),
    texts,
  });

  // Second delivery of a share already persisted in an earlier session. Known
  // gap: if that existing record is `failed` or `needs-auth`, this bails out
  // with no signal bump and no bumped visibility - see Known accepted
  // limitations. A genuinely fresh share is unaffected; receiptId is
  // content-derived, so re-sharing the SAME bytes is indistinguishable from
  // the earlier delivery replaying.
  if (await getIntake(receiptId)) return;

  const problems = [...screen.problems, ...bridgeProblems, ...gate.problems];
  const empty = gate.accepted.length === 0 && !gate.text;

  // AFTER the synchronous in-flight claim (made by the listener before this
  // function was even called), so the cold-launch twin never gets here. The
  // native side nulls the extra on first read, so a second call would return
  // null and quietly downgrade the share to "pick someone".
  const targetConversationId = await consumeLaunchShortcutId();

  const record: SharedIntake = {
    receiptId,
    source: "native",
    files: gate.accepted,
    text: gate.text ?? undefined,
    title: gate.title ?? undefined,
    // A share that produced nothing usable is RECORDED, not dropped. "TKA
    // opened and nothing happened" is the ClipData symptom the device matrix
    // is hunting for, and a bare return makes it invisible.
    status: empty ? "failed" : "received",
    receivedAt: Date.now(),
    problems,
    ...(targetConversationId ? { targetConversationId } : {}),
  };

  if (problems.length > 0) {
    console.warn("[ShareIntake] Share arrived with problems:", problems);
  }

  try {
    await putIntake(record);
  } catch (caught) {
    // Quota, a blocked upgrade, or a store full of pending sign-in shares.
    // This is the one arrival exit where the bytes exist only in the
    // plugin's own cache dir with no record of them anywhere else, so a
    // console line alone would leave the user staring at "nothing happened"
    // with no way to know why. Loud on both channels, per the store's own
    // honesty note.
    console.error("[ShareIntake] Could not persist the share:", caught);
    toast.error("Couldn't save what you shared. Try sharing it again.");
    return;
  }

  // Raise the flag. ShareIntakeHost, inside the app shell, does the rest.
  if (!empty) bumpIntakeSignal();
}
