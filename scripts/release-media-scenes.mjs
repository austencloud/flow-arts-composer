#!/usr/bin/env node
/**
 * Compose a release note's story clip from takes baked on the shared clock.
 *
 * A story is a few takes of one sequence, each a step richer than the last
 * (a hand path, then a prop on it, then a tunnel of performers). The clip
 * holds each step, cross-fades into the next while the camera eases to its
 * framing, and fades back into the first so the loop restarts seamlessly.
 * The cross-fades add light instead of mixing it, so trails on a dark stage
 * never dim halfway through.
 *
 * The takes come from the dev bake page, which saves them through
 * /api/dev/release-media into the OS temp folder:
 *   /test/release-media?scenes=zans-hand,zans-poi,zans-tunnel&autorun=1
 * `src/routes/test/release-media/release-scenes.ts` holds their recipes.
 *
 * A slideshow story cross-fades still frames instead (a page shown with each
 * prop in turn). Its frames are screenshots saved into the same folder.
 *
 * Usage:
 *   node scripts/release-media-scenes.mjs --version 0.49.0 --story zans-diamond
 *   ... --upload      push to the assets bucket and print the manifest media
 *   ... --dry-run     with --upload, show the keys without uploading
 *
 * Writes <story>.mp4 (the app plays it), <story>.gif (the email shows it) and
 * <story>.jpg (the clip's poster). Needs ffmpeg on PATH; --upload needs
 * CLOUDFLARE_API_TOKEN (env or .env).
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ASSETS_CDN,
  loadCloudflareToken,
  putAsset,
} from "./lib/assets-bucket.mjs";

const TAKE_DIR = join(tmpdir(), "tka-release-media");
const FPS = 30;
const SIZE = 720;
// The guide's headings fall back to Segoe UI on Windows, so the title matches.
const TITLE_FONT =
  process.env.RELEASE_MEDIA_FONT ?? "C:/Windows/Fonts/segoeuib.ttf";

/**
 * Each step names its take, when its cross-fade in starts, and the zoom the
 * camera settles on. Takes are 720px squares at 30 fps, one beat a second;
 * a take shorter than the story loops, which stays on the clock because the
 * story length is a whole number of passes. Zoom 1 shows the whole take;
 * zoom keys ease between steps.
 */
