// Build a self-contained comparison page for the festival pack candidates.
//
// Reads the output of festival-pack-candidates.ts and inlines every card as a
// webp data URI, so the page works as a published Artifact (strict CSP: no
// external requests). Each unique card is embedded once as a CSS class and
// referenced by class, so every image payload has one owner in the output.
//
//   node scripts/festival-pack-contact-sheet.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REPO = path.join(import.meta.dirname, "..");
const EVIDENCE = path.join(
  REPO,
  "docs/superpowers/specs/festival-sample-pack/evidence"
);
const CARDS = path.join(EVIDENCE, "cards");
const OUT = path.join(EVIDENCE, "festival-pack-candidates.html");

const { lists, catalog = [] } = JSON.parse(
  fs.readFileSync(path.join(EVIDENCE, "candidates.json"), "utf8")
);

const cssName = (file) =>
  "c" + file.replace(/\.png$/, "").replace(/[^a-zA-Z0-9]/g, "-");

// Every distinct card across all packs plus the catalog, embedded once.
const unique = new Map();
for (const list of lists) for (const c of list) unique.set(c.file, c);
for (const c of catalog) unique.set(c.file, c);

const rules = [];
for (const [file] of unique) {
  const buf = await sharp(path.join(CARDS, file))
    .resize({ width: 720 })
    .webp({ quality: 76 })
    .toBuffer();
  rules.push(
    `.${cssName(file)}{background-image:url(data:image/webp;base64,${buf.toString("base64")})}`
  );
}

const figure = (c, aria) => `<figure class="card">
<div class="shot ${cssName(c.file)}" role="img" aria-label="${aria}"></div>
<figcaption><span class="w">${c.word}</span><span class="l">${c.label}</span>${c.startPlacement ? `<span class="p">${c.startPlacement} → ${c.endPlacement}</span>` : ""}</figcaption>
</figure>`;

// `tnd-quarter-opp-mpmp` -> `quarter-opp`, so the catalog groups by family.
const family = (id) => id.replace(/^tnd-/, "").replace(/-[a-z]+$/, "");
const FAMILY_ORDER = [
  "split-same",
  "split-opp",
  "tog-same",
  "tog-opp",
  "quarter-same",
  "quarter-opp",
];
const FAMILY_TITLE = {
  "split-same": "Split timing · Same direction",
  "split-opp": "Split timing · Opposite direction",
  "tog-same": "Together timing · Same direction",
  "tog-opp": "Together timing · Opposite direction",
  "quarter-same": "Quarter timing · Same direction",
  "quarter-opp": "Quarter timing · Opposite direction",
};

const byFamily = new Map();
for (const c of catalog) {
  const f = family(c.slot);
  if (!byFamily.has(f)) byFamily.set(f, []);
  byFamily.get(f).push(c);
}

const catalogSection = !catalog.length
  ? ""
  : `<section class="list">
<h3><span class="n">Full TnD catalog</span></h3>
<p class="lede sub">Every canonical entry is shown twice: plain, then with one whole turn on every motion. <strong>TTTT</strong>, <strong>UUUU</strong>, <strong>VVVV</strong>, <strong>NQNQ</strong>, and <strong>OROR</strong> are all here. This reference section keeps the complete catalog visible even when packs repeat family pairs.</p>
${FAMILY_ORDER.filter((f) => byFamily.has(f))
  .map((f) => {
    const cards = byFamily.get(f);
    return `<h4 class="fam">${FAMILY_TITLE[f]}</h4>
<div class="row cat cat-${cards.length}">${cards
      .map((c) => figure(c, `${c.word}, ${c.label}`))
      .join("")}</div>`;
  })
  .join("\n")}
</section>`;

