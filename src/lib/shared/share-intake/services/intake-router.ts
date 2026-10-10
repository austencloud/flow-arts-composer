import { getLibrarySaveService } from "#lib/features/library/get-library-save-service.js";
import { openSendAttachmentSheet } from "#lib/shared/inbox/state/send-sequence-state.svelte.js";
import { conversationService } from "#lib/shared/messaging/services/conversation-manager.js";
import { getShortCodeManager } from "#lib/shared/qr/get-short-code-manager.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  IntakeClassification,
  IntakeItem,
  IntakeProblem,
} from "../domain/share-intake-models";
import { openFiledCard } from "./open-filed-card";

type CardItem = Extract<IntakeItem, { kind: "card" }>;
type ImageItem = Extract<IntakeItem, { kind: "image" }>;

// Array.filter does NOT narrow a union on its own; these predicates are what
// make `item.code` and `item.file` legal below without a cast.
const isCard = (item: IntakeItem): item is CardItem => item.kind === "card";
const isImage = (item: IntakeItem): item is ImageItem => item.kind === "image";

export interface FiledCard {
  code: string;
  sequence: SequenceData;
  /** False for printed deck cards with no referenceable doc. */
  docBacked: boolean;
  /**
   * The id a caller should open. Equals sequence.id when docBacked; otherwise
   * the id produced by saving the printed card into My Library.
   */
  targetId: string;
}

export interface RouteResult {
  cards: FiledCard[];
  /**
   * Codes that did not resolve. Every entry here ALSO has exactly one
   * `resolve-failed` problem in `problems` - this array is the retry list, the
   * problem is the user-facing record. The runner must not synthesize a second
   * problem from this array.
   */
  unresolved: string[];
  /**
   * Files that did not reach a destination in this pass: images past the
   * first, and every image in a share where a card won. Sequential batch send
   * with per-item progress and partial-success retry is a cut WE made to keep
   * this plan shippable - see Known accepted limitations. They are REPORTED
   * rather than discarded, and their intake stays as partially-sent.
   */
  queued: File[];
  problems: IntakeProblem[];
  /** What the user is now looking at. Null means nothing reached a screen. */
  opened: "card" | "picker" | null;
}

/**
 * Send a classified intake to its destination - the hop that makes a share
 * visible.
 *
 * Cards resolve through the existing import path, are filed the same way
 * ScanCardSheet files them, and the first one OPENS THE VIEWER. Images open
 * the inbox conversation picker. `duplicate` items are ignored entirely: they
 * are second photos of a card already handled, and sending one as an image
 * would put a picture of a card into a conversation.
 */
