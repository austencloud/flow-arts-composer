// Build corrected DCKΨ- and Δ-ΛRZ projects from their newest saved drafts.
// Writes candidates to the scratchpad only; install-fixed-projects.cjs copies
// them into the archive after validation.
const fs = require("fs");
const path = require("path");

const ARCHIVE = path.join(process.env.USERPROFILE, ".tka", "post-studio-drafts");
const OUT = path.join(__dirname, "fixed-projects");
const DCK_DRAFT =
  "C:/Users/Austen/Downloads/InShot-DCK-recovery-2026-09-30/Video_20260904_195028030.profile";
const INSHOT_SLOW_START = 21.904918; // DCK InShot main clip 2 timeline start
const CAPTION_Y = 0.14; // ΩΛ-XJ's caption row, clear of the bottom-right PiP

// Derived from the InShot overlay's beat counter (beat_counter.py), validated
// against Austen's ΩΛ-XJ hand taps (mean +0.019 s, sd 0.022 s).
const FPS = 30;
// Measured: first frame index of each counter-change run in 07-DCKΨ- (5).mp4
// (the run at frame 0 is the opening fade and is skipped).
const DCK_CHANGE_FRAMES = [
  21, 42, 63, 83, 104, 125, 145, 166, 187, 207, 228, 249, 270, 290, 311, 332,
  352, 373, 394, 414, 435, 456, 477, 497, 518, 539, 559, 580, 601, 621, 642,
];

function newestProject(sequenceId) {
  let best = null;
  for (const name of fs.readdirSync(ARCHIVE)) {
    if (!name.endsWith(".json")) continue;
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(path.join(ARCHIVE, name), "utf8"));
    } catch {
      continue;
    }
    for (const record of saved.records || []) {
      if (record.key !== `tka:post-studio:project:v2:${sequenceId}`) continue;
      const project = JSON.parse(record.value);
      if (!best || project.updatedAt > best.project.updatedAt) best = { project, name };
    }
  }
  if (!best) throw new Error(`No saved project for ${sequenceId}`);
  return best;
}

const round = (v) => Math.round(v * 1e6) / 1e6;
const allItems = (p) => p.tracks.flatMap((t) => t.items);
const withoutMandala = (p) => ({
  ...p,
  tracks: p.tracks
    .map((t) => ({ ...t, items: t.items.filter((i) => !(i.kind === "moves" && i.mode === "mandala")) }))
    .filter((t) => t.items.length > 0),
});

function nativeBox(p, width, height) {
  const xs = [p[0], p[2], p[4], p[6]];
  const ys = [p[1], p[3], p[5], p[7]];
  return {
    width: (Math.max(...xs) - Math.min(...xs)) / width,
    height: (Math.max(...ys) - Math.min(...ys)) / height,
  };
}

function dckCaptions(slowClip) {
  const draft = JSON.parse(fs.readFileSync(DCK_DRAFT, "utf8"));
  const native = JSON.parse(draft.TextConfig.ConfigJson)
    .map((t) => ({
      text: t.TI_1,
      offset: t.BCI_3 / 1e6 - INSHOT_SLOW_START,
      duration: t.BCI_5 / 1e6,
      size: nativeBox(t.BI_13, t.BI_5, t.BI_6),
      style: t.TI_15,
      scale: t.BI_3,
      canvasWidth: t.BI_5,
      animation: t.BOI_9,
    }))
    .sort((a, b) => a.offset - b.offset);
  const placed = [];
  return native.map((c, index) => {
    // Stack under any caption still on screen, as InShot showed both at once.
    let y = CAPTION_Y;
    for (const other of placed) {
      const overlaps = c.offset < other.offset + other.duration && other.offset < c.offset + c.duration;
      if (overlaps) y = Math.max(y, other.box.y + other.box.height + 0.01);
    }
    const box = {
      x: round((1 - c.size.width) / 2),
      y: round(y),
      width: round(c.size.width),
      height: round(c.size.height),
    };
    const offset = round(c.offset);
    const duration = round(Math.min(c.duration, slowClip.duration - offset));
    placed.push({ offset, duration, box });
    return {
      id: `text-${index + 1}`,
      start: round(slowClip.start + offset),
      duration,
      box,
      opacity: 1,
      fadeIn: 0,
      fadeOut: 0,
      anchor: { itemId: slowClip.id, offset },
      fill: false,
      kind: "text",
      text: c.text,
      size: "m",
      style: {
        fontFamily: c.style.TAS_7,
        fontSizeNative: c.style.TAS_1,
        fontScale: c.scale,
        sourceCanvasWidth: c.canvasWidth,
        letterSpacing: c.style.TAS_2,
        lineSpacing: c.style.TAS_3,
        alignment: "center",
        alpha: c.style.TAS_0 / 255,
      },
      animation: {
        kind: "letter-slide",
        inDurationSeconds: c.animation.AP_3 / 1e6,
        outDurationSeconds: c.animation.AP_3 / 1e6,
        entranceProgress: c.animation.AP_15,
        exitProgress: c.animation.AP_16,
      },
    };
  });
}