const STORIES = {
  // Zan's Diamond under its title: hands, poi on them, a tunnel, then the
  // hands again, which shrink into the hand player on the guide page. The
  // page then scrolls through the props and the 23 variations and opens the
  // collection. Zoom fills the space under the title with each step; the
  // hands draw a small diamond, the poi petals reach about 1.6 times as far.
  "zans-diamond": {
    seconds: 15.1,
    fade: 1.5,
    returnAt: 11.5,
    title: { text: "Zan's Diamond", until: 13 },
    steps: [
      { take: "zans-hand", at: 0 },
      { take: "zans-poi", at: 3.5 },
      { take: "zans-tunnel", at: 7.5 },
    ],
    zoom: [
      [0, 1.85],
      [3.5, 1.85],
      [5, 1.18],
      [7.5, 1.18],
      [9, 1.1],
      [11.5, 1.1],
      [13, 1.85],
      [14.5, 1],
    ],
    // The guide recording plays at speed on Zan's original, quicker through
    // the props and variations, then cross-fades into a separate recording of
    // the collection, which skips the page load between them. Both were
    // recorded signed out at 720x720. The hands land at 280px, where their
    // diamond matches the one in the page's player.
    page: {
      shrink: 1.5,
      player: [214, 194, 280],
      segments: [
        { file: "zans-page-raw", from: 8, to: 10.5 },
        { file: "zans-page-raw", from: 10.5, to: 24.4, speed: 1.5 },
        { file: "zans-collection-raw", from: 0.8, to: 8.6, fade: 0.8 },
      ],
    },
    // Twice as long as the other stories, so a smaller GIF keeps it near 4 MB.
    gif: { size: 360, colors: 48, fps: 8 },
    alt: "Zan's Diamond drawn by two hands, then poi, then a tunnel of four performers, then its guide page with the 23 variations and the collection",
  },
  // DCKΨ- is a 16-beat circle. One performer's Sense Fans multiply into a
  // mirrored ring of four performers, then an eight-fold sculpture, then fold
  // back into the pair. Lit fans are dense, so the GIF gets fewer colours.
  "sense-fan": {
    seconds: 16,
    fade: 1.6,
    steps: [
      { take: "fan-led-solo", at: 0 },
      { take: "fan-led-4m", at: 3.5 },
      { take: "fan-led-8", at: 8.5 },
    ],
    zoom: [
      [0, 1.42],
      [3.5, 1.42],
      [5.1, 1.32],
      [8.5, 1.32],
      [10.1, 1.3],
      [14.4, 1.3],
      [16, 1.42],
    ],
    gif: { size: 360, colors: 32 },
    crf: 25,
    alt: "A pair of Sense Fans multiplies into a ring of eight fans, then a sculpture of sixteen, LEDs lit",
  },
  // The Browse home with its tiles playing, recorded from the dev server at
  // a 1280x800 viewport. The crop drops the side rail, which shows the
  // recording account's avatar and inbox count.
  "browse-home": {
    recording: {
      file: "browse-raw",
      crop: "1216:760:64:0",
      from: 1,
      seconds: 12,
      fade: 0.8,
    },
    width: 1040,
    alt: "The Browse home: sequence, collection and visual tiles playing above your library",
  },
  // The Codex with each prop in turn: frames are page crops, not takes.
  codex: {
    slides: ["codex-c0", "codex-c1", "codex-c2", "codex-c3", "codex-c4"],
    hold: 2.4,
    fade: 0.6,
    width: 1040,
    alt: "The Codex showing every base letter, switching between staff, club, fan, triad and minihoop",
  },
};

// The email list column is 500px wide; the effects grid measured 440px,
// 10 fps and 64 colours as the most a trail clip holds near 4 MB.
const GIF_SIZE = 440;
const GIF_FPS = 10;
const GIF_COLORS = 64;

function parseArgs(argv) {
  const options = { upload: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--upload") options.upload = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--version") options.version = argv[++i];
    else if (arg === "--story") options.story = argv[++i];
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
    throw new Error("--version x.y.z is required");
  }
  if (!STORIES[options.story]) {
    throw new Error(
      `--story must be one of ${Object.keys(STORIES).join(", ")}`
    );
  }
  return options;
}

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error("ffmpeg failed");
}

const f = (n) => Number(n.toFixed(3));

/** Ease between zoom keys, as an ffmpeg expression of `t`. */
function zoomExpr(keys, t) {
  let expr = `${keys[0][1]}`;
  for (let i = 0; i + 1 < keys.length; i++) {
    const [a, za] = keys[i];
    const [b, zb] = keys[i + 1];
    if (za === zb) continue;
    const u = `clip((${t}-${a})/${f(b - a)},0,1)`;
    expr += `+(${f(zb - za)})*${u}*${u}*(3-2*${u})`;
  }
  return expr;
}

/** When the first step fades back in to close the story. */
const returnAt = (story) => story.returnAt ?? story.seconds - story.fade;

/**
 * Light envelopes for one step: the incoming take reaches full brightness
 * a third of the way before the fade ends, the outgoing one holds full until
 * a third of the way in, so their light overlaps instead of dipping.
 */
function envelopes(story) {
  const { steps, fade } = story;
  const rise = fade * 0.65;
  return steps.map((step, i) => {
    const next = steps[i + 1];
    const out = (next ? next.at : returnAt(story)) + fade - rise;
    return { in: i === 0 ? null : step.at, out, rise };
  });
}

