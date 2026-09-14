import type { Response } from "express";
import { sendProviderCallbackPage } from "./providerCallbackPage";
import type { InstagramAuthFailureCode } from "./instagramAuthPolicy";

export function instagramFailureMessage(
  code: InstagramAuthFailureCode
): string {
  switch (code) {
    case "instagram/cancelled":
      return "Instagram authorization was cancelled.";
    case "instagram/already-linked":
      return "That Instagram account is connected to another Flow Arts Composer account.";
    case "instagram/account-type-required":
      return "Instagram login requires a creator or business account.";
    case "instagram/app-configuration-mismatch":
      return "Instagram's connection settings need an app update. Trying again will not fix this.";
    case "instagram/reauth-mismatch":
      return "That is not the Instagram account connected to this Flow Arts Composer account.";
    case "instagram/state-expired":
      return "This Instagram sign-in request expired.";
    default:
      return "Instagram could not complete sign-in.";
  }
}

/** The sign-in handshake's popup page. Message type and title are its contract
 *  with `src/lib/shared/auth/services/instagram-auth.ts` — do not change them
 *  without changing the listener. */
export function sendInstagramCallbackPage(
  response: Response,
  input: {
    returnOrigin?: string;
    state?: string;
    status: "complete" | "error";
    message: string;
  },
  statusCode = 200
): void {
  sendProviderCallbackPage(
    response,
    {
      ...input,
      messageType: "tka:instagram-auth",
      title:
        input.status === "complete"
          ? "Instagram connected"
          : "Instagram sign-in failed",
    },
    statusCode
  );
}
