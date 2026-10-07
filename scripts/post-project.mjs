#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { alignTake, mediaPathFromUrl } from "./feature-video/align-take.mjs";
import {
  PEAK_CEILING_DBTP,
  TARGET_LUFS,
  measureLoudness,
  suggestMusicGain,
} from "./feature-video/loudness.mjs";
import {
  assertCaptureId,
  clipChanges,
  findCaptureTake,
} from "./feature-video/capture-files.mjs";
import { importTake, probeMedia } from "./feature-video/media-import.mjs";
import { importMusic } from "./feature-video/music-import.mjs";
import { parseTimeArg } from "./feature-video/time-args.mjs";

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
const NO_MUSIC = "This post has no music. Add it with: add-music <file>.";

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
    ...time("at"),
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
    seconds: parseTimeArg(required("seconds"), "seconds"),
  }),
  delete: () => ({ op: "delete", item: required("item") }),
  canvas: () => ({ op: "canvas", canvas: positional(0, "a ratio") }),
  background: () => ({
    op: "background",
    background: positional(0, "dark or blur"),
  }),
  "remove-take": () => ({ op: "remove-take", take: required("take") }),
  music: () => {
    const patch = {
      ...time("start", "startSeconds"),
      ...time("from", "sourceInSeconds"),
      ...time("to", "sourceOutSeconds"),
      ...number("gain"),
      ...number("fade-in", "fadeInSeconds"),
      ...number("fade-out", "fadeOutSeconds"),
      ...bpm(),
      ...number("downbeat", "downbeatSeconds"),
      ...number("beats-per-bar", "beatsPerBar"),
      ...text("label"),
      ...text("artist"),
      ...text("license"),
    };
    if (Object.keys(patch).length === 0)
      throw new Error(
        "music needs a setting to change, such as --gain 0.8 or --bpm 85."
      );
    return { op: "music", ...patch };
  },
  "remove-music": () => ({ op: "remove-music" }),
  "sync-to-music": () => {
    required("offset");
    return {
      op: "sync-to-music",
      item: required("item"),
      offsetSeconds: numberOption("offset"),
    };
  },
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
/** A number flag's value, or undefined when the flag is absent. */
function numberOption(name) {
  const value = option(name);
  if (value === undefined) return undefined;
  // JSON would send NaN as null, which some edits read as "remove".
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error(`--${name} must be a number.`);
  return Number(value);
}
function number(name, key = name) {
  const value = numberOption(name);
  return value === undefined ? {} : { [key]: value };
}
/** A time flag: seconds, a clock, or a bar of the music such as @9.3. */
function time(name, key = name) {
  const value = option(name);
  return value === undefined ? {} : { [key]: parseTimeArg(value, name) };
}
/** A text flag; an empty one removes an artist or license. */
function text(name) {
  const value = option(name);
  return value === undefined ? {} : { [name]: value };
}
/** --bpm: a tempo, or none to remove the beat grid. */
function bpm() {
  const value = option("bpm");
  if (value === undefined) return {};
  if (value === "none") return { bpm: null };
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error("--bpm must be a number, or none to remove the beat grid.");
  return { bpm: Number(value) };
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
    if (status.status !== "pending") {
      // A refused edit fails the command, so a script that checks the exit
      // code stops there.
      if (status.status === "failed") process.exitCode = 1;
      return status;
    }
  }
  process.exitCode = 1;
  return {
    ...queued,
    note: `The editor has not applied it yet. Check with: node scripts/post-project.mjs status --session ${sessionId} --command ${queued.commandId}`,
  };
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

/**
 * The file in this feature video's media/music/ that the post plays its music
 * from, or undefined. The editor keeps a music's place, trims and credits only
 * while its URL stays the same, so add-music hands this file name to
 * importMusic to get the same song back as this exact file.
 */
