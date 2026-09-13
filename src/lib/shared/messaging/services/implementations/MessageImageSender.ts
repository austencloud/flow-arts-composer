import {
  getAuthInstance,
  getFunctionsInstance,
  getStorageInstance,
} from "$lib/shared/auth/firebase";
import { httpsCallable } from "firebase/functions";
import {
  deleteObject,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import type {
  IMessageImageSender,
  MessageImageSendHandle,
  MessageImageSendRequest,
  MessageImageSendResult,
} from "../contracts/IMessageImageSender";

/** Refused, not failed: the caller's outbox requeues this for its own account. */
function senderChanged(expected: string, actual: string | undefined): Error {
  return Object.assign(
    new Error(
      `This image belongs to another account (expected ${expected}, signed in ${actual ?? "nobody"}).`
    ),
    { code: "messaging/sender-changed" }
  );
}

export class MessageImageSender implements IMessageImageSender {
  send(request: MessageImageSendRequest): MessageImageSendHandle {
    let cancelled = false;
    let uploadTask: UploadTask | undefined;

    const promise = (async (): Promise<MessageImageSendResult> => {
      const [auth, storage, functions] = await Promise.all([
        getAuthInstance(),
        getStorageInstance(),
        getFunctionsInstance(),
      ]);
      const user = auth.currentUser;
      if (!user || user.isAnonymous) {
        throw new Error("Sign in with an account to send images.");
      }
      // Firebase init is an await, and the account can change across it. The
      // staging path below is built from the uid read here, so without this a
      // send queued by one account uploads into another account's tree.
      if (request.expectedUserId && request.expectedUserId !== user.uid) {
        throw senderChanged(request.expectedUserId, user.uid);
      }
      if (cancelled) throw new Error("Image send cancelled.");

      const stagingPath =
        `message-image-staging/${user.uid}/${request.conversationId}/` +
        `${request.messageId}/${request.attachmentId}`;
      const stagingRef = ref(storage, stagingPath);

      try {
        uploadTask = uploadBytesResumable(stagingRef, request.file, {
          contentType: request.file.type,
          customMetadata: {
            conversationId: request.conversationId,
            messageId: request.messageId,
            attachmentId: request.attachmentId,
          },
        });

        await new Promise<void>((resolve, reject) => {
          uploadTask?.on(
            "state_changed",
            (snapshot) => {
              const fraction = snapshot.totalBytes
                ? snapshot.bytesTransferred / snapshot.totalBytes
                : 0;
              request.onProgress?.({ phase: "uploading", fraction });
            },
            reject,
            resolve
          );
        });

        if (cancelled) throw new Error("Image send cancelled.");
        request.onProgress?.({ phase: "finalizing", fraction: 1 });

        // Re-checked AFTER that callback, not only before it. The callback is
        // where the caller learns the phase changed and where it may cancel,
        // and `finalize` below commits the message: an earlier check cannot see
        // a cancellation the callback itself raised. Also re-read the account,
        // since an upload can be long enough to outlive a sign-in.
        if (cancelled) throw new Error("Image send cancelled.");
        if (
          request.expectedUserId &&
          request.expectedUserId !== auth.currentUser?.uid
        ) {
          throw senderChanged(request.expectedUserId, auth.currentUser?.uid);
        }

        const finalize = httpsCallable<
          Omit<MessageImageSendRequest, "file" | "onProgress">,
          MessageImageSendResult
        >(functions, "finalizeMessageImage");
        const result = await finalize({
          conversationId: request.conversationId,
          messageId: request.messageId,
          attachmentId: request.attachmentId,
          content: request.content,
          ...(request.replyTo ? { replyTo: request.replyTo } : {}),
        });
        return result.data;
      } finally {
        await deleteObject(stagingRef).catch(() => undefined);
      }
    })();

    return {
      promise,
      cancel() {
        cancelled = true;
        uploadTask?.cancel();
      },
    };
  }
}
