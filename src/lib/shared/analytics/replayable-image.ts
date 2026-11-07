import { REPLAY_BLOCK_CLASS, replayRecording } from "./replay-recording.js";

/**
 * Svelte action for an <img> whose `src` may be a blob: URL made on this
 * device (rendered thumbnails, the card preview). A session replay cannot
 * fetch another browser's blob: URL, so those pictures showed as empty boxes.
 * While replay records, the action swaps the blob for a data: URL of the same
 * bytes, which the recording carries with it. Pass the same URL the `src`
 * attribute gets: `<img src={url} use:replayableImage={url} />`. A picture
 * inside an area replays leave out, like the gallery grid, is left alone.
 */
export function replayableImage(
  img: HTMLImageElement,
  url: string | null | undefined
) {
  let current = url;

  async function inline(target: string | null | undefined) {
    if (!target?.startsWith("blob:") || !replayRecording()) return;
    if (img.closest(`.${REPLAY_BLOCK_CLASS}`)) return;
    try {
      const blob = await (await fetch(target)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // A newer picture may have replaced this one while it was read.
      if (current === target && img.getAttribute("src") === target) {
        img.src = dataUrl;
      }
    } catch {
      // The owner revoked the blob first; the replay keeps the empty box.
    }
  }

  void inline(url);
  return {
    update(next: string | null | undefined) {
      current = next;
      void inline(next);
    },
  };
}