function musicFileInUse(project, feature) {
  const prefix = `${featureMediaUrl(feature, "music")}/`;
  const url = project.music?.url;
  if (!url?.startsWith(prefix)) return undefined;
  try {
    return decodeURIComponent(url.slice(prefix.length));
  } catch {
    // A hand-edited url that no file can match; add-music replaces it.
    return undefined;
  }
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
  } else if (command === "capture-info") {
    const feature = required("feature");
    const { folder, file } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const existing = await fs
      .readdir(path.join(folder, "media", "captures"))
      .catch(() => []);
    result = {
      folder,
      existing,
      takes: (file.project.takes ?? []).map((take) => ({
        id: take.id,
        label: take.label,
        url: take.ref.kind === "linked" ? take.ref.url : null,
      })),
    };
  } else if (command === "link-capture") {
    const feature = required("feature");
    const capture = assertCaptureId(required("capture"));
    const media = required("media");
    if (!new RegExp(`^captures/${capture}\\.\\d+\\.mp4$`).test(media))
      throw new Error(`--media must be captures/${capture}.<n>.mp4.`);
    const { folder } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const { durationSeconds } = await probeMedia(
      path.join(folder, "media", ...media.split("/"))
    );
    const mediaUrl = featureMediaUrl(feature, media);
    // The open editor's post, which may hold edits not saved to disk yet.
    const before = await currentSnapshot();
    const earlier = findCaptureTake(before.takes ?? [], capture);
    const edit = await sendOps([
      earlier
        ? {
            op: "relink-take",
            take: earlier.id,
            url: mediaUrl,
            durationSeconds,
          }
        : {
            op: "add-take",
            url: mediaUrl,
            durationSeconds,
            label: option("label") ?? capture,
          },
    ]);
    const landed = edit.status === "completed" || edit.status === "applied";
    const clips =
      earlier && landed
        ? clipChanges(before, await currentSnapshot(), earlier.id)
        : null;
    result = {
      media,
      durationSeconds,
      take: earlier?.id ?? null,
      edit,
      ...(clips ? { clips } : {}),
      ...(clips?.removed.length || clips?.shortened.length
        ? {
            note: "The new recording is shorter than the clips cut from the old one: clips.removed are gone and clips.shortened end sooner. Check the timeline.",
          }
        : {}),
    };
  } else if (command === "add-music") {
    const feature = required("feature");
    const file = path.resolve(positional(0, "a music file"));
    const { folder, file: saved } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const music = await importMusic(file, path.join(folder, "media", "music"), {
      prefer: musicFileInUse(saved.project, feature),
    });
    let edit;
    try {
      edit = await sendOps([
        {
          op: "add-music",
          url: featureMediaUrl(feature, music.relativePath),
          durationSeconds: music.durationSeconds,
          ...text("label"),
          ...text("artist"),
          ...text("license"),
        },
      ]);
    } catch (cause) {
      // The edit did not land, so nothing plays the copy this run just made.
      // A file it reused was there before, and the post may play it.
      if (!music.reused)
        await fs.rm(path.join(folder, "media", music.relativePath), {
          force: true,
        });
      throw cause;
    }
    result = {
      media: music.relativePath,
      converted: music.transcoded,
      reused: music.reused,
      edit,
    };
  } else if (command === "align-take") {
    const feature = required("feature");
    const place = option("place");
    const project = await currentSnapshot();
    if (!project.music) throw new Error(NO_MUSIC);
    let takeId = option("take");
    if (place) {
      const clip = project.tracks
        .flatMap((track) => track.items)
        .find((item) => item.id === place);
      if (!clip) throw new Error(`No item "${place}" in this post.`);
      if (clip.kind !== "video")
        throw new Error(`"${place}" is not a video clip.`);
      takeId = clip.takeId;
    }
    if (!takeId)
      throw new Error(
        "align-take needs --place ITEM to line up a clip, or --take ID to measure a take."
      );
    const take = project.takes.find((entry) => entry.id === takeId);
    if (!take) throw new Error(`No take "${takeId}" in this post.`);
    if (take.ref.kind !== "linked")
      throw new Error(
        `Take "${takeId}" is not a file in a feature video folder.`
      );
    const { folder } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    // A copy made with --share-media plays files from the original's folder, beside this one.
    const root = path.dirname(folder);
    const match = await alignTake(
      mediaPathFromUrl(take.ref.url, root),
      mediaPathFromUrl(project.music.url, root)
    );
    if (!place) result = match;
    else if (match.warning) {
      // Nothing moves on a doubtful match; the candidates are printed instead.
      result = { ...match, placed: false };
      process.exitCode = 1;
    } else
      result = {
        ...match,
        placed: true,
        edit: await sendOps([
          {
            op: "sync-to-music",
            item: place,
            offsetSeconds: match.offsetSeconds,
          },
        ]),
      };
  } else if (command === "loudness") {
    const file = path.resolve(positional(0, "a rendered video or sound file"));
    const measured = await measureLoudness(file);
    result = {
      ...measured,
      targetLufs: TARGET_LUFS,
      peakCeilingDbtp: PEAK_CEILING_DBTP,
    };
    if (option("feature")) {
      const music = (await currentSnapshot()).music;
      if (!music) throw new Error(NO_MUSIC);
      result.musicGain = music.gain;
      result.suggestedGain = suggestMusicGain(
        music.gain,
        measured.integratedLufs,
        measured.truePeakDbtp
      );
    }
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
  add-titles [--spoken "how to say it"] [--at T]   name titles clip, over the opening tunnel when there is one
  hook-speed <ease-out|ease-in|ease-in-out|linear|smooth|overshoot|default|x1,y1,x2,y2>
  hook-frame [--zoom 1.4] [--x 0.5] [--y 0.55] [--whole]   frame the footage behind the opening tunnel
  appearance [--item hook|animations|all|ID] --set glyph=false ...  (keys: tkaGlyph stepNumbers gridMode progressBar ...; null clears)
  item --item ID --patch '{"opacity":0.5}'
  trim --item ID --edge start|end --seconds T
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
  add-music <file> --feature SLUG [--label "Name"] [--artist "Name"] [--license "Library, id, date"]   copies it into media/music, or reuses the identical copy already there; anything but plain WAV becomes 48 kHz WAV
  music [--start T] [--from T] [--to T] [--gain 0.8] [--fade-in S] [--fade-out S] [--bpm 85|none] [--downbeat S] [--beats-per-bar 4] [--label --artist --license]
                               --start is where the music begins in the post; --from and --to are the part of the song that plays
  remove-music
  align-take --place ITEM | --take ID   where a take sits in the music, from its camera sound; --place puts the clip in time with it
  sync-to-music --item ID --offset S   puts a clip in time with the music at one of align-take's offsets
  loudness <render.mp4> [--feature SLUG]   loudness and true peak; with --feature, the music level that reaches -14 LUFS
  capture-info --feature SLUG   the project's folder, the recordings already in media/captures and its takes
  link-capture --feature SLUG --capture ID --media captures/ID.N.mp4 [--label "Name"]   puts a recording in the project: the take that plays an earlier recording of ID is pointed at it, else it becomes a new take
  T is seconds (12.5), a clock (1:02.5), or a bar of the music: @9 is bar 9, @9.3 is bar 9, beat 3.
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
