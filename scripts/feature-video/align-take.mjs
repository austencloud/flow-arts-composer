import { spawn } from "node:child_process";
import path from "node:path";
import { toolPath } from "./media-import.mjs";

/**
 * Finds where a take sits in the music, for footage shot while the track
 * played out loud. Both sounds become loudness envelopes at 200 frames a
 * second; the rises in loudness (drum hits, note starts) are compared at
 * every offset, and the best match wins. One frame is 5 ms, well inside one
 * video frame.
 */

export const DECODE_RATE = 8000;
export const ENVELOPE_RATE = 200;
/** Matches closer together than this (0.25 s) count as one. */
const CANDIDATE_GAP_FRAMES = 50;
/** The best match must beat the next one by this much to be placed on its own. */
export const MIN_CONFIDENCE = 1.5;
/** Below this the take's sound hardly follows the music at all. */
export const MIN_SCORE = 0.15;
const FAINT =
  "The take's sound hardly follows the music. Check that the music can be heard in the take.";
const UNCLEAR =
  "Several offsets fit about as well, as they do when the music repeats. Pick one of the candidates and place it with: sync-to-music --item ID --offset S.";

/**
 * The file's first sound as mono samples at `DECODE_RATE`, the first sample
 * at the file's own 0 s, where its picture starts. A camera's sound can start
 * a few hundredths later; that gap becomes silence, or the offset would be
 * off by it.
 */
export function decodeMono(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      toolPath("ffmpeg"),
      [
        "-v",
        "error",
        "-i",
        file,
        "-vn",
        "-af",
        "aresample=async=1:first_pts=0",
        "-ac",
        "1",
        "-ar",
        String(DECODE_RATE),
        "-f",
        "f32le",
        "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    const chunks = [];
    let errors = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => (errors += text));
    child.on("error", reject);
    child.on("close", (code) => {
      const name = path.basename(file);
      if (code !== 0)
        return reject(
          new Error(
            `ffmpeg could not read the sound in ${name}: ${errors.trim() || `exit code ${code}`}`
          )
        );
      const bytes = Buffer.concat(chunks);
      // A Float32Array needs its own buffer: the Buffer may start at any byte.
      const samples = new Float32Array(Math.floor(bytes.length / 4));
      new Uint8Array(samples.buffer).set(bytes.subarray(0, samples.length * 4));
      if (samples.length === 0) reject(new Error(`${name} has no sound.`));
      else resolve(samples);
    });
  });
}

/** Loudness in dB, one value per 1/200 s. */
export function loudnessEnvelope(samples, sampleRate = DECODE_RATE) {
  const frame = Math.round(sampleRate / ENVELOPE_RATE);
  const out = new Float32Array(Math.floor(samples.length / frame));
  for (let f = 0; f < out.length; f += 1) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i += 1)
      sum += samples[i] * samples[i];
    out[f] = 10 * Math.log10(sum / frame + 1e-10);
  }
  return out;
}

/** How much louder each frame is than the one before; falls count as 0. */
export function onsetStrength(envelope) {
  const out = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i += 1)
    out[i] = Math.max(0, envelope[i] - envelope[i - 1]);
  return out;
}

function prefixSums(values) {
  const sum = new Float64Array(values.length + 1);
  const squares = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i += 1) {
    sum[i + 1] = sum[i] + values[i];
    squares[i + 1] = squares[i] + values[i] * values[i];
  }
  return { sum, squares };
}

/**
 * How well `take` matches `music` at every offset: take frame j sits on music
 * frame j + lag, and `scores[lag - lagMin]` is the correlation of the two over
 * their overlap, which must be at least `minOverlap` frames.
 */
