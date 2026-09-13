import {
  emptyPhoneReviewInteractionState,
  parsePhoneReviewInteractionState,
  type PhoneReviewInteractionState,
} from "$lib/shared/dev/phone-review-interactions";

async function gitCommonDirectory(): Promise<string> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["rev-parse", "--git-common-dir"],
      { cwd: process.cwd(), timeout: 2_000, windowsHide: true },
      (failure, stdout) => (failure ? reject(failure) : resolve(stdout.trim()))
    );
  });
}

export async function phoneReviewInteractionStatePath(): Promise<string> {
  const path = await import("node:path");
  return path.resolve(
    process.cwd(),
    await gitCommonDirectory(),
    "phone-review-interactions.json"
  );
}

export async function readPhoneReviewInteractionState(): Promise<PhoneReviewInteractionState> {
  try {
    const { readFile } = await import("node:fs/promises");
    const filePath = await phoneReviewInteractionStatePath();
    const parsed = parsePhoneReviewInteractionState(
      JSON.parse(await readFile(filePath, "utf8"))
    );
    return parsed ?? emptyPhoneReviewInteractionState();
  } catch {
    return emptyPhoneReviewInteractionState();
  }
}

export async function writePhoneReviewInteractionState(
  state: PhoneReviewInteractionState
): Promise<void> {
  const { mkdir, rename, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = await phoneReviewInteractionStatePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

/** The review shell and CLI share one small local file, so serialize updates. */
export async function updatePhoneReviewInteractionState<T>(
  update: (state: PhoneReviewInteractionState) => Promise<T> | T
): Promise<T> {
  const { open, rm } = await import("node:fs/promises");
  const filePath = await phoneReviewInteractionStatePath();
  const lockPath = `${filePath}.lock`;
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      lock = await open(lockPath, "wx");
      break;
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!lock) throw new Error("Phone review interaction state is busy");
  try {
    const state = await readPhoneReviewInteractionState();
    const result = await update(state);
    await writePhoneReviewInteractionState(state);
    return result;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
