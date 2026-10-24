import type { NativeViewerState } from "./bridge-protocol";

export type NativeCommand = (
  type: string,
  payload: object
) => Promise<NativeViewerState>;

/** Serialize uploads and claim each cast generation only once. */
export class MotionTransferQueue {
  private tail: Promise<void> = Promise.resolve();
  private claimed = new Set<string>();

  resetClaims(): void {
    this.claimed.clear();
  }

  enqueue(
    key: string,
    isCurrent: () => boolean,
    transfer: () => Promise<void>
  ): Promise<void> {
    if (this.claimed.has(key)) return this.tail;
    this.claimed.add(key);
    const attempt = this.tail.then(async () => {
      if (isCurrent()) await transfer();
    });
    // A failed upload must not prevent a later cast generation from retrying.
    this.tail = attempt.catch(() => {});
    return this.tail;
  }
}

/** Match the captured score's authored seconds to a fractional Composer step. */
export function scoreStepToSeconds(
  steps: readonly { duration: number }[],
  step: number,
  startOffset = 0
): number {
  if (!steps.length || !Number.isFinite(step) || !Number.isFinite(startOffset))
    return 0;
  const motionStep = Math.max(0, step - startOffset);
  const wrapped = motionStep % steps.length;
  const whole = Math.floor(wrapped);
  let seconds = 0;
  for (let index = 0; index < whole; index++) seconds += steps[index]!.duration;
  return seconds + (steps[whole]?.duration ?? 0) * (wrapped - whole);
}

/** Stay below Pixel Streaming's message limit without splitting a Unicode character. */
export async function transferNativeMotion(
  command: NativeCommand,
  performerId: string,
  bundle: object,
  isCurrent: () => boolean
): Promise<boolean> {
  const json = JSON.stringify(bundle);
  const chunkSize = 24_000;
  const totalBytes = new TextEncoder().encode(json).byteLength;
  if (totalBytes > 64 * 1024 * 1024)
    throw new Error("This motion exceeds the Unreal transfer limit.");
  const chunks: string[] = [];
  for (let start = 0; start < json.length; ) {
    let end = Math.min(start + chunkSize, json.length);
    if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1]!)) end--;
    chunks.push(json.slice(start, end));
    start = end;
  }
  const totalChunks = chunks.length;
  const transferId = crypto.randomUUID();
  if (!isCurrent()) return false;
  await command("beginMotion", {
    performerId,
    transferId,
    totalChunks,
    totalBytes,
  });
  for (let index = 0; index < totalChunks; index++) {
    // Once begun, finish the transfer even if the score changes. Unreal has one
    // transfer slot; abandoning it prevents every later performer from loading.
    await command("motionChunk", { transferId, index, data: chunks[index] });
  }
  await command("commitMotion", { transferId });
  return isCurrent();
}
