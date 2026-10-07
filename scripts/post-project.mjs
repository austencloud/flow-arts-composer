#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { importTake } from "./feature-video/media-import.mjs";

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

const BRIDGE = "/api/dev/post-project";
const FEATURE_API = "/api/dev/feature-videos";
/** A feature video's route: its file, or its `ops`, `duplicate` or `media`. */
const featureRoute = (slug, ...rest) =>
  [FEATURE_API, encodeURIComponent(slug), ...rest].join("/");
/** Where the media route serves a project file; matches featureVideoMediaUrl. */
const featureMediaUrl = (slug, relativePath) =>
  `${featureRoute(slug, "media")}/${relativePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;

async function request(method, query = {}, body, route = BRIDGE) {
  const url = new URL(route, base);
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
          const status = res.statusCode ?? 500;
          let value;
          try {
            value = JSON.parse(text);
          } catch {
            reject(
              Object.assign(
                new Error(
                  `${url.pathname} answered ${status} without JSON. Is this the dev server, and does it have this route?`
                ),
                { status }
              )
            );
            return;
          }
          if (status >= 400)
            reject(
              Object.assign(
                new Error(value.message ?? value.error ?? `HTTP ${status}`),
                { status }
              )
            );
          else resolve(value);
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
  "line-up-hook": () => ({ op: "line-up-hook" }),
  "add-titles": () => ({
    op: "add-titles",
    ...(option("spoken") !== undefined ? { spoken: option("spoken") } : {}),
    ...number("at"),
  }),
  "hook-speed": () => ({ op: "hook-speed", speed: positional(0, "a curve") }),
  "hook-frame": () => ({
    op: "hook-frame",
    ...number("zoom"),
    ...number("x"),
    ...number("y"),
    ...(flag("whole") ? { whole: true } : {}),
  }),
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
  "remove-take": () => ({ op: "remove-take", take: required("take") }),
};

const BOOLEAN_FLAGS = [
  "--mirror",
  "--no-wait",
  "--json",
  "--append",
  "--share-media",
];
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

/** An ordinary post's editor: --session, else --sequence, else the only one open. */
async function resolveSession() {
  if (option("session")) return option("session");
  const { sessions } = await request("GET");
  const wanted = option("sequence");
  // A feature video's editor takes edits only through --feature.
  const matches = sessions.filter(
    (session) =>
      !session.featureSlug && (!wanted || session.sequenceId === wanted)
  );
  if (matches.length === 1) return matches[0].id;
  throw new Error(
    matches.length === 0
      ? "No open Post Studio editor matches. Open the post in the browser first."
      : `${matches.length} editors are open; pass --session ID or --sequence ID (see the list command).`
  );
}

/** The one open editor holding this feature video, or null when none does. */
async function featureSession(slug) {
  const { sessions } = await request("GET");
  const holding = sessions.filter((session) => session.featureSlug === slug);
  if (holding.length > 1)
    throw new Error(
      `${holding.length} editors have ${slug} open. Close all but one, then try again.`
    );
  return holding[0]?.id ?? null;
}

function summarize(snapshot) {
  const rows = [];
  snapshot.tracks.forEach((track, trackIndex) => {
    for (const item of track.items)
      rows.push(
        `track ${trackIndex}  ${item.id}  ${item.kind}${item.tunnelHook ? " (opening tunnel)" : ""}  ${item.start.toFixed(2)}s +${item.duration.toFixed(2)}s${item.label ? `  "${item.label}"` : ""}`
      );
  });
  return rows.join("\n");
}

async function sendToEditor(sessionId, ops) {
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

/**
 * Sends edits. With --feature they go to the editor that has the feature
 * video open, as undo steps there, or to the file on disk when none does.
 */
async function sendOps(ops) {
  const feature = option("feature");
  if (!feature || option("session"))
    return sendToEditor(await resolveSession(), ops);
  const held = await featureSession(feature);
  if (held) return sendToEditor(held, ops);
  try {
    return await request("POST", {}, { ops }, featureRoute(feature, "ops"));
  } catch (cause) {
    // An editor opened it a moment ago: the edit goes there instead.
    if (cause?.status !== 409) throw cause;
    const opened = await featureSession(feature);
    if (!opened) throw cause;
    return sendToEditor(opened, ops);
  }
}

/** The post as it is now: in its editor, else, for a feature video, on disk. */
async function currentSnapshot() {
  const feature = option("feature");
  if (!feature || option("session"))
    return (await request("GET", { sessionId: await resolveSession() }))
      .snapshot;
  const held = await featureSession(feature);
  if (held) return (await request("GET", { sessionId: held })).snapshot;
  return (await request("GET", {}, undefined, featureRoute(feature))).file
    .project;
}

try {
  let result;
  if (command === "list") result = await request("GET");
  else if (command === "show") {
    const snapshot = await currentSnapshot();
    if (flag("json")) result = snapshot;
    else {
      process.stdout.write(summarize(snapshot) + "\n");
      result = undefined;
    }
  } else if (command === "ops") {
    const file = required("file");
    result = await sendOps(JSON.parse(await fs.readFile(file, "utf8")));
  } else if (command in EDIT_COMMANDS) {
    result = await sendOps([EDIT_COMMANDS[command]()]);
  } else if (command === "features") {
    result = await request("GET", {}, undefined, FEATURE_API);
  } else if (command === "create") {
    const slug = positional(0, "a name, such as promo-1-0");
    result = await request(
      "POST",
      {},
      {
        slug,
        title: option("title") ?? slug,
        sequenceId: required("sequence"),
        ...(option("canvas") ? { canvas: option("canvas") } : {}),
      },
      FEATURE_API
    );
  } else if (command === "add-take") {
    const feature = required("feature");
    const file = path.resolve(positional(0, "a video file"));
    if (!/\.(mp4|mov)$/i.test(file))
      throw new Error("add-take takes an .mp4 or .mov file.");
    const { folder } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const take = await importTake(file, path.join(folder, "media", "footage"));
    result = {
      media: take.relativePath,
      converted: take.transcoded,
      edit: await sendOps([
        {
          op: "add-take",
          url: featureMediaUrl(feature, take.relativePath),
          durationSeconds: take.durationSeconds,
          ...(option("label") ? { label: option("label") } : {}),
          ...(flag("append") ? { append: true } : {}),
        },
      ]),
    };
  } else if (command === "duplicate") {
    result = await request(
      "POST",
      {},
      {
        slug: positional(1, "a name for the copy"),
        ...(option("title") ? { title: option("title") } : {}),
        ...(flag("share-media") ? { shareMedia: true } : {}),
      },
      featureRoute(positional(0, "the feature video to copy"), "duplicate")
    );
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
      `Usage: post-project.mjs <command> [--url loopback-url] [--session ID | --sequence ID | --feature SLUG]
  list                         open editors
  show [--json]                items of the open post
  add-hook [--seconds 5] [--fold 8] [--mirror] [--speed ease-out]
  remove-hook
  line-up-hook                 end the tunnel on the footage's opening pose, footage behind it
  add-titles [--spoken "how to say it"] [--at N]   name titles clip, over the opening tunnel when there is one
  hook-speed <ease-out|ease-in|ease-in-out|linear|smooth|overshoot|default|x1,y1,x2,y2>
  hook-frame [--zoom 1.4] [--x 0.5] [--y 0.55] [--whole]   frame the footage behind the opening tunnel
  appearance [--item hook|animations|all|ID] --set glyph=false ...  (keys: tkaGlyph stepNumbers gridMode progressBar ...; null clears)
  item --item ID --patch '{"opacity":0.5}'
  trim --item ID --edge start|end --seconds N
  delete --item ID
  canvas <ratio>   background <dark|blur>
  ops --file ops.json          a batch applied in one step
  read|apply|status            whole-manifest bridge (--session, --base-revision, --base-fingerprint, --file, --command)
Feature videos, folders on the dev server's computer:
  features                     list them
  create <slug> --sequence ID [--title "Title"] [--canvas 9:16]
  add-take <clip.mp4|clip.mov> --feature SLUG [--label "Name"] [--append]   copies it into media/footage; HEVC, HDR and .mov become H.264 MP4
  remove-take --take ID
  duplicate <slug> <new-slug> [--title "Title"] [--share-media]
  With --feature, show and every edit use the editor that has it open, else the file on disk.
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
