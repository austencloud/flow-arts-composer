// Reads a .cpuprofile written by profile-3d.mjs.
//
//   node scripts/scene-boot/analyze.mjs <file.cpuprofile> [--reveal-ms <n>]
//
// Prints main-thread busy time per second with its finger-contact and GL
// program share, the longest busy stretches, and the call chains that reach
// the finger code. --reveal-ms (profile-3d prints revealSinceProfileMs) marks
// the second the curtain came down.
import fs from "node:fs";

const args = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(args[0], "utf8"));
const revealAt = args.indexOf("--reveal-ms");
const revealSec =
  revealAt >= 0 ? Math.floor(Number(args[revealAt + 1]) / 1000) : null;
const nodes = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) =>
  `${n.callFrame.functionName || "(anon)"}@${n.callFrame.url.split("/").pop().replace(/\?.*$/, "")}:${n.callFrame.lineNumber}`;
const targets =
  /fingerTriangleClearance|posedVertex|prepareStaffPoints|bodyClearanceNeed|triangleStaffDistance|measureSkinSupportRadii/;
const GL =
  /getProgramInfoLog|getShaderInfoLog|getProgramParameter|linkProgram|compileShader/;
const IDLE = /^\((idle|program)\)$/;
const chains = new Map();
const hist = new Map();
const histAll = new Map();
const histGL = new Map();
// Busy stretches: runs of non-idle samples, broken by a gap of 5 ms or more
// of idle, a stand-in for tasks.
const stretches = [];
let stretch = null;
let idleRun = 0;
let t = p.startTime;
for (let i = 0; i < p.samples.length; i++) {
  t += p.timeDeltas[i] ?? 0;
  const at = (t - p.startTime) / 1000;
  const sec = Math.floor(at / 1000);
  const n = nodes.get(p.samples[i]);
  const d = (p.timeDeltas[i] ?? 0) / 1000;
  const idle = IDLE.test(n.callFrame.functionName);
  histAll.set(sec, (histAll.get(sec) ?? 0) + (idle ? 0 : d));
  if (idle) {
    idleRun += d;
    if (stretch && idleRun >= 5) {
      stretches.push(stretch);
      stretch = null;
    }
  } else {
    idleRun = 0;
    stretch ??= { startMs: at, endMs: at, finger: 0, gl: 0 };
    stretch.endMs = at;
    if (targets.test(n.callFrame.functionName)) stretch.finger += d;
    if (GL.test(n.callFrame.functionName)) stretch.gl += d;
  }
  if (GL.test(n.callFrame.functionName))
    histGL.set(sec, (histGL.get(sec) ?? 0) + d);
  if (!targets.test(n.callFrame.functionName)) continue;
  hist.set(sec, (hist.get(sec) ?? 0) + d);
  const stack = [];
  let id = n.id;
  while (id !== undefined) {
    const m = nodes.get(id);
    stack.push(name(m));
    id = parent.get(id);
  }
  // keep interesting app-level frames only
  const app = stack.filter(
    (s) => !/three\.core|three\.module|^\(|three-stdlib/.test(s)
  );
  const key = app.slice(0, 14).join(" <- ");
  chains.set(key, (chains.get(key) ?? 0) + d);
}
if (stretch) stretches.push(stretch);

console.log(
  "== busy / finger / GL program self time per second since profile start (ms) =="
);
const secs = [...histAll.keys()].sort((a, b) => a - b);
console.log(
  secs
    .map(
      (s) =>
        `${String(s).padStart(2)}s busy=${Math.round(histAll.get(s) ?? 0)
          .toString()
          .padStart(4)} finger=${Math.round(hist.get(s) ?? 0)
          .toString()
          .padStart(4)} gl=${Math.round(histGL.get(s) ?? 0)
          .toString()
          .padStart(4)}${s === revealSec ? "  <- reveal" : ""}`
    )
    .join("\n")
);

console.log("\n== longest busy stretches ==");
for (const s of stretches
  .map((s) => ({ ...s, ms: s.endMs - s.startMs }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 10))
  console.log(
    `${Math.round(s.ms).toString().padStart(6)} ms at ${Math.round(s.startMs)
      .toString()
      .padStart(6)} ms  finger=${Math.round(s.finger)} gl=${Math.round(s.gl)}`
  );

console.log("\n== top call chains into finger/clearance code ==");
for (const [k, v] of [...chains.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8))
  console.log(`\n${Math.round(v)} ms\n  ${k.split(" <- ").join("\n  <- ")}`);
