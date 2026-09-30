// Re-derive DCKΨ- video framing from the InShot draft with the importer's
// formulas (post-inshot-import.ts geometry/keyGeometry/easing/cropOf):
// InShot's horizontal GL axis spans [-9/16, 9/16], so widths and x offsets
// divide by 9/16. The earlier build-project.py skipped that and the crop.
const fs = require("fs");
const path = require("path");
const ASPECT = 9 / 16;
const DRAFT = "C:/Users/Austen/Downloads/InShot-DCK-recovery-2026-09-30/Video_20260904_195028030.profile";
const file = path.join(__dirname, "fixed-projects", "DCK.json");
const project = JSON.parse(fs.readFileSync(file, "utf8"));
const clips = JSON.parse(JSON.parse(fs.readFileSync(DRAFT, "utf8")).MediaClipConfig.ConfigJson);

const cropOf = (c) => ({ left: c.MCI_11.CP_1, top: c.MCI_11.CP_2, right: c.MCI_11.CP_3, bottom: c.MCI_11.CP_4 });
const geometry = (m, crop) => {
  if (m.length !== 16 || m[1] !== 0 || m[4] !== 0) throw new Error("skew");
  const width = m[0] / ASPECT, height = m[5];
  return { x: (1 + m[12] / ASPECT - width) / 2, y: (1 - m[13] - height) / 2, width, height, rotation: 0, crop };
};
const keyGeometry = (k, crop) => {
  const width = k.VKF_1 / ASPECT, height = k.VKF_2;
  return { x: (1 + k.VKF_3 / ASPECT - width) / 2, y: (1 - k.VKF_4 - height) / 2, width, height, rotation: k.VKF_5, crop };
};
const easing = (code) => {
  if (code === 0) return [0, 0, 1, 1];
  if (code === 4) return { kind: "sampled-bezier", curve: [0.3, 0, 0.7, 1], samples: 300 };
  if (code === 5) return { kind: "sampled-bezier", curve: [0.47, 0, 0, 1], samples: 300 };
  if (code === 6) return { kind: "sampled-bezier", curve: [1, 0, 0.53, 1], samples: 300 };
  throw new Error(`easing ${code}`);
};

const items = project.tracks.flatMap((t) => t.items);
for (const [index, id] of [[0, "dck-main-1"], [1, "dck-main-2"]]) {
  const clip = clips[index];
  const item = items.find((i) => i.id === id);
  const crop = cropOf(clip);
  item.sourceGeometry = geometry(clip.MCI_22, crop);
  const keys = clip.MCI_54.map((k) => {
    if (k.VKF_6 !== 1) throw new Error("opacity key");
    if (Math.abs(k.VKF_8 - clip.MCI_2 - k.VKF_7 * (clip.MCI_25 ?? 1)) > 2 && Math.abs(k.VKF_8 - clip.MCI_2 - k.VKF_7) > 2)
      console.log(`  note ${id}: VKF_7 ${k.VKF_7} vs source offset ${k.VKF_8 - clip.MCI_2}`);
    return { t: (k.VKF_8 - clip.MCI_2) / 1e6, value: keyGeometry(k, crop), easing: easing(k.VKF_9) };
  });
  const old = item.keyframes?.sourceGeometry ?? [];
  if (keys.length) {
    if (old.length !== keys.length) throw new Error(`${id} key count ${old.length} vs ${keys.length}`);
    keys.forEach((k, i) => { if (Math.abs(k.t - old[i].t) > 1e-6) throw new Error(`${id} key ${i} time moved`); });
    item.keyframes = { ...item.keyframes, sourceGeometry: keys };
  } else if (item.keyframes) {
    delete item.keyframes.sourceGeometry;
    if (Object.keys(item.keyframes).length === 0) delete item.keyframes;
  }
  const g = item.sourceGeometry;
  console.log(id, "geometry", [g.x, g.y, g.width, g.height].map((v) => v.toFixed(4)).join(" "), "crop", JSON.stringify(crop), "keys", keys.length);
  if (keys.length) console.log("  first key", JSON.stringify(keys[0].value).slice(0, 140), JSON.stringify(keys[0].easing));
}
project.updatedAt = Date.now();
fs.writeFileSync(file, JSON.stringify(project, null, 1));
console.log("updatedAt", new Date(project.updatedAt).toISOString());