export async function routeIntake(
  classification: IntakeClassification,
  userId: string | null,
  context: { receiptId: string; targetConversationId?: string }
): Promise<RouteResult> {
  const cards: FiledCard[] = [];
  const unresolved: string[] = [];
  const problems: IntakeProblem[] = [];

  // The same card can be photographed AND linked in the shared text. Resolving
  // it twice costs a second network read and files it twice.
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const code of [
    ...classification.items.filter(isCard).map((item) => item.code),
    ...(classification.textCode ? [classification.textCode] : []),
  ]) {
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  for (const code of codes) {
    // Each of these is a network read, and getShortCodeManager() itself throws
    // when DI has not run. One failure must not abandon the remaining codes.
    try {
      const resolution = await getShortCodeManager().resolveForImport(
        code,
        userId
      );
      if (!resolution) {
        unresolved.push(code);
        // ONE problem per unresolved code, authored here. The runner adds none.
        problems.push({
          name: code,
          reason: "resolve-failed",
          detail: "no sequence behind this code",
        });
        continue;
      }
      cards.push(await fileCard(code, resolution));
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      unresolved.push(code);
      problems.push({ name: code, reason: "resolve-failed", detail });
      console.error(`[ShareIntake] Could not resolve ${code}:`, detail);
    }
  }

  const images = classification.items.filter(isImage);
  const queued: File[] = [];
  let opened: "card" | "picker" | null = null;

  const first = cards[0];
  // An explicitly tapped share-sheet target beats cards-win. Tapping a face
  // states a destination; a QR we found in the pixels only infers one, and
  // Android's Direct Share guidance is to act on the chosen target rather than
  // present a disambiguation UI. The inversion needs somewhere to send TO, so
  // it only applies when the share actually carries a photo - a card-only share
  // still opens the viewer.
  const cardsSuppressed =
    Boolean(context.targetConversationId) && images.length > 0;

  if (first && !cardsSuppressed) {
    // Trace 1.13. Throws on a hydration failure; the runner catches it and
    // keeps the record, which is why this is awaited rather than fired off.
    opened = "card";
    await openFiledCard({
      code: first.code,
      sequence: first.sequence,
      extraCards: cards.length - 1,
      word: first.sequence.word || first.sequence.name || "",
    });

    // Cards win a mixed share: the viewer overlay and the inbox picker would
    // otherwise both be on screen fighting for the same back gesture.
    for (const item of images) {
      queued.push(item.file);
      problems.push({
        name: item.file.name,
        reason: "send-dropped",
        detail: "a card in the same share opened the viewer",
      });
    }

    return { cards, unresolved, queued, problems, opened };
  }

  if (cardsSuppressed) {
    // A suppressed card must still be RECORDED. Nothing reaching the user and
    // nothing saying why is the exact failure this feature was reviewed for.
    for (const item of classification.items.filter(isCard)) {
      queued.push(item.file);
      problems.push({
        name: item.code,
        reason: "send-dropped",
        detail: "a tapped share-sheet target took precedence",
      });
    }
  }

  const [firstImage, ...rest] = images;
  if (firstImage) {
    opened = "picker";

    // A shortcut can outlive its conversation (setLongLived keeps the face
    // cached after removal). Falling back to the plain picker keeps the photo
    // reachable; erroring would strand it.
    const conversationId = await resolveTargetConversation(
      context.targetConversationId
    );

    openSendAttachmentSheet(
      {
        type: "image",
        file: firstImage.file,
        // Same id shape MessageComposer.selectImage uses, and the same shape
        // the Storage staging path in
        // services/implementations/MessageImageSender.ts:37-39 expects.
        messageId: crypto.randomUUID(),
        attachmentId: crypto.randomUUID(),
      },
      {
        // The picker carries the intake id so the SEND - not the open - is
        // what resolves the record (trace 2.14).
        receiptId: context.receiptId,
        ...(conversationId ? { conversationId } : {}),
        ...(classification.residualText
          ? { note: classification.residualText }
          : {}),
      }
    );

    for (const item of rest) {
      queued.push(item.file);
      problems.push({ name: item.file.name, reason: "send-dropped" });
    }

    // The picker only ever shows ONE image. Without this, the other N images
    // in a SEND_MULTIPLE share vanish from the user's point of view - they see
    // one picker open and nothing else. Mirrors openFiledCard's extraCards
    // toast (Task 8) for the image side of the same problem.
    if (rest.length > 0) {
      toast.info(
        rest.length === 1
          ? "1 more image is saved. Share again to send it."
          : `${rest.length} more images are saved. Share again to send them.`
      );
    }
  }

  return { cards, unresolved, queued, problems, opened };
}

/**
 * Confirm the tapped conversation still exists, or return undefined so the send
 * sheet opens on the plain picker.
 *
 * Uses the ConversationManager singleton's existing getConversation read rather
 * than a new exists() helper - the manager already owns that document read, and
 * it already swallows its own failures into null.
 */
async function resolveTargetConversation(
  targetId: string | undefined
): Promise<string | undefined> {
  if (!targetId) return undefined;
  try {
    const conversation = await conversationService.getConversation(targetId);
    if (!conversation) {
      // Distinguishes "the shortcut outlived its conversation" from "the id
      // never arrived" when a tapped target lands in the plain picker. Without
      // it the two failures look identical from the outside.
      console.warn(
        `[ShareIntake] Tapped target ${targetId} resolved to no conversation; falling back to the picker.`
      );
    }
    return conversation ? targetId : undefined;
  } catch {
    // Never dead-end a share on a lookup failure; the photo is the point.
    return undefined;
  }
}

async function fileCard(
  code: string,
  resolution: { sequence: SequenceData; docBacked: boolean }
): Promise<FiledCard> {
  if (resolution.docBacked) {
    return {
      code,
      sequence: resolution.sequence,
      docBacked: true,
      targetId: resolution.sequence.id,
    };
  }

  // No referenceable doc behind this card (printed deck cards): save it to My
  // Library under the normal public default, then file it. Exactly the branch
  // ScanCardSheet.svelte:172-227 takes.
  const name =
    resolution.sequence.word || resolution.sequence.name || "Sequence";
  const saved = await getLibrarySaveService().saveSequence(
    resolution.sequence,
    {
      name,
      visibility: "public",
      tags: [],
      notes: "",
      analyticsSource: "share_intake",
    }
  );

  return {
    code,
    sequence: resolution.sequence,
    docBacked: false,
    targetId: saved.sequenceId,
  };
}
