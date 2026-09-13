import { dev } from "$app/environment";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  defaultPhoneReviewTarget,
  parsePhoneReviewTarget,
  type PhoneReviewTarget,
} from "$lib/shared/dev/phone-review-target";

interface ServedCheckout {
  branch: string | null;
  commit: string | null;
}

async function runGit(args: string[]): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: process.cwd(), timeout: 2_000, windowsHide: true },
      (failure, stdout) => {
        resolve(failure ? null : stdout.trim() || null);
      }
    );
  });
}

async function stateFilePath(): Promise<string> {
  const [commonDir, path] = await Promise.all([
    runGit(["rev-parse", "--git-common-dir"]),
    import("node:path"),
  ]);
  return path.resolve(
    process.cwd(),
    commonDir ?? ".git",
    "phone-review-target.json"
  );
}

async function readTarget(): Promise<{
  target: PhoneReviewTarget;
  stateError: boolean;
}> {
  const [fs, filePath] = await Promise.all([
    import("node:fs/promises"),
    stateFilePath(),
  ]);
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    const target = parsePhoneReviewTarget(parsed);
    return target
      ? { target, stateError: false }
      : { target: defaultPhoneReviewTarget(), stateError: true };
  } catch (readError) {
    if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
      return { target: defaultPhoneReviewTarget(), stateError: false };
    }
    return { target: defaultPhoneReviewTarget(), stateError: true };
  }
}

async function readServedCheckout(): Promise<ServedCheckout> {
  const [branch, commit] = await Promise.all([
    runGit(["branch", "--show-current"]),
    runGit(["rev-parse", "--short", "HEAD"]),
  ]);
  return { branch, commit };
}

export const GET: RequestHandler = async () => {
  if (!dev) error(404, "Not found");

  const [{ target, stateError }, served] = await Promise.all([
    readTarget(),
    readServedCheckout(),
  ]);
  return json({ target, served, stateError });
};
