/**
 * Post handoff — the platform-correct way to get an artifact from the sequence
 * viewer into an Instagram or Facebook post.
 *
 * The defect this replaces: the viewer's share action called
 * `navigator.share({ title, text, url })` — a LINK-only share. Instagram does
 * not accept a URL share as a feed post, so the OS share sheet was a dead end
 * for the exact case sharing exists to serve. Every path here carries the FILE.
 *
 * Platform ceilings, verified and permanent:
 *   - Facebook personal profiles cannot be posted to by any API (`publish_actions`
 *     removed 2018, never restored). Assist-only, forever.
 *   - Instagram personal accounts likewise — Graph publishing requires a
 *     Business/Creator account.
 * Phase 2 adds true auto-post for a Business IG + a Facebook Page on top of the
 * same presigned URL this module already produces. See
 * docs/superpowers/specs/active/2026-08-09-social-post-handoff-design.md.
 */

import {
  canNativeShareFile,
  downloadBlobToDisk,
  sanitizeFilename,
  shareBlobNatively,
  supportsNativeFileShare,
} from "$lib/shared/foundation/services/file-downloader";
import { detectPlatform } from "$lib/shared/mobile/services/platform-detector";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

export type ShareArtifact = "card" | "video";

export type HandoffDestinationId =
  | "native-share"
  | "copy-image-facebook"
  | "send-to-phone"
  | "download"
  | "copy-caption";

export interface HandoffDestination {
  id: HandoffDestinationId;
  label: string;
  icon: string;
  /**
   * Renders the network's own mark instead of `icon`. The app has had these as
   * inline SVGs since Facebook sign-in shipped
   * (src/lib/shared/auth/components/icons/) — a generic glyph in their place
   * reads as a placeholder, because it is one.
   */
  brand?: "facebook" | "instagram";
  /** Primary renders as the filled button; the rest are secondary. */
  primary: boolean;
  /** One-word form for the compact tile row; the full label stays the a11y name. */
  short: string;
  /** Shown under the label when the action needs a word of explanation. */
  hint?: string;
}

export interface HandoffContext {
  artifact: ShareArtifact;
  /** Null while a video render is still in flight. */
  blob: Blob | null;
  filename: string;
}

/**
 * Which destinations this device can actually honor.
 *
 * Download is a separate explicit action. Offer the system share sheet on any
 * device that supports the file, rather than treating desktop as incapable.
 */
export function resolveDestinations(ctx: HandoffContext): HandoffDestination[] {
  const isMobile = detectPlatform() !== "desktop";
  const destinations: HandoffDestination[] = [];

  const shareable =
    supportsNativeFileShare() &&
    (!ctx.blob || canNativeShareFile(ctx.blob, ctx.filename));
  if (shareable) {
    destinations.push({
      id: "native-share",
      label: "Share to another app",
      short: "Share to another app",
      icon: "fa-solid fa-share-nodes",
      primary: true,
      hint: "Choose an app on this device",
    });
  }
  if (!isMobile) {
    destinations.push({
      id: "send-to-phone",
      label: "Transfer to phone",
      short: "Transfer",
      icon: "fa-solid fa-qrcode",
      primary: true,
      hint: "Upload a file, then scan its QR code",
    });

    if (ctx.artifact === "card") {
      destinations.push({
        id: "copy-image-facebook",
        label: "Copy image & open Facebook",
        short: "Facebook",
        icon: "fa-solid fa-image",
        brand: "facebook",
        primary: false,
        hint: "Paste into your post",
      });
    }
  }

  destinations.push({
    id: "download",
    label: isMobile ? "Save file" : "Download",
    short: isMobile ? "Save" : "Download",
    icon: "fa-solid fa-download",
    primary: false,
  });

  destinations.push({
    id: "copy-caption",
    label: "Copy caption",
    short: "Caption",
    icon: "fa-solid fa-clipboard",
    primary: false,
  });

  return destinations;
}

export interface HandoffResult {
  status: "done" | "canceled" | "failed";
  message?: string;
}

/**
 * Hand the file and optional caption to the device's share sheet. The receiving
 * app decides which supplied fields it accepts.
 */
export async function shareArtifactNatively(
  blob: Blob,
  filename: string,
  caption: string
): Promise<HandoffResult> {
  const result = await shareBlobNatively(blob, filename, {
    title: "Flow Arts Composer sequence",
    text: caption,
  });

  switch (result.status) {
    case "shared":
      return { status: "done" };
    case "canceled":
      return { status: "canceled" };
    case "unavailable":
      return {
        status: "failed",
        message: "Sharing files isn't available here",
      };
    default:
      return { status: "failed", message: "Share failed" };
  }
}

export async function downloadArtifact(
  blob: Blob,
  filename: string
): Promise<HandoffResult> {
  const result = await downloadBlobToDisk(blob, filename);
  return result.success
    ? { status: "done", message: "Download started" }
    : { status: "failed", message: "Download failed" };
}

/**
 * Last-resort clipboard write for browsers that refuse the async Clipboard API
 * (embedded webviews, denied permission). It only works inside the user's own
 * gesture, which is why callers run it synchronously after the failed write.
 */
