import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { decodeSequenceWithCompression } from "$lib/shared/navigation/services/sequence-encoder";
import type { MessageAttachment } from "$lib/shared/messaging/domain/models/message-models";
import { buildSequenceSharePayload } from "./build-sequence-share-payload";

export interface SequenceMessageAttachmentOptions {
  /** The sender's viewer state as a share-link query; see the metadata field. */
  viewParams?: string;
}

export function buildSequenceMessageAttachment(
  sequence: SequenceData,
  shortCode: string,
  options: SequenceMessageAttachmentOptions = {}
): MessageAttachment {
  const payload = buildSequenceSharePayload(sequence);
  const metadata: NonNullable<MessageAttachment["metadata"]> = {
    sequenceId: payload.sequenceId,
    sequenceShortCode: shortCode,
    sequenceWord: payload.sequenceWord,
  };

  if (payload.sequenceCloudWord) {
    metadata.sequenceCloudWord = payload.sequenceCloudWord;
  }
  if (payload.sequenceName) metadata.sequenceName = payload.sequenceName;
  if (payload.sequenceThumbnail) {
    metadata.sequenceThumbnail = payload.sequenceThumbnail;
  }
  if (payload.sequenceAuthor) metadata.sequenceAuthor = payload.sequenceAuthor;
  if (payload.sequenceStepCount) {
    metadata.sequenceStepCount = payload.sequenceStepCount;
  }
  // The scan route forwards its query to the viewer, so the plain link opens
  // on the sender's view as well as the in-app card.
  let url = `/q/${encodeURIComponent(shortCode)}`;
  if (options.viewParams) {
    metadata.sequenceViewParams = options.viewParams;
    url += `?${options.viewParams}`;
  }

  const attachment: MessageAttachment = {
    type: "sequence",
    url,
    name: payload.sequenceWord,
    metadata,
  };

  if (payload.sequenceThumbnail) {
    attachment.thumbnailUrl = payload.sequenceThumbnail;
  }

  return attachment;
}

export function decodeLegacySequenceAttachment(
  attachment: MessageAttachment
): SequenceData | null {
  const prefix = "/sequence/";
  if (!attachment.url?.startsWith(prefix)) return null;

  const encodedRouteId = attachment.url
    .slice(prefix.length)
    .split(/[?#]/, 1)[0];
  if (!encodedRouteId) return null;

  const encoded = decodeURIComponent(encodedRouteId);
  const isSerialized =
    encoded.startsWith("d1:") ||
    encoded.startsWith("raw:") ||
    encoded.includes("|");

  return isSerialized ? decodeSequenceWithCompression(encoded) : null;
}