function fixDck(now) {
  const { project, name } = newestProject("DCKΨ-");
  let next = withoutMandala(project);
  delete next.canvas; // 9:16 is the default and matches ΩΛ-XJ
  const slow = allItems(next).find((i) => i.id === "dck-main-2");
  const captions = dckCaptions(slow);
  const textTrack = next.tracks.find((t) => t.items.some((i) => i.kind === "text"));
  next = {
    ...next,
    tracks: next.tracks.map((t) =>
      t === textTrack ? { ...t, items: captions } : { ...t, items: t.items.filter((i) => i.kind !== "text") }
    ),
  };
  const take = next.takes.find((t) => t.id === "dck-take-1");
  const taps = DCK_CHANGE_FRAMES.map((f) => round((f + 0.5) / FPS));
  const period = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  taps.push(round(taps[taps.length - 1] + period));
  if (taps[taps.length - 1] >= take.durationSeconds) throw new Error("32nd tap past the clip");
  const old = next.timings["dck-take-1"];
  next.timings = {
    ...next.timings,
    "dck-take-1": {
      schemaVersion: 1,
      sequenceId: "DCKΨ-",
      takeKey: take.takeKey,
      sections: [
        {
          ...old.sections[0],
          bpm: round(60 / period),
          taps,
        },
      ],
      updatedAt: now,
    },
  };
  next.updatedAt = now;
  return { project: next, basedOn: name };
}

function fixWoods(now) {
  const { project, name } = newestProject("Δ-ΛRZ");
  const next = withoutMandala(project);
  next.updatedAt = now;
  return { project: next, basedOn: name };
}

fs.mkdirSync(OUT, { recursive: true });
const now = Date.now();
for (const [file, result] of [
  ["DCK.json", fixDck(now)],
  ["woods.json", fixWoods(now + 1)],
]) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(result.project, null, 1));
  const p = result.project;
  console.log(`\n${file} from ${result.basedOn}: canvas ${p.canvas ?? "9:16"}, items ${allItems(p).length}`);
  for (const t of p.tracks) console.log(`  ${t.id}: ${t.items.map((i) => `${i.kind}${i.mode ? ":" + i.mode : ""}`).join(", ")}`);
}
const dck = JSON.parse(fs.readFileSync(path.join(OUT, "DCK.json"), "utf8"));
for (const c of allItems(dck).filter((i) => i.kind === "text"))
  console.log(`  ${JSON.stringify(c.text).padEnd(28)} +${c.anchor.offset.toFixed(2)} for ${c.duration.toFixed(2)} at y ${c.box.y} w ${c.box.width.toFixed(3)} h ${c.box.height.toFixed(3)}`);
const s = dck.timings["dck-take-1"].sections[0];
console.log(`  run-through taps ${s.taps.length}, bpm ${s.bpm}, first ${s.taps[0]}, last ${s.taps.at(-1)}`);