function storyGraph(story) {
  const env = envelopes(story);
  const parts = [];
  story.steps.forEach((step, i) => {
    const e = env[i];
    const chain = [
      `trim=duration=${story.seconds}`,
      "setpts=PTS-STARTPTS",
      "format=gbrp",
    ];
    if (e.in !== null) chain.push(`fade=t=in:st=${e.in}:d=${f(e.rise)}`);
    chain.push(`fade=t=out:st=${f(e.out)}:d=${f(e.rise)}`);
    parts.push(`[${i}:v]${chain.join(",")}[s${i}]`);
  });
  // The first step comes back for the loop: a second copy fades in last.
  const n = story.steps.length;
  const back = returnAt(story);
  parts.push(
    `[${n}:v]trim=duration=${story.seconds},setpts=PTS-STARTPTS,format=gbrp,` +
      `fade=t=in:st=${back}:d=${f(story.fade * 0.65)}[s${n}]`
  );
  let acc = "s0";
  for (let i = 1; i <= n; i++) {
    parts.push(`[${acc}][s${i}]blend=all_mode=addition[m${i}]`);
    acc = `m${i}`;
  }
  // Zoom on a doubled frame so the slow camera ease does not step a pixel
  // at a time.
  const z = zoomExpr(story.zoom, `in/${FPS}`);
  // Under a title the figure sits lower, until the shrink lands it on zoom 1.
  const drop = story.title
    ? `-${TITLE_DROP * 2}/zoom*(1-clip((in/${FPS}-${story.title.until})/${f(story.page?.shrink ?? 1.5)},0,1))`
    : "";
  const label = story.page ? "story" : "out";
  parts.push(
    `[${acc}]format=yuv420p,scale=${SIZE * 2}:${SIZE * 2}:flags=lanczos,` +
      `zoompan=z='${z}':x='iw/2-iw/zoom/2':y='max(0,ih/2-ih/zoom/2${drop})':d=1:` +
      `s=${SIZE}x${SIZE}:fps=${FPS}` +
      (story.title ? `,${titleFilter(story.title)}` : "") +
      `,format=yuv420p[${label}]`
  );
  const inputs = [];
  for (const step of [...story.steps, story.steps[0]]) {
    const take = join(TAKE_DIR, `${step.take}.mp4`);
    if (!existsSync(take)) throw new Error(`Missing take ${take}`);
    inputs.push("-stream_loop", "-1", "-i", take);
  }
  if (story.page) {
    const page = pageGraph(story, inputs.length / 4);
    inputs.push(...page.inputs);
    parts.push(page.graph);
  }
  return { inputs, graph: parts.join(";"), size: [SIZE, SIZE] };
}

// Output pixels the figure drops by to clear the title.
const TITLE_DROP = 40;

/** The title across the top, gone by the time the story shrinks away. */
function titleFilter({ text, until }) {
  const font = TITLE_FONT.replace(/:/g, "\\:");
  const alpha = `clip((${until}-t)/0.5,0,1)`;
  return (
    `drawtext=fontfile='${font}':text='${text.replace(/'/g, "’")}':` +
    `fontsize=44:fontcolor=0xEEEEF5:x=(w-text_w)/2:y=30:alpha='${alpha}'`
  );
}

/**
 * The story shrinks into the player that plays it on its page, and the
 * page recording takes over around it. The shrinking story adds its light to
 * the page, so its black stage never shows as a box. The clip closes by cross-fading the
 * page's last second into the story's first, one second in, so the loop
 * lands on the frame it starts from.
 */