const listSections = lists
  .map(
    (list, i) => `<section class="list">
<h3><span class="n">Pack ${i + 1}</span></h3>
<div class="row">${list.map((c) => figure(c, `${c.word}, ${c.label}`)).join("")}</div>
</section>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Festival sample pack: candidate packs</title>
<style>
:root{
  --ground:#f4f5fa; --surface:#ffffff; --mat:#ffffff;
  --ink:#16162b; --muted:#63687f; --line:#dcdfeb;
  --accent:#4338ca; --accent-soft:#eef0fd;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#111219; --surface:#1a1c27; --mat:#f2f3f8;
    --ink:#e9eaf3; --muted:#9aa0b8; --line:#2b2e3f;
    --accent:#a5b4fc; --accent-soft:#232640;
  }
}
:root[data-theme="dark"]{
  --ground:#111219; --surface:#1a1c27; --mat:#f2f3f8;
  --ink:#e9eaf3; --muted:#9aa0b8; --line:#2b2e3f;
  --accent:#a5b4fc; --accent-soft:#232640;
}
*{box-sizing:border-box}
/* Lockstep root ramp per .claude/rules/4k-native-layout.md: 16px at 1680 up to
   24px at 3840, so every rem measure grows by the same multiplier. Below 1680
   the base design stays the base design. */
@media (min-width:1680px){:root{font-size:clamp(16px, 0.3704vw + 9.78px, 24px)}}
body{
  margin:0; padding:clamp(1.25rem,3vw,3rem);
  background:var(--ground); color:var(--ink);
  font:1rem/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
}
/* Fluid band per .claude/rules/4k-native-layout.md: floor, then grow to 2600. */
.wrap{max-width:min(2600px,94vw); margin:0 auto; display:flex; flex-direction:column; gap:2.5rem}
header{display:grid; grid-template-columns:minmax(0,1fr); gap:.75rem 2.5rem}
header h1{
  font-family:"Iowan Old Style",Georgia,"Times New Roman",serif;
  font-size:clamp(1.9rem,3.2vw,2.9rem); line-height:1.15; margin:0;
  text-wrap:balance; letter-spacing:-.01em;
}
.lede{margin:0; max-width:68ch; color:var(--muted); font-size:1.05rem}
.lede strong{color:var(--ink); font-weight:600}
.list{background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:1rem 1.25rem 1.25rem}
.list h3{margin:0 0 .85rem; font-size:.75rem; font-weight:600}
.list .sub{margin:0 0 1.25rem; font-size:.92rem}
.fam{
  margin:1.6rem 0 .7rem; font-size:.78rem; font-weight:600;
  text-transform:uppercase; letter-spacing:.07em; color:var(--muted);
  padding-bottom:.35rem; border-bottom:1px solid var(--line);
}
.fam:first-of-type{margin-top:.4rem}
.list .n{
  display:inline-block; padding:.2rem .6rem; border-radius:999px;
  background:var(--accent-soft); color:var(--accent);
  text-transform:uppercase; letter-spacing:.08em; font-size:.68rem;
}
.row{display:grid; grid-template-columns:repeat(8,1fr); gap:.85rem}
.card{margin:0; display:flex; flex-direction:column; gap:.45rem; min-width:0}
.shot{
  aspect-ratio:8/7; background-color:var(--mat);
  background-size:contain; background-repeat:no-repeat; background-position:center;
  border:1px solid var(--line); border-radius:8px;
}
figcaption{display:flex; flex-direction:column; line-height:1.3}
.w{font-weight:650; font-size:.88rem; letter-spacing:.01em}
.l{color:var(--muted); font-size:.72rem}
.p{color:var(--muted); font-size:.66rem}
/* Six and twelve-card families use six columns. The eight-card family uses the
   pack grid so it never leaves two cards stranded on a second row. */
.row.cat{grid-template-columns:repeat(6,1fr)}
.row.cat-8{grid-template-columns:repeat(8,1fr)}
@media (min-width:900px){
  header{grid-template-columns:repeat(2,minmax(0,1fr))}
  header h1{grid-column:1/-1}
}
@media (max-width:1400px){.row,.row.cat{grid-template-columns:repeat(4,1fr)}}
@media (max-width:720px){.row,.row.cat{grid-template-columns:repeat(2,1fr)}}
${rules.join("\n")}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Festival sample pack: ${lists.length} candidate packs</h1>
  <p class="lede">Every LOOP card is <strong>generated</strong> and returns to one of the three classic starting positions: alpha1, beta5, or gamma11. The 16-count rotated card is quartered. The 8-count rotated card is halved.</p>
  <p class="lede">TnD is different. Timing and direction live in the variation, so these cards come directly from the canonical catalog. The first TnD card in each pack is plain at level&nbsp;1; the second puts <strong>one whole turn on every motion</strong> at level&nbsp;2. Each pack pairs one same-direction family with one opposite-direction family.</p>
</header>

${listSections}

${catalogSection}
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`${unique.size} unique cards embedded, ${lists.length} packs`);
console.log(
  `${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB -> ${OUT}`
);