export function matchScores(music, take, minOverlap) {
  const m = prefixSums(music);
  const t = prefixSums(take);
  const lagMin = -(take.length - minOverlap);
  const scores = new Float64Array(music.length - minOverlap - lagMin + 1);
  for (let index = 0; index < scores.length; index += 1) {
    const lag = lagMin + index;
    const from = Math.max(0, -lag);
    const to = Math.min(take.length, music.length - lag);
    const count = to - from;
    let cross = 0;
    for (let j = from; j < to; j += 1) cross += take[j] * music[j + lag];
    const takeSum = t.sum[to] - t.sum[from];
    const musicSum = m.sum[to + lag] - m.sum[from + lag];
    const takeVariance = t.squares[to] - t.squares[from] - takeSum ** 2 / count;
    const musicVariance =
      m.squares[to + lag] - m.squares[from + lag] - musicSum ** 2 / count;
    scores[index] =
      takeVariance > 0 && musicVariance > 0
        ? (cross - (takeSum * musicSum) / count) /
          Math.sqrt(takeVariance * musicVariance)
        : 0;
  }
  return { lagMin, scores };
}

/** The `count` best offsets, best first, each more than 0.25 s from the others. */
export function topCandidates(lagMin, scores, count = 3) {
  const picked = [];
  while (picked.length < count) {
    let best = -1;
    for (let index = 0; index < scores.length; index += 1) {
      if (best >= 0 && scores[index] <= scores[best]) continue;
      const lag = lagMin + index;
      if (
        picked.some((pick) => Math.abs(pick.lag - lag) <= CANDIDATE_GAP_FRAMES)
      )
        continue;
      best = index;
    }
    if (best < 0) break;
    picked.push({ lag: lagMin + best, score: scores[best] });
  }
  return picked;
}

const round = (value, places) =>
  Math.round(value * 10 ** places) / 10 ** places;

/**
 * The music's own time minus the take's own time at the same moment, from
 * two mono signals at `sampleRate`. Positive when the camera started after
 * the music did. A warning comes with a match that is faint, or that other
 * offsets fit nearly as well.
 */
export function alignSignals(music, take, sampleRate = DECODE_RATE) {
  const musicOnsets = onsetStrength(loudnessEnvelope(music, sampleRate));
  const takeOnsets = onsetStrength(loudnessEnvelope(take, sampleRate));
  const minOverlap = Math.min(
    takeOnsets.length,
    musicOnsets.length,
    5 * ENVELOPE_RATE
  );
  if (minOverlap < ENVELOPE_RATE)
    throw new Error("The take and the music must each run at least 1 s.");
  const { lagMin, scores } = matchScores(musicOnsets, takeOnsets, minOverlap);
  const candidates = topCandidates(lagMin, scores);
  const [best, next] = candidates;
  const confidence =
    next && next.score > 0 ? round(best.score / next.score, 2) : null;
  const warning =
    best.score < MIN_SCORE
      ? FAINT
      : confidence !== null && confidence < MIN_CONFIDENCE
        ? UNCLEAR
        : undefined;
  return {
    offsetSeconds: best.lag / ENVELOPE_RATE,
    score: round(best.score, 3),
    confidence,
    candidates: candidates.map(({ lag, score }) => ({
      offsetSeconds: lag / ENVELOPE_RATE,
      score: round(score, 3),
    })),
    ...(warning ? { warning } : {}),
  };
}

export async function alignTake(takeFile, musicFile) {
  const [music, take] = await Promise.all([
    decodeMono(musicFile),
    decodeMono(takeFile),
  ]);
  return alignSignals(music, take);
}

/**
 * The file behind a feature video media URL, under `root`, the folder that
 * holds every feature video. A URL may name another feature video's folder
 * when the media is shared.
 */
export function mediaPathFromUrl(url, root) {
  const parts = featureMediaUrlParts(url);
  if (!parts) throw new Error(`${url} is not a feature video media URL.`);
  return path.join(root, parts.slug, "media", ...parts.path.split("/"));
}

/**
 * The feature video a media URL names and the decoded path inside its media
 * folder, or null for any other URL, or one with a part that could leave
 * that folder.
 */
export function featureMediaUrlParts(url) {
  const match = /^\/api\/dev\/feature-videos\/([^/?#]+)\/media\/([^?#]+)$/.exec(
    String(url)
  );
  const parts = match
    ? [match[1], ...match[2].split("/")].map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return "";
        }
      })
    : [];
  if (
    parts.length < 2 ||
    parts.some(
      (part) => !part || part === "." || part === ".." || /[\\/:]/.test(part)
    )
  )
    return null;
  const [slug, ...rest] = parts;
  return { slug, path: rest.join("/") };
}