function pageGraph(story, index) {
  const { shrink, player, segments } = story.page;
  const start = story.title.until;
  const files = [...new Set(segments.map((segment) => segment.file))];
  const inputs = [];
  for (const file of files) {
    const source = join(TAKE_DIR, `${file}.mp4`);
    if (!existsSync(source)) throw new Error(`Missing recording ${source}`);
    inputs.push("-i", source);
  }
  const parts = [];
  // Each recording feeds as many segments as it has.
  files.forEach((file, i) => {
    const uses = segments.filter((segment) => segment.file === file).length;
    const outs = segments
      .map((segment, j) => (segment.file === file ? `[r${j}]` : ""))
      .join("");
    parts.push(
      uses > 1
        ? `[${index + i}:v]split=${uses}${outs}`
        : `[${index + i}:v]null${outs}`
    );
  });
  // Segments join end to end, or cross-fade over their own `fade`.
  let seconds = 0;
  let acc = "";
  segments.forEach((segment, j) => {
    const speed = segment.speed ?? 1;
    const label = j === segments.length - 1 ? "pages" : `p${j}`;
    const clip = j === 0 ? label : `g${j}`;
    parts.push(
      `[r${j}]trim=start=${segment.from}:end=${segment.to},` +
        `setpts=(PTS-STARTPTS)/${speed},fps=${FPS},scale=${SIZE}:${SIZE},` +
        `format=yuv420p,setsar=1,settb=1/${FPS}[${clip}]`
    );
    const length = (segment.to - segment.from) / speed;
    const fade = j === 0 ? 0 : (segment.fade ?? 0);
    if (j > 0) {
      parts.push(
        fade > 0
          ? `[${acc}][${clip}]xfade=transition=fade:duration=${fade}:offset=${f(seconds - fade)}[${label}]`
          : `[${acc}][${clip}]concat=n=2:v=1:a=0,settb=1/${FPS}[${label}]`
      );
    }
    seconds += length - fade;
    acc = label;
  });
  const total = start + seconds;
  const ease = `(st(0,clip((t-${start})/${shrink},0,1))*ld(0)*(3-2*ld(0)))`;
  const [px, py, pw] = player;
  const side = `trunc((${SIZE}-${SIZE - pw}*${ease})/2)*2`;
  parts.push(
    `[story]split[sv][sh]`,
    `[sh]trim=duration=2,setpts=PTS-STARTPTS[head]`,
    `[sv]trim=duration=${f(start + shrink + 0.6)},` +
      `fade=t=out:st=${f(start + shrink)}:d=0.6,` +
      `scale=w='${side}':h='${side}':eval=frame[small]`,
    `[pages]setpts=PTS-STARTPTS+${start}/TB,format=yuva420p,` +
      `fade=t=in:st=${start}:d=${shrink}:alpha=1[pg]`,
    `color=c=black:s=${SIZE}x${SIZE}:r=${FPS}:d=${f(total)},split[bg][stage]`,
    `[bg][pg]overlay=eof_action=pass,format=gbrp[base]`,
    `[stage][small]overlay=x='${px}*${ease}':y='${py}*${ease}':eval=frame:` +
      `eof_action=pass,format=gbrp[light]`,
    `[base][light]blend=all_mode=addition,format=yuv420p,` +
      `trim=start=1,setpts=PTS-STARTPTS[body]`,
    `[body][head]xfade=transition=fade:duration=1:offset=${f(total - 2)}[out]`
  );
  return { inputs, graph: parts.join(";") };
}

function slideGraph(story) {
  const { slides, hold, fade, width } = story;
  const inputs = [];
  // The first slide comes back at the end so the loop closes on it.
  for (const slide of [...slides, slides[0]]) {
    const frame = join(TAKE_DIR, "diag", `${slide}.png`);
    if (!existsSync(frame)) throw new Error(`Missing frame ${frame}`);
    inputs.push(
      "-loop",
      "1",
      "-framerate",
      `${FPS}`,
      "-t",
      `${hold + fade}`,
      "-i",
      frame
    );
  }
  const parts = [];
  for (let i = 0; i <= slides.length; i++) {
    parts.push(
      `[${i}:v]scale=${width}:-2:flags=lanczos,format=yuv420p,setsar=1[v${i}]`
    );
  }
  let acc = "v0";
  for (let i = 1; i <= slides.length; i++) {
    parts.push(
      `[${acc}][v${i}]xfade=transition=fade:duration=${fade}:offset=${f(i * hold)}[x${i}]`
    );
    acc = `x${i}`;
  }
  // End as the closing copy lands, so the clip ends where it began.
  const seconds = slides.length * hold + fade;
  parts.push(`[${acc}]trim=duration=${seconds},setpts=PTS-STARTPTS[out]`);
  return { inputs, graph: parts.join(";") };
}