function copyTextThroughSelection(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const host = document.createElement("textarea");
  host.value = text;
  host.setAttribute("readonly", "");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  try {
    host.select();
    host.setSelectionRange(0, text.length);
    return document.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    host.remove();
  }
}

async function copyText(text: string, noun: string): Promise<HandoffResult> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { status: "done", message: `${noun} copied` };
    } catch {
      // Denied permission falls through to the selection path below.
    }
  }

  if (copyTextThroughSelection(text)) {
    return { status: "done", message: `${noun} copied` };
  }
  return { status: "failed", message: `Couldn't copy ${noun.toLowerCase()}` };
}

export function copyCaption(caption: string): Promise<HandoffResult> {
  return copyText(caption, "Caption");
}

export function copyLink(url: string): Promise<HandoffResult> {
  return copyText(url, "Link");
}

/**
 * Starts a text clipboard write while a post link is still being prepared.
 * Safari keeps a click's clipboard permission only for work begun in that
 * click, but accepts promised ClipboardItem values and waits for their bytes.
 */
export async function copyPreparedLink(
  preparedUrl: Promise<string>
): Promise<HandoffResult> {
  // Clipboard capability can disappear between rendering and the click. Keep a
  // rejected preparation observed even when there is nowhere to write it.
  void preparedUrl.catch(() => {});
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return { status: "failed", message: "Clipboard unavailable" };
  }

  if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
    const textBlob = preparedUrl.then(
      (url) => new Blob([url], { type: "text/plain" })
    );
    // A denied write may return before preparation fails later.
    void textBlob.catch(() => {});
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": textBlob }),
      ]);
      const url = await preparedUrl;
      // Some embedded browsers acknowledge promised items without delivering
      // them. Complete the plain-text write where allowed; Safari may reject
      // this later write, but has already delivered the gesture-bound item.
      if (navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url).catch(() => {});
      }
      return { status: "done", message: "Link copied" };
    } catch {
      return { status: "failed", message: "Couldn't copy link" };
    }
  }

  try {
    return await copyLink(await preparedUrl);
  } catch {
    return { status: "failed", message: "Couldn't copy link" };
  }
}

const FACEBOOK_COMPOSER_URL = "https://www.facebook.com/";

/**
 * Desktop Facebook path: image onto the clipboard, caption onto the clipboard
 * is NOT possible simultaneously (one clipboard, one payload), so the image
 * wins — it is the part that cannot be retyped. The composer opens in a new
 * tab and the user pastes.
 *
 * Deliberately not `sharer.php?u=…`: that produces a link-preview post, not a
 * post containing the image, which is the opposite of what this is for.
 */
export async function copyImageAndOpenFacebook(
  blob: Blob
): Promise<HandoffResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    return { status: "failed", message: "Clipboard unavailable" };
  }

  if (blob.type !== "image/png") {
    return { status: "failed", message: "Only images can be copied" };
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch {
    return { status: "failed", message: "Couldn't copy the image" };
  }

  window.open(FACEBOOK_COMPOSER_URL, "_blank", "noopener,noreferrer");
  return { status: "done", message: "Image copied. Paste into your post" };
}

/**
 * The link that goes in a post: `https://tkaflowarts.com/sequence/A1F8`.
 *
 * Deliberately NOT `tka.run/A1F8` or `/q/A1F8`, even though both resolve the
 * same code. `/q/` is the QR-scan route and the attribution boundary — it
 * cannot tell a camera scan from a clicked link (see
 * `qr/utils/scan-detection.ts`), so every click from a caption would post as a
 * physical-card scan and corrupt scan counts. tka.run redirects straight into
 * it, so it has the same problem plus a domain nobody recognizes in a feed.
 * `/sequence/[id]` is the share route: it resolves the code, tracks nothing,
 * and is already what the page emits as its own canonical URL
 * (`routes/sequence/[id]/sequence-seo.ts`).
 *
 * Codes are minted uppercase for QR density; the path keeps that case because
 * the resolver is case-sensitive.
 */
export function buildPostLink(code: string): string {
  return `${POST_LINK_PREFIX}${encodeURIComponent(code)}`;
}

const POST_LINK_PREFIX = "https://tkaflowarts.com/sequence/";

/**
 * Whether a caller already handed us a postable link. The viewer's own share
 * URL is the same route but carries the whole sequence inline and runs past
 * 200 characters, so it fails this on length alone — a code is 4–6 chars.
 */
export function isPostLink(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith(POST_LINK_PREFIX)) return false;
  return /^[0-9A-Za-z]{4,6}$/.test(trimmed.slice(POST_LINK_PREFIX.length));
}

/** `FΨ.png` / `FΨ.mp4`, Greek glyphs preserved, repeats simplified. */
export function buildArtifactFilename(
  word: string,
  artifact: ShareArtifact
): string {
  const safe = sanitizeFilename(simplifyRepeatedWord(word || "")) || "sequence";
  return `${safe}.${artifact === "video" ? "mp4" : "png"}`;
}
