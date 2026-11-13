/**
 * Whether the preview shows a Reel's own controls over the post, so its
 * framing can be judged the way people will see it. One switch for the
 * session, remembered on this device.
 */
const KEY = "tka:post-studio:reels-preview";

function stored(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let shown = $state(stored());

export const reelsPreview = {
  get shown(): boolean {
    return shown;
  },
  toggle(): void {
    shown = !shown;
    try {
      globalThis.localStorage?.setItem(KEY, shown ? "1" : "0");
    } catch {
      // Private windows keep the switch for this page only.
    }
  },
};

/**
 * The canvas a Reel's controls cover, as shares of a 9:16 post: the header
 * across the top and the caption across the bottom. The buttons down the
 * right side sit between them, over the lower middle.
 */
export const REELS_COVERED = {
  top: 140 / 1920,
  bottom: 360 / 1920,
  right: { width: 150 / 1080, top: 1000 / 1920, bottom: 1560 / 1920 },
} as const;
