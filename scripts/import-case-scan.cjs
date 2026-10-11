const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = process.cwd().replace(/\\/g, "/");
const files = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', {
  encoding: "utf8",
  maxBuffer: 1 << 28,
})
  .split("\n")
  .filter(Boolean);

const dirCache = new Map();
function names(dir) {
  if (!dirCache.has(dir)) {
    try {
      dirCache.set(dir, fs.readdirSync(dir));
    } catch {
      dirCache.set(dir, []);
    }
  }
  return dirCache.get(dir);
}
function existsExact(p) {
  return names(path.dirname(p)).includes(path.basename(p));
}
function existsCI(p) {
  const b = path.basename(p).toLowerCase();
  return names(path.dirname(p)).find((n) => n.toLowerCase() === b);
}

const exts = [".ts", ".svelte.ts", ".js", ".svelte", ".json", ""];
const idx = ["/index.ts", "/index.js", "/index.svelte.ts"];

function tryResolve(base) {
  const cands = [];
  for (const e of exts) cands.push(base + e);
  for (const i of idx) cands.push(base + i);
  for (const c of cands) if (existsExact(c)) return { ok: true };
  for (const c of cands) {
    const hit = existsCI(c);
    if (hit) return { mismatch: path.join(path.dirname(c), hit) };
  }
  return null;
}

const importRe =
  /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

const problems = [];
for (const f of files) {
  const abs = path.join(root, f);
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  let m;
  while ((m = importRe.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    let base;
    if (spec.startsWith(".")) base = path.join(path.dirname(abs), spec);
    // #lib imports name the emitted .js file; the source beside it is .ts.
    else if (spec.startsWith("#lib/"))
      base = path.join(root, "src/lib", spec.slice(5).replace(/\.js$/, ""));
    else continue;
    base = base.replace(/\\/g, "/");
    const r = tryResolve(base);
    if (r && r.mismatch) {
      problems.push({
        file: f,
        spec,
        real: path.relative(root, r.mismatch).replace(/\\/g, "/"),
      });
    }
  }
}

if (!problems.length) console.log("NO IMPORT-CASE MISMATCHES");
else {
  console.log("IMPORT-CASE MISMATCHES (" + problems.length + "):");
  for (const p of problems)
    console.log(`  ${p.file}\n    import "${p.spec}"\n    real:  ${p.real}\n`);
}