/**
 * A screen recording closes its loop by cross-fading its own opening over
 * its tail, so the last frame lands on the first.
 */
function recordingGraph(story) {
  const { file, crop, from, seconds, fade } = story.recording;
  const source = join(TAKE_DIR, `${file}.mp4`);
  if (!existsSync(source)) throw new Error(`Missing recording ${source}`);
  const graph = [
    `[0:v]crop=${crop},scale=${story.width}:-2:flags=lanczos,fps=${FPS},` +
      `format=yuv420p,setsar=1,split[a][b]`,
    `[a]trim=start=${from + fade}:duration=${seconds},setpts=PTS-STARTPTS[main]`,
    `[b]trim=start=${from}:duration=${fade},setpts=PTS-STARTPTS[head]`,
    `[main][head]xfade=transition=fade:duration=${fade}:offset=${f(seconds - fade)}[out]`,
  ].join(";");
  return { inputs: ["-i", source], graph };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const story = STORIES[options.story];
  const { inputs, graph } = story.recording
    ? recordingGraph(story)
    : story.slides
      ? slideGraph(story)
      : storyGraph(story);

  const outDir = join(TAKE_DIR, "out");
  mkdirSync(outDir, { recursive: true });
  const name = options.story;
  const mp4 = join(outDir, `${name}.mp4`);
  const gif = join(outDir, `${name}.gif`);
  const jpg = join(outDir, `${name}.jpg`);

  ffmpeg([
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-r",
    `${FPS}`,
    "-c:v",
    "libx264",
    "-crf",
    `${story.crf ?? 21}`,
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4,
  ]);

  // A screen wants its text sharp more than smooth motion; trails want the
  // frames.
  const screen = Boolean(story.slides || story.recording);
  const gifWidth = story.gif?.size ?? (screen ? 520 : GIF_SIZE);
  const gifFps = story.gif?.fps ?? (screen ? 8 : GIF_FPS);
  const gifColors = story.gif?.colors ?? (screen ? 96 : GIF_COLORS);
  ffmpeg([
    "-i",
    mp4,
    "-filter_complex",
    [
      `fps=${gifFps},scale=${gifWidth}:-2:flags=lanczos,split[a][b]`,
      `[a]palettegen=max_colors=${gifColors}:stats_mode=full[p]`,
      `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    ].join(";"),
    "-loop",
    "0",
    gif,
  ]);

  // The poster is the richest moment: the last step, settled.
  const posterAt = story.recording
    ? story.recording.seconds / 2
    : story.slides
      ? story.hold / 2
      : story.steps[story.steps.length - 1].at + story.fade + 1;
  ffmpeg(["-ss", `${posterAt}`, "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg]);

  for (const file of [mp4, gif, jpg]) {
    console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      gif,
    ],
    { encoding: "utf8" }
  );
  const [width, height] = probe.stdout.trim().split(",").map(Number);

  const prefix = `email/releases/${options.version}/${name}`;
  if (options.upload) {
    const token = loadCloudflareToken();
    if (!token && !options.dryRun) {
      throw new Error("CLOUDFLARE_API_TOKEN is not set (env or .env)");
    }
    const cache = "public, max-age=31536000, immutable";
    putAsset(token, `${prefix}.gif`, gif, "image/gif", cache, options.dryRun);
    putAsset(token, `${prefix}.mp4`, mp4, "video/mp4", cache, options.dryRun);
    putAsset(token, `${prefix}.jpg`, jpg, "image/jpeg", cache, options.dryRun);
  }
  // The email shows the GIF; the app plays the MP4 over the JPG poster.
  console.log(
    "\nmanifest media:\n" +
      JSON.stringify(
        {
          image: `${ASSETS_CDN}/${prefix}.gif`,
          video: `${ASSETS_CDN}/${prefix}.mp4`,
          poster: `${ASSETS_CDN}/${prefix}.jpg`,
          alt: story.alt,
          width,
          height,
        },
        null,
        2
      )
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
