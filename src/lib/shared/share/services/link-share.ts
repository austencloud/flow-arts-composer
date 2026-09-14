/**
 * Handing a link to someone.
 *
 * On a phone that is the platform's own share sheet, which is where people
 * already keep their messages, their AirDrop and their notes app. Everywhere
 * else it is the clipboard. One call covers both, so a caller offers Share
 * without knowing which one it will get.
 *
 * This is also the one place text reaches the clipboard: the modern API where
 * it exists, and the legacy selection trick where it does not (older
 * WebViews, and documents served without a secure context).
 */

import { detectPlatform } from "$lib/shared/mobile/services/platform-detector";

export interface LinkShare {
  /** The address to hand on. */
  url: string;
  /** Names the thing being shared in the platform sheet. */
  title?: string;
  /** A sentence the platform sheet may show alongside the link. */
  text?: string;
}

export type LinkShareOutcome =
  /** The platform sheet took it; the platform tells the user what happened. */
  | "shared"
  /** The link is on the clipboard; the caller should say so. */
  | "copied"
  /** The person closed the platform sheet without choosing. Say nothing. */
  | "dismissed"
  /** Neither route worked; the caller should say so. */
  | "failed";

/**
 * The legacy path: a hidden textarea, selected, copied by the document. Used
 * only when the clipboard API is missing.
 */
async function copyBySelection(text: string): Promise<void> {
  const textArea = document.createElement("textarea");
  textArea.value = text;

  // Off the flow and invisible, so nothing scrolls or flashes.
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("execCommand copy failed");
  } finally {
    document.body.removeChild(textArea);
  }
}

/** Put text on the clipboard, by whichever route this browser supports. */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await copyBySelection(text);
}

/**
 * Offer the link through the platform's share sheet, falling back to the
 * clipboard. Must be called from the click that asked for it: both the share
 * sheet and the clipboard need that gesture.
 */
export async function shareOrCopyLink(
  link: LinkShare
): Promise<LinkShareOutcome> {
  const platform = typeof navigator === "undefined" ? null : navigator;

  /* Desktop Chrome on Windows publishes navigator.share and opens an OS
     sheet, which is a detour for someone who wanted the address on their
     clipboard. The sheet earns its place on a phone, where it reaches the
     messaging apps. Same gate the card export already uses. */
  const onAPhone = detectPlatform() !== "desktop";

  if (onAPhone && typeof platform?.share === "function") {
    const payload = { title: link.title, text: link.text, url: link.url };
    // canShare, where it exists, says whether this payload is acceptable;
    // where it does not, try the sheet and let it refuse.
    if (
      typeof platform.canShare !== "function" ||
      platform.canShare(payload)
    ) {
      try {
        await platform.share(payload);
        return "shared";
      } catch (error) {
        // Closing the sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") {
          return "dismissed";
        }
        // Anything else (a sheet that refused the payload, a WebView without
        // a real implementation) still leaves the clipboard.
        console.warn("[link-share] Share sheet unavailable:", error);
      }
    }
  }

  try {
    await copyTextToClipboard(link.url);
    return "copied";
  } catch (error) {
    console.error("[link-share] Could not copy the link:", error);
    return "failed";
  }
}
