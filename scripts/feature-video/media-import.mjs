import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Brings a phone or camera clip into a feature video's media/footage folder
 * in a form every browser plays and seeks: H.264 High in MP4 with AAC sound.
 * An 8-bit SDR H.264 MP4 is copied as it is. Anything else (iPhone HEVC, a
 * .mov, 10-bit or HDR footage) is converted at CRF 16 with its frame rate
 * kept, and HDR is tone-mapped to SDR BT.709 so it does not play washed out.
 */

const execFileAsync = promisify(execFile);
const DEFAULT_FFMPEG_DIR = "C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin";
const HDR_TRANSFERS = ["arib-std-b67", "smpte2084"];
/** Sound ffmpeg can read. iPhone spatial audio is a second track it cannot. */
const READABLE_AUDIO = /^(aac|mp3|opus|flac|alac|vorbis|ac3|eac3|pcm_\w+)$/;

/** ffmpeg or ffprobe: in FFMPEG_DIR, else this computer's usual folder, else on PATH. */
export function toolPath(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const inFolder = path.join(
    process.env.FFMPEG_DIR ?? DEFAULT_FFMPEG_DIR,
    executable
  );
  return existsSync(inFolder) ? inFolder : executable;
}

/** What ffprobe's JSON says about a clip, or why it cannot be a take. */
export function readProbe(data, name) {
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error(`${name} has no video.`);
  const durationSeconds = Number(data?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error(`ffprobe could not tell how long ${name} is.`);
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const readable = audio.findIndex((stream) =>
    READABLE_AUDIO.test(stream.codec_name ?? "")
  );
  const transfer = video.color_transfer ?? "unknown";
  return {
    durationSeconds,
    videoCodec: video.codec_name ?? "unknown",
    pixelFormat: video.pix_fmt ?? "unknown",
    transfer,
    hdr: HDR_TRANSFERS.includes(transfer),
    /** The sound to keep, counted among the audio streams, or null. */
    audioStream: readable < 0 ? null : readable,
  };
}

export async function probeMedia(file) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      toolPath("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,pix_fmt,color_transfer",
        "-of",
        "json",
        file,
      ],
      { windowsHide: true }
    ));
  } catch (cause) {
    throw new Error(
      `ffprobe could not read ${path.basename(file)}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
  return readProbe(JSON.parse(stdout), path.basename(file));
}

/** True unless the clip is already 8-bit SDR H.264 in an MP4. */
export function needsTranscode(probe, file) {
  return (
    path.extname(file).toLowerCase() !== ".mp4" ||
    probe.videoCodec !== "h264" ||
    probe.hdr ||
    !["yuv420p", "yuvj420p"].includes(probe.pixelFormat)
  );
}

/**
 * HLG or PQ to SDR BT.709: the usual zscale and Hable recipe. setparams
 * comes first because zscale finds no conversion for frames that lack
 * color tags, and zscale's own tags mark the copy as BT.709 (ffmpeg 8
 * takes a file's color tags from its frames, not from -color_trc).
 */
export function toneMapFilter(transfer) {
  return [
    `setparams=color_primaries=bt2020:color_trc=${transfer}:colorspace=bt2020nc`,
    "zscale=t=linear:npl=100",
    "format=gbrpf32le",
    "zscale=p=bt709",
    "tonemap=tonemap=hable:desat=0",
    "zscale=t=bt709:m=bt709:r=tv",
    "format=yuv420p",
  ].join(",");
}

/** ffmpeg arguments for a clip's H.264 High MP4 copy. */
export function transcodeArgs(input, output, probe) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-stats",
    // The output is this import's own temporary file.
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...(probe.audioStream === null ? [] : ["-map", `0:a:${probe.audioStream}`]),
    ...(probe.hdr ? ["-vf", toneMapFilter(probe.transfer)] : []),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    ...(probe.audioStream === null ? ["-an"] : ["-c:a", "aac", "-b:a", "192k"]),
    "-movflags",
    "+faststart",
    output,
  ];
}

/**
 * A name the media route serves as it is: a-z, 0-9, dash and underscore, then
 * `extension`, or `fallback` when nothing of the original name is left.
 */
export function safeMediaName(original, extension = ".mp4", fallback = "take") {
  const stem = path
    .basename(original, path.extname(original))
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return `${stem || fallback}${extension}`;
}

/** `name` in `folder`, or name-2, name-3 and on when it is taken. */
export function uniqueMediaPath(folder, name) {
  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let copy = 1; ; copy += 1) {
    const candidate = path.join(
      folder,
      copy === 1 ? name : `${stem}-${copy}${extension}`
    );
    if (!existsSync(candidate)) return candidate;
  }
}

export function runFfmpeg(args, name) {
  return new Promise((resolve, reject) => {
    const child = spawn(toolPath("ffmpeg"), args, {
      // Progress and errors show as they happen.
      stdio: ["ignore", "ignore", "inherit"],
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`ffmpeg could not convert ${name} (exit code ${code}).`)
          )
    );
  });
}

/**
 * Copies or converts `file` into `footageFolder` under a free, safe name.
 * Returns its path inside media/, its length, and whether it was converted.
 */
export async function importTake(file, footageFolder) {
  const name = path.basename(file);
  const probe = await probeMedia(file);
  const convert = needsTranscode(probe, file);
  await fs.mkdir(footageFolder, { recursive: true });
  const target = uniqueMediaPath(footageFolder, safeMediaName(name));
  if (convert) {
    const partial = `${target}.partial.mp4`;
    try {
      await runFfmpeg(transcodeArgs(file, partial, probe), name);
      await fs.rename(partial, target);
    } catch (cause) {
      await fs.rm(partial, { force: true });
      throw cause;
    }
  } else await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL);
  const result = convert ? await probeMedia(target) : probe;
  return {
    relativePath: `footage/${path.basename(target)}`,
    durationSeconds: result.durationSeconds,
    transcoded: convert,
  };
}
