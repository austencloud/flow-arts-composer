import type { MessageAttachment } from "$lib/shared/messaging/domain/models/message-models";
import type {
  MessageDeliveryProgress,
  MessageOutboxRecord,
} from "../../domain/message-delivery-models";

export interface MessageDeliveryHooks {
  onProgress?(progress: MessageDeliveryProgress): void;
  onPrepared?(attachments: MessageAttachment[]): Promise<void>;
  /**
   * False once this delivery no longer belongs to the account that started it.
   *
   * The coordinator's own steps await — minting a share code, persisting a
   * prepared attachment, uploading an image — and the seam underneath sends as
   * whoever is signed in at dispatch time, not as the row's owner. So the
   * coordinator has to ask again at every boundary before the network, not
   * trust the check that let the delivery in.
   */
  isOwned?(): boolean;
}

export interface IMessageDeliveryCoordinator {
  deliver(
    item: MessageOutboxRecord,
    hooks?: MessageDeliveryHooks
  ): Promise<void>;
}
