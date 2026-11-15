#!/usr/bin/env node
/**
 * i18n-localize.cjs — local-LLM translation pipeline for missing released-scope keys.
 *
 * Extends the /translate skill: generates missing translations via a local Ollama
 * model (qwen3-coder:30b), enforces a termbase + structural validator gate, and
 * writes a REVIEW file ({locale}.new.json) — it never touches the source locale file.
 *
 * Usage:
 *   node scripts/i18n-localize.cjs <locale> [--limit N] [--batch 25] [--model qwen3-coder:30b]
 *
 * Output:
 *   messages/{locale}.new.json   — source locale + newly-passed keys (sorted)
 *   messages/{locale}.report.json — per-key verdicts: pass / flag / fail + difficulty tags
 *
 * Promotion to source is a SEPARATE explicit step (review the .new.json, then merge +
 * run scripts/validate-i18n.cjs + npm run i18n:types). Nothing here auto-merges.
 */
const fs = require("fs");
const path = require("path");

const MSG = path.join(__dirname, "..", "messages");
const DRAFTS = path.join(__dirname, "i18n-drafts"); // review files live OUTSIDE messages/ so
fs.mkdirSync(DRAFTS, { recursive: true });           // inlang/validate-i18n don't scan them as locales
const OLLAMA = "http://127.0.0.1:11434/api/generate";

const locale = process.argv[2];
if (!locale) { console.error("Usage: node scripts/i18n-localize.cjs <locale> [--limit N] [--batch 25]"); process.exit(1); }
const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const LIMIT = parseInt(arg("--limit", "0"), 10);
const BATCH = parseInt(arg("--batch", "25"), 10);
const MODEL = arg("--model", "qwen3-coder:30b");

// ---- scope (mirrors the /translate skill) ----
const RELEASED = ["browse","create","generator","learn","library","settings","sequence","viewer","export","compose","module","tab","dashboard","landing","visibility","common","action","auth","form","filter","empty","error","loading","search","nav","sort","pagination","confirm","tooltip","accessibility","app","share","time","direction","position","level","difficulty","unit","badge","notification","keyboard","calendar","pronoun","severity","favorites","profile"];
const UNREL = ["voice","moderation","connect","hall","skel2tka","poi","mandala","arena","community","watch","premium","gamification","admin","clip","attribution","beta","duet","viewer3d","audience","scheduler","avatar","background","sessions","events","video","lab","warning"];
const startsWithAny = (k, list) => list.some(p => k === p || k.startsWith(p + "_"));
function isReleased(k) {
  if (k === "$schema") return false;
  if (startsWithAny(k, UNREL)) return false;                       // top-level unreleased prefix
  // any key whose underscore-segments include an unreleased module token belongs to that
  // unreleased module (module_arena, tab_desc_lab_x, nav_admin, ...) — skip per /translate skill
  if (k.split("_").some(seg => UNREL.includes(seg))) return false;
  return startsWithAny(k, RELEASED);
}

const REGISTER = {
  es: 'informal "tú" (quieres, inténtalo, tu)', pt: 'informal "você/tu", natural pt-BR',
  fr: '"vous" (French UI convention)', de: 'formal "Sie" (German UI convention)',
  it: 'informal "tu"', ja: "polite です/ます form", ko: "polite 해요/합니다 form",
  zh: "concise Simplified Chinese UI tone", ar: "Modern Standard Arabic, natural UI phrasing",
  ru: 'formal "Вы" (Russian UI convention)',
};
const LANGNAME = { es:"Spanish", fr:"French", de:"German", pt:"Portuguese", it:"Italian", ja:"Japanese", ko:"Korean", zh:"Chinese (Simplified)", ar:"Arabic", ru:"Russian" };

const en = JSON.parse(fs.readFileSync(path.join(MSG, "en.json"), "utf8"));
const loc = JSON.parse(fs.readFileSync(path.join(MSG, `${locale}.json`), "utf8"));
const tb = JSON.parse(fs.readFileSync(path.join(__dirname, "i18n-termbase.json"), "utf8"));
const KEEP_ENGLISH = tb._keepEnglish;
// build {English term -> pinned locale value} (skip TODO)
const termPins = {};
for (const [term, row] of Object.entries(tb.terms)) {
  const v = row[locale];
  if (v && v !== "TODO") termPins[term] = v;
}

