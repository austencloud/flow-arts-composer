// Deferral analysis: for each static import of CreateModule, compute the
// EXCLUSIVE subtree (files that leave the eager graph if that edge goes dynamic).
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();
const LIB = path.join(ROOT, "src", "lib");

function resolve(spec, fromFile) {
  let base;
  // #lib imports name the emitted .js file; the source beside it is .ts.
  if (spec.startsWith("#lib/"))
    base = path.join(LIB, spec.slice(5).replace(/\.js$/, ""));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const cands = [
    base, base + ".ts", base + ".svelte", base + ".js", base + ".svelte.ts",
    path.join(base, "index.ts"), path.join(base, "index.js"),
  ];
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return c; } catch {} }
  return null;
}

const importRe = /import\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+)["']/g;
const rel = (p) => p.replace(ROOT + path.sep, "").split(path.sep).join("/");

// Build static adjacency over the whole reachable graph from CreateModule.
const start = path.join(LIB, "features/create/shared/components/CreateModule.svelte");
const adj = new Map();   // file -> Set(children files)
const sizeOf = new Map();
function readSize(f){ if(sizeOf.has(f))return sizeOf.get(f); let s=0; try{s=fs.statSync(f).size}catch{} sizeOf.set(f,s); return s; }

const seen = new Set([start]);
const q = [start];
while (q.length) {
  const f = q.shift();
  readSize(f);
  let src; try { src = fs.readFileSync(f, "utf8"); } catch { adj.set(f,new Set()); continue; }
  const kids = new Set();
  let mm; importRe.lastIndex = 0;
  while ((mm = importRe.exec(src))) {
    const spec = mm[1];
    const lineStart = src.lastIndexOf("\n", mm.index);
    const line = src.slice(lineStart + 1, mm.index + mm[0].length);
    if (/import\s+type/.test(line)) continue;
    const r = resolve(spec, f);
    if (r) { kids.add(r); if (!seen.has(r)) { seen.add(r); q.push(r); } }
  }
  adj.set(f, kids);
}

// reach from root over current adjacency, cutting a SET of root->child edges
function reach(cutSet) {
  const cut = cutSet instanceof Set ? cutSet : new Set(cutSet ? [cutSet] : []);
  const s = new Set([start]); const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    for (const c of (adj.get(f) || [])) {
      if (f === start && cut.has(c)) continue; // cut this edge
      if (!s.has(c)) { s.add(c); stack.push(c); }
    }
  }
  return s;
}

const baseReach = reach(null);
const baseFiles = baseReach.size;
let baseBytes = 0; for (const f of baseReach) baseBytes += readSize(f);

const directChildren = [...(adj.get(start) || [])];
const rows = [];
for (const c of directChildren) {
  const r = reach(c);
  const removed = [...baseReach].filter(f => !r.has(f));
  let bytes = 0; for (const f of removed) bytes += readSize(f);
  rows.push({ child: rel(c), childPath: c, files: removed.length, kb: Math.round(bytes/1024) });
}
rows.sort((a,b) => b.files - a.files);

console.log(`CreateModule eager static graph: ${baseFiles} files, ${Math.round(baseBytes/1024)} KB source`);
console.log(`Direct static imports in CreateModule.svelte: ${directChildren.length}`);
console.log("");
console.log("Deferral candidates (make import() dynamic → these leave the EAGER graph):");
console.log("  files  source-KB  import");
for (const r of rows) {
  if (r.files === 0) continue;
  console.log(`  ${String(r.files).padStart(5)}  ${String(r.kb).padStart(8)}  ${r.child}`);
}

// Combined cut of the genuinely-deferrable (user-action) boundaries.
const DEFER = [
  "SequenceActionsCoordinator.svelte",
  "StepEditorCoordinator.svelte",
  "SaveToLibraryPanel.svelte",
  "VideoRecordCoordinator.svelte",
  "OrientationPickerDrawer.svelte",
];
const cutSet = new Set(rows.filter(r => DEFER.some(d => r.childPath.endsWith(d))).map(r => r.childPath));
const r2 = reach(cutSet);
const removed = [...baseReach].filter(f => !r2.has(f));
let bytes = 0; for (const f of removed) bytes += readSize(f);
const sumExclusive = rows.filter(r => cutSet.has(r.childPath)).reduce((a,r)=>a+r.files,0);
console.log("");
console.log("COMBINED deferral of all user-action boundaries (" + cutSet.size + " imports made dynamic):");
console.log(`  eager graph: ${baseFiles} -> ${r2.size} files  (removes ${removed.length} files, ${Math.round(bytes/1024)} KB source)`);
console.log(`  per-edge exclusives summed only ${sumExclusive} -> shared subtrees worth ${removed.length - sumExclusive} extra files freed only by deferring the whole set`);
