import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  parsePhoneReviewTarget,
  type PhoneReviewTarget,
} from "../src/lib/shared/dev/phone-review-target";

function usage(): never {
  throw new Error(
    "Usage: npm run review:target -- /app/path [--reload]. Paths must be same-origin and cannot start with /review."
  );
}

const [rawPath, ...flags] = process.argv.slice(2);
if (!rawPath || flags.some((flag) => flag !== "--reload")) usage();

const commonDirectory = await new Promise<string>((resolve, reject) => {
  execFile(
    "git",
    ["rev-parse", "--git-common-dir"],
    { timeout: 2_000, windowsHide: true },
    (failure, stdout) => {
      if (failure) reject(failure);
      else resolve(stdout.trim());
    }
  );
});
const stateFile = path.resolve(
  process.cwd(),
  commonDirectory,
  "phone-review-target.json"
);
let previousRevision = 0;
try {
  const previous = parsePhoneReviewTarget(
    JSON.parse(await readFile(stateFile, "utf8"))
  );
  previousRevision = previous?.revision ?? 0;
} catch {}
const target: PhoneReviewTarget = {
  path: rawPath,
  revision: flags.includes("--reload") ? Date.now() : previousRevision,
  updatedAt: new Date().toISOString(),
};
if (!parsePhoneReviewTarget(target)) usage();
await mkdir(path.dirname(stateFile), { recursive: true });
const temporaryFile = `${stateFile}.${process.pid}.${Date.now()}.tmp`;
await writeFile(temporaryFile, `${JSON.stringify(target, null, 2)}\n`, "utf8");
await rename(temporaryFile, stateFile);
console.log(
  `Phone review target set to ${target.path}${flags.length ? " (reload)" : ""}.`
);