let missing = Object.keys(en).filter(k => isReleased(k) && !(k in loc));
if (LIMIT > 0) missing = missing.slice(0, LIMIT);

// difficulty tag: which strings get flagged for human/Claude grading
const DOMAIN = /\b(grid|box|diamond|dash|pictograph|prop|sequence|step|hand|letter|loop|vtg|mirror|turn|variation|radial|orientation|alpha|beta|gamma|glyph|elemental)\b/i;
const difficulty = (s) => (s.length > 80 ? "long" : DOMAIN.test(s) ? "domain" : "simple");

const ph = (s) => (s.match(/\{[^}]+\}/g) || []).sort().join(",");

function termGlossaryBlock() {
  const lines = [];
  for (const [term, v] of Object.entries(termPins)) {
    lines.push(v === term ? `  "${term}" -> keep as "${term}" (do not translate)` : `  "${term}" -> "${v}"`);
  }
  for (const t of KEEP_ENGLISH) lines.push(`  "${t}" -> keep as "${t}" (do not translate)`);
  return lines.join("\n");
}

function buildPrompt(sample) {
  // few-shot register anchors from this locale's existing strings
  const anchorKeys = Object.keys(loc).filter(k => k in en && loc[k].length > 3 && loc[k].length < 55).slice(0, 6);
  const anchors = anchorKeys.map(k => `  "${en[k]}" => "${loc[k]}"`).join("\n");
  return `Translate these flow-arts app UI strings from English to ${LANGNAME[locale]} (${locale}).
REGISTER: ${REGISTER[locale]}.
Match the voice of these existing app translations:
${anchors}

TERMBASE (use these exact translations for domain terms):
${termGlossaryBlock()}

RULES:
- Keep every KEY exactly unchanged.
- Preserve {placeholder} tokens EXACTLY (same name, same braces).
- Apply the termbase verbatim. Watch grammatical gender agreement.
- UI terseness; keep short labels short.
- Output ONLY valid JSON, same structure, no markdown, no commentary.

JSON:
${JSON.stringify(sample, null, 2)}`;
}

async function gen(prompt) {
  const body = JSON.stringify({ model: MODEL, prompt, stream: false, options: { num_ctx: 8192, temperature: 0.2 } });
  const r = await fetch(OLLAMA, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!r.ok) throw new Error("ollama " + r.status);
  return r.json();
}

// per-string validator → {verdict: pass|flag|fail, reasons:[]}
function validateString(key, src, out) {
  const reasons = [];
  if (out === undefined || out === null || out === "") return { verdict: "fail", reasons: ["missing"] };
  if (ph(src) !== ph(out)) return { verdict: "fail", reasons: ["placeholder mismatch"] };
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); // accent-insensitive
  // start-anchored only (\bTerm, no trailing \b): tolerates compounding (de Handpfade)
  // and inflection (Props, giri) while still catching a fully-translated term.
  const startRe = (t) => new RegExp("\\b" + esc(t), "i");
  // keep-English / English-pinned terms must survive
  for (const t of [...KEEP_ENGLISH, ...Object.keys(termPins).filter(k => termPins[k] === k)]) {
    if (startRe(t).test(src) && !startRe(t).test(out)) return { verdict: "fail", reasons: [`glossary term "${t}" not preserved`] };
  }
  // localized pins: root should appear (soft — inflection + accents allowed) → flag if absent
  for (const [t, v] of Object.entries(termPins)) {
    if (v === t) continue;
    if (startRe(t).test(src)) {
      const root = strip(v).slice(0, Math.max(3, v.length - 2)); // floor 3 for short words (giro→gir)
      if (!strip(out).includes(root)) reasons.push(`termbase "${t}"->"${v}" not applied`);
    }
  }
  // untranslated passthrough (multi-word, not a pure brand line)
  if (out === src && src.split(/\s+/).length > 1 && !KEEP_ENGLISH.some(t => src.includes(t))) reasons.push("looks untranslated");
  // length outlier — CJK is character-dense (no spaces), legitimately far shorter,
  // so skip the too-short floor for zh/ja/ko; keep the too-long ceiling for all.
  const CJK = ["zh", "zh-Hant", "ja", "ko"].includes(locale);
  if (out.length > src.length * 3 + 10 || (!CJK && out.length < src.length * 0.3)) reasons.push("length outlier");
  return { verdict: reasons.length ? "flag" : "pass", reasons };
}

