import { execFile } from "node:child_process";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  emptyPhoneReviewInteractionState,
  parsePhoneReviewInteractionState,
  type PhoneReviewCommand,
  type PhoneReviewInteractionState,
} from "../src/lib/shared/dev/phone-review-interactions";

function usage(): never {
  throw new Error(`Usage:
  npm run review:control -- status
  npm run review:control -- inspect <client-id>
  npm run review:control -- click <client-id> (--id <control-id> | --name <exact-name>)
  npm run review:control -- set <client-id> (--id <control-id> | --name <exact-name>) --value <value>

Use status first, then inspect the exact client. Commands expire after 30 seconds.`);
}

async function stateFile(): Promise<string> {
  const commonDirectory = await new Promise<string>((resolve, reject) => {
    execFile("git", ["rev-parse", "--git-common-dir"], { timeout: 2_000, windowsHide: true }, (failure, stdout) => failure ? reject(failure) : resolve(stdout.trim()));
  });
  return path.resolve(process.cwd(), commonDirectory, "phone-review-interactions.json");
}

async function readState(file: string): Promise<PhoneReviewInteractionState> {
  try { return parsePhoneReviewInteractionState(JSON.parse(await readFile(file, "utf8"))) ?? emptyPhoneReviewInteractionState(); } catch { return emptyPhoneReviewInteractionState(); }
}

async function saveState(file: string, state: PhoneReviewInteractionState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

async function acquireLock(file: string) {
  const lockPath = `${file}.lock`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      return async () => { await handle.close(); await rm(lockPath, { force: true }); };
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Phone review interaction state is busy");
}

function routeFor(state: PhoneReviewInteractionState, clientId: string): string {
  const client = state.clients.find((candidate) => candidate.id === clientId);
  if (!client) throw new Error(`No connected review client named ${clientId}. Run status first.`);
  return client.route;
}

const [operation, clientId, ...arguments_] = process.argv.slice(2);
const file = await stateFile();
const releaseLock = await acquireLock(file);
const state = await readState(file);
const now = Date.now();
state.clients = state.clients.filter((client) => now - Date.parse(client.lastSeenAt) < 20_000);
state.commands = state.commands.filter((command) => Date.parse(command.expiresAt) > now || !command.result);

if (operation === "status") {
  if (clientId) usage();
  if (!state.clients.length) console.log("No connected review clients. Open /review and wait a moment.");
  for (const client of state.clients) console.log(`${client.id}\t${client.viewport}\t${client.label}\t${client.route}\t${client.controls.length} controls`);
  for (const client of state.clients) {
    console.log(`controls for ${client.id}:`);
    for (const control of client.controls) console.log(`  ${control.id}\t${control.kind}${control.inputType ? `:${control.inputType}` : ""}\t${control.disabled ? "disabled" : "enabled"}\t${control.name}${control.options ? `\tvalues: ${control.options.join(", ")}` : ""}`);
  }
  for (const command of state.commands.slice(-10)) console.log(`command ${command.id}\t${command.clientId}\t${command.kind}\t${command.result?.status ?? (command.deliveredAt ? "delivered" : "queued")}\t${command.result?.message ?? ""}`);
  await saveState(file, state);
  await releaseLock();
  process.exit(0);
}
if (!clientId || !["inspect", "click", "set"].includes(operation ?? "")) usage();

const flags = new Map<string, string>();
for (let index = 0; index < arguments_.length; index += 2) {
  const key = arguments_[index];
  const value = arguments_[index + 1];
  if (!key?.startsWith("--") || !value || flags.has(key)) usage();
  flags.set(key, value);
}
const controlId = flags.get("--id");
const controlName = flags.get("--name");
if (operation !== "inspect" && (!controlId && !controlName || controlId && controlName)) usage();
const value = flags.get("--value");
if ((operation === "set") !== Boolean(value) || [...flags.keys()].some((key) => !["--id", "--name", "--value"].includes(key))) usage();

const command: PhoneReviewCommand = {
  id: randomUUID(), kind: operation as PhoneReviewCommand["kind"], clientId,
  expectedRoute: routeFor(state, clientId), createdAt: new Date().toISOString(),
  expiresAt: new Date(now + 30_000).toISOString(),
  ...(controlId ? { controlId } : {}), ...(controlName ? { controlName } : {}), ...(value ? { value } : {}),
};
state.commands.push(command);
await saveState(file, state);
await releaseLock();
console.log(`Queued ${command.kind} for ${clientId} on ${command.expectedRoute}; expires in 30 seconds.`);
