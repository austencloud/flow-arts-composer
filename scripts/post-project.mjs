#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const base = new URL(option("url") ?? "https://[::1]:5173");
if (
  !["http:", "https:"].includes(base.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
) {
  throw new Error("--url must be a loopback HTTP(S) address.");
}

async function request(method, query = {}, body) {
  const url = new URL("/api/dev/post-project", base);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, value);
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const transport = url.protocol === "https:" ? https : http;
  const response = await new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: {
          Accept: "application/json",
          Origin: base.origin,
          ...(encoded
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(encoded),
              }
            : {}),
        },
        // The dev server uses a local self-signed certificate. This exception is scoped to this request.
        ...(url.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          try {
            const value = JSON.parse(text);
            if ((res.statusCode ?? 500) >= 400)
              reject(
                new Error(
                  value.message ?? value.error ?? `HTTP ${res.statusCode}`
                )
              );
            else resolve(value);
          } catch (cause) {
            reject(cause);
          }
        });
      }
    );
    req.on("error", reject);
    req.end(encoded);
  });
  return response;
}

const EDIT_COMMANDS = {
  "add-hook": () => ({
    op: "add-hook",
    ...number("seconds"),
    ...number("fold"),
    ...(flag("mirror") ? { mirror: option("mirror") !== "false" } : {}),
    ...(option("speed") ? { speed: option("speed") } : {}),
  }),
  "remove-hook": () => ({ op: "remove-hook" }),
  "hook-speed": () => ({ op: "hook-speed", speed: positional(0, "a curve") }),
  appearance: () => ({
    op: "appearance",
    ...(option("item") ? { item: option("item") } : {}),
    set: Object.fromEntries(
      repeated("set").map((pair) => {
        const at = pair.indexOf("=");
        if (at < 1) throw new Error(`--set needs key=value, got "${pair}".`);
        return [pair.slice(0, at), literal(pair.slice(at + 1))];
      })
    ),
  }),
  item: () => ({
    op: "item",
    item: required("item"),
    patch: JSON.parse(required("patch")),
  }),
  trim: () => ({
    op: "trim",
    item: required("item"),
    edge: required("edge"),
    seconds: Number(required("seconds")),
  }),
  delete: () => ({ op: "delete", item: required("item") }),
  canvas: () => ({ op: "canvas", canvas: positional(0, "a ratio") }),
  background: () => ({
    op: "background",
    background: positional(0, "dark or blur"),
  }),
};

const BOOLEAN_FLAGS = ["--mirror", "--no-wait", "--json"];
function flag(name) {
  return args.includes(`--${name}`);
}
function required(name) {
  const value = option(name);
  if (value === undefined) throw new Error(`--${name} is required.`);
  return value;
}
function number(name) {
  return option(name) === undefined ? {} : { [name]: Number(option(name)) };
}
function repeated(name) {
  return args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
}
function literal(text) {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
}
/** Bare words after the command, skipping every `--flag value` pair. */
function positional(index, what) {
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) {
      if (!BOOLEAN_FLAGS.includes(args[i])) i += 1;
    } else words.push(args[i]);
  }
  if (words[index] === undefined) throw new Error(`${command} needs ${what}.`);
  return words[index];
}

/** The editor to talk to: --session, else --sequence, else the only open one. */
async function resolveSession() {
  if (option("session")) return option("session");
  const { sessions } = await request("GET");
  const wanted = option("sequence");
  const matches = wanted
    ? sessions.filter((session) => session.sequenceId === wanted)
    : sessions;
  if (matches.length === 1) return matches[0].id;
  throw new Error(
    matches.length === 0
      ? "No open Post Studio editor matches. Open the post in the browser first."
      : `${matches.length} editors are open; pass --session ID or --sequence ID (see the list command).`
  );
}

function summarize(snapshot) {
  const rows = [];
  snapshot.tracks.forEach((track, trackIndex) => {
    for (const item of track.items)
      rows.push(
        `track ${trackIndex}  ${item.id}  ${item.kind}${item.tunnelHook ? " (hook)" : ""}  ${item.start.toFixed(2)}s +${item.duration.toFixed(2)}s${item.label ? `  "${item.label}"` : ""}`
      );
  });
  return rows.join("\n");
}

async function sendOps(ops) {
  const sessionId = await resolveSession();
  const queued = await request("POST", {}, { kind: "ops", sessionId, ops });
  if (queued.status === "unchanged") return { status: "unchanged" };
  if (flag("no-wait")) return queued;
  for (let waited = 0; waited < 15000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const status = await request("GET", {
      sessionId,
      commandId: queued.commandId,
    });
    if (status.status !== "pending") return status;
  }
  return { ...queued, note: "The editor has not applied it yet." };
}

try {
  let result;
  if (command === "list") result = await request("GET");
  else if (command === "show") {
    const session = await request("GET", { sessionId: await resolveSession() });
    if (flag("json")) result = session.snapshot;
    else {
      process.stdout.write(summarize(session.snapshot) + "\n");
      result = undefined;
    }
  } else if (command === "ops") {
    const file = required("file");
    result = await sendOps(JSON.parse(await fs.readFile(file, "utf8")));
  } else if (command in EDIT_COMMANDS) {
    result = await sendOps([EDIT_COMMANDS[command]()]);
  } else if (command === "read") {
    if (!option("session")) throw new Error("read requires --session.");
    result = await request("GET", { sessionId: option("session") });
  } else if (command === "apply") {
    const sessionId = option("session");
    const baseRevision = Number(option("base-revision"));
    const baseFingerprint = option("base-fingerprint");
    const file = option("file");
    if (
      !sessionId ||
      !Number.isSafeInteger(baseRevision) ||
      !baseFingerprint ||
      !file
    )
      throw new Error(
        "apply requires --session, --base-revision, --base-fingerprint and --file."
      );
    result = await request(
      "POST",
      {},
      {
        kind: "apply",
        sessionId,
        baseRevision,
        baseFingerprint,
        project: JSON.parse(await fs.readFile(file, "utf8")),
      }
    );
  } else if (command === "status") {
    if (!option("session") || !option("command"))
      throw new Error("status requires --session and --command.");
    result = await request("GET", {
      sessionId: option("session"),
      commandId: option("command"),
    });
  } else
    throw new Error(
      `Usage: post-project.mjs <command> [--url loopback-url] [--session ID | --sequence ID]
  list                         open editors
  show [--json]                items of the open post
  add-hook [--seconds 5] [--fold 8] [--mirror] [--speed ease-out]
  remove-hook
  hook-speed <ease-out|ease-in|ease-in-out|linear|smooth|overshoot|default|x1,y1,x2,y2>
  appearance [--item hook|animations|all|ID] --set glyph=false ...  (keys: tkaGlyph stepNumbers gridMode progressBar ...; null clears)
  item --item ID --patch '{"opacity":0.5}'
  trim --item ID --edge start|end --seconds N
  delete --item ID
  canvas <ratio>   background <dark|blur>
  ops --file ops.json          a batch applied in one step
  read|apply|status            whole-manifest bridge (--session, --base-revision, --base-fingerprint, --file, --command)
  Add --no-wait to return before the editor confirms; --out file to write output.`
    );
  if (result !== undefined) {
    const output = JSON.stringify(result, null, 2) + "\n";
    if (option("out")) await fs.writeFile(option("out"), output);
    else process.stdout.write(output);
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
}