(async () => {
  console.log(`Locale ${locale} | released-missing: ${missing.length} | batch ${BATCH} | model ${MODEL}`);
  const results = {}; // key -> {out, verdict, reasons, diff}
  for (let i = 0; i < missing.length; i += BATCH) {
    const keys = missing.slice(i, i + BATCH);
    const sample = {}; keys.forEach(k => sample[k] = en[k]);
    let parsed = null;
    try {
      const j = await gen(buildPrompt(sample));
      let raw = j.response.replace(/^[\s\S]*?```(?:json)?\s*/, "").replace(/\s*```[\s\S]*$/, "");
      if (!raw.trim().startsWith("{")) raw = j.response;
      parsed = JSON.parse(raw);
    } catch (e) {
      keys.forEach(k => results[k] = { out: null, verdict: "fail", reasons: ["batch error: " + e.message], diff: difficulty(en[k]) });
      console.log(`  batch ${i / BATCH | 0}: ERROR ${e.message}`);
      continue;
    }
    let pass = 0, flag = 0, fail = 0;
    for (const k of keys) {
      const v = validateString(k, en[k], parsed[k]);
      results[k] = { out: parsed[k] ?? null, verdict: v.verdict, reasons: v.reasons, diff: difficulty(en[k]) };
      v.verdict === "pass" ? pass++ : v.verdict === "flag" ? flag++ : fail++;
    }
    console.log(`  batch ${(i / BATCH | 0)}: ${keys.length} keys -> pass ${pass} flag ${flag} fail ${fail}`);
  }

  // assemble review file: source locale + all non-fail keys (pass+flag), sorted
  const merged = { ...loc };
  let added = 0;
  for (const [k, r] of Object.entries(results)) if (r.verdict !== "fail" && r.out != null) { merged[k] = r.out; added++; }
  const sorted = {}; Object.keys(merged).sort().forEach(k => sorted[k] = merged[k]);
  fs.writeFileSync(path.join(DRAFTS, `${locale}.new.json`), JSON.stringify(sorted, null, 2) + "\n");

  // report
  const summary = { locale, missing: missing.length, pass: 0, flag: 0, fail: 0, byDifficulty: {} };
  const flagged = [], failed = [];
  for (const [k, r] of Object.entries(results)) {
    summary[r.verdict]++;
    summary.byDifficulty[r.diff] = summary.byDifficulty[r.diff] || { total: 0, flag: 0, fail: 0 };
    summary.byDifficulty[r.diff].total++;
    if (r.verdict === "flag") { summary.byDifficulty[r.diff].flag++; flagged.push({ k, en: en[k], out: r.out, reasons: r.reasons, diff: r.diff }); }
    if (r.verdict === "fail") { summary.byDifficulty[r.diff].fail++; failed.push({ k, en: en[k], out: r.out, reasons: r.reasons }); }
  }
  fs.writeFileSync(path.join(DRAFTS, `${locale}.report.json`), JSON.stringify({ summary, flagged, failed }, null, 2) + "\n");

  console.log(`\n=== ${locale} ===`);
  console.log(`pass ${summary.pass} | flag ${summary.flag} | fail ${summary.fail} | added to .new.json: ${added}`);
  console.log("by difficulty:", JSON.stringify(summary.byDifficulty));
  console.log(`review file: scripts/i18n-drafts/${locale}.new.json`);
  console.log(`report:      scripts/i18n-drafts/${locale}.report.json`);
})();
