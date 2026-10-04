/**
 * Makes editing copies of recordings that posts link to: a 720p H.264 copy
 * with a key frame every half second and AAC sound, written beside each
 * recording as <name>.edit.mp4, with <name>.edit.json describing it. Post
 * Studio plays and scrubs that copy on every site of this computer at once;
 * export still reads the original.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/make-edit-copies.ts static/word-videos/inshot-recovery/omega-full.mp4 [more files]
 *
 * Options: --ffmpeg <path> and --ffprobe <path> (else C:/ffmpeg/*\/bin, else
 * the PATH), --force to remake a copy whose recording has not changed.
 * A copy is replaced only after the new one passes its checks.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  EditCopyManifestSchema,
  PREVIEW_KEY_FRAME_SECONDS,
  PREVIEW_VIDEO_POLICY,
  editCopyPaths,
  previewVideoDimensions,
  type EditCopyManifest,
} from "$lib/shared/media-composition/domain/preview-video";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const force = args.includes("--force");
const files = args.filter(
  (arg, index) =>
    !arg.startsWith("--") &&
    !["--ffmpeg", "--ffprobe"].includes(args[index - 1] ?? "")
);
if (files.length === 0) {
  console.error("Name the recordings to make editing copies of.");
  process.exit(1);
}

function tool(name: "ffmpeg" | "ffprobe"): string {
  const given = option(name);
  if (given) return given;
  if (existsSync("C:/ffmpeg")) {
    for (const build of readdirSync("C:/ffmpeg")) {
      const candidate = join("C:/ffmpeg", build, "bin", `${name}.exe`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return name;
}
const ffmpeg = tool("ffmpeg");
const ffprobe = tool("ffprobe");

interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    start_time?: string;
    duration?: string;
    side_data_list?: { rotation?: number }[];
  }[];
  format: { duration?: string };
}

function probe(path: string): Probe {
  return JSON.parse(
    execFileSync(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,start_time,duration:stream_side_data=rotation:format=duration",
        "-of",
        "json",
        path,
      ],
      { encoding: "utf8" }
    )
  ) as Probe;
}

/** Key frame times in the first stretch of a copy, to prove its spacing. */
function keyFrameTimes(path: string): number[] {
  const output = execFileSync(
    ffprobe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-skip_frame",
      "nokey",
      "-read_intervals",
      "%+20",
      "-show_entries",
      "frame=pts_time",
      "-of",
      "csv=p=0",
      path,
    ],
    { encoding: "utf8" }
  );
  return output
    .split(/\r?\n/)
    .map((line) => Number(line.trim().replace(/,$/, "")))
    .filter((time) => Number.isFinite(time));
}

function videoOf(info: Probe) {
  const video = info.streams.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("no video track");
  const rotation = Math.abs(video.side_data_list?.[0]?.rotation ?? 0) % 180;
  // ffmpeg turns a rotated recording upright, as the browser shows it.
  return {
    width: rotation === 90 ? video.height : video.width,
    height: rotation === 90 ? video.width : video.height,
    start: Number(video.start_time ?? 0),
    duration: Number(video.duration ?? info.format.duration),
  };
}

function current(path: string, bytes: number): boolean {
  const paths = editCopyPaths(`/${basename(path)}`)!;
  const manifest = join(dirname(path), basename(paths.manifest));
  const video = join(dirname(path), basename(paths.video));
  if (!existsSync(manifest) || !existsSync(video)) return false;
  try {
    const parsed = EditCopyManifestSchema.safeParse(
      JSON.parse(readFileSync(manifest, "utf8"))
    );
    return parsed.success && parsed.data.source.bytes === bytes;
  } catch {
    return false;
  }
}

let failed = 0;
for (const file of files) {
  const started = Date.now();
  try {
    const bytes = statSync(file).size;
    if (!force && current(file, bytes)) {
      console.log(`${file}: editing copy is current`);
      continue;
    }
    const paths = editCopyPaths(`/${basename(file)}`);
    if (!paths) throw new Error("not a recording file name");
    const target = join(dirname(file), basename(paths.video));
    const manifestPath = join(dirname(file), basename(paths.manifest));
    const partial = `${target}.partial.mp4`;
    const source = videoOf(probe(file));
    const sourceAudio = probe(file).streams.filter(
      (stream) => stream.codec_type === "audio"
    ).length;
    const size = previewVideoDimensions(source.width, source.height);
    console.log(
      `${file}: ${source.width}x${source.height}, ${source.duration.toFixed(1)} s → ${size.width}x${size.height}`
    );
    const run = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-stats",
        "-y",
        "-i",
        file,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        `scale=${size.width}:${size.height}:flags=bicubic,format=yuv420p`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "fastdecode",
        "-crf",
        "23",
        "-maxrate",
        "3M",
        "-bufsize",
        "6M",
        "-force_key_frames",
        `expr:gte(t,n_forced*${PREVIEW_KEY_FRAME_SECONDS})`,
        "-sc_threshold",
        "0",
        // The copy keeps the recording's own clock, so saved timings line up.
        "-fps_mode",
        "passthrough",
        "-copyts",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        partial,
      ],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    if (run.status !== 0) throw new Error(`ffmpeg exited with ${run.status}`);

    const made = probe(partial);
    const copy = videoOf(made);
    const codec = made.streams.find((stream) => stream.codec_type === "video");
    const audio = made.streams.filter(
      (stream) => stream.codec_type === "audio"
    );
    const keys = keyFrameTimes(partial);
    const widestGap = keys
      .slice(1)
      .reduce((gap, time, index) => Math.max(gap, time - keys[index]!), 0);
    const problems = [
      codec?.codec_name !== "h264" && "the picture is not H.264",
      (copy.width !== size.width || copy.height !== size.height) &&
        `the copy is ${copy.width}x${copy.height}`,
      Math.abs(copy.duration - source.duration) > 0.1 &&
        `the copy runs ${copy.duration} s, not ${source.duration} s`,
      Math.abs(copy.start - source.start) > 0.001 &&
        `the copy starts at ${copy.start} s, not ${source.start} s`,
      audio.length !== sourceAudio && "the sound tracks differ",
      audio.some((stream) => stream.codec_name !== "aac") &&
        "the sound is not AAC",
      (keys.length < 2 || widestGap > PREVIEW_KEY_FRAME_SECONDS + 0.05) &&
        `key frames are ${widestGap.toFixed(2)} s apart`,
    ].filter(Boolean);
    if (problems.length > 0) {
      rmSync(partial, { force: true });
      throw new Error(problems.join("; "));
    }

    const manifest: EditCopyManifest = {
      policy: PREVIEW_VIDEO_POLICY,
      source: {
        bytes,
        width: source.width,
        height: source.height,
        durationSeconds: source.duration,
      },
      copy: {
        width: copy.width,
        height: copy.height,
        durationSeconds: copy.duration,
      },
    };
    // The description goes last: without it the editor ignores the copy.
    rmSync(manifestPath, { force: true });
    renameSync(partial, target);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `${file}: wrote ${basename(target)} (${(statSync(target).size / 1e6).toFixed(1)} MB) in ${((Date.now() - started) / 1000).toFixed(0)} s`
    );
  } catch (error) {
    failed += 1;
    console.error(
      `${file}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
process.exit(failed ? 1 : 0);
