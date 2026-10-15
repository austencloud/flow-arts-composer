// Checks the prerendered language pages after `pnpm run build`.
// Fails when a page is missing, mislabeled, links back into English, or still
// shows English text. Run on d2 with the build.
// Plan: docs/superpowers/plans/2026-10-14-per-language-seo-pages.md
import fs from "node:fs";
import path from "node:path";

const ROOT =
  process.env.SEO_PRERENDER_ROOT ?? ".svelte-kit/output/prerendered/pages";
const SITE = "https://tkaflowarts.com";
const LOCALES = ["de", "es", "fr", "it", "pt"]; // keep equal to SEO_LOCALES
const MAX_ENGLISH_SHARE = 0.1;
const failures = [];
let checked = 0;

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".html")
          ? [path.join(dir, entry.name)]
          : []
    );

// Visible sentences of four or more words inside <main>. The site header and
// footer sit outside it and are not translated yet.
const sentences = (html) =>
  (html.split(/<main[\s>]/)[1] ?? html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);

// Anchors into the English guide that are not the language row's own links.
const englishLinks = (html) =>
  (html.match(/<a\b[^>]*>/g) ?? []).filter(
    (tag) => /href="\/guide(\/[^"]*)?"/.test(tag) && !/hreflang=/.test(tag)
  );

for (const locale of LOCALES) {
  const dir = path.join(ROOT, locale);
  if (!fs.existsSync(dir)) {
    failures.push(`${locale}: no pages`);
    continue;
  }
  for (const file of walk(dir)) {
    const rel = file
      .slice(dir.length)
      .split(path.sep)
      .join("/")
      .replace(/\.html$/, "");
    const where = `/${locale}${rel}`;
    const html = fs.readFileSync(file, "utf8");
    // A retired address prerenders as a meta refresh to its successor.
    if (/http-equiv="refresh"/.test(html)) continue;
    checked++;
    if (!html.includes(`<html lang="${locale}"`))
      failures.push(`${where}: lang`);
    if (!html.includes(`rel="canonical" href="${SITE}${where}"`))
      failures.push(`${where}: canonical`);
    for (const tag of ["en", ...LOCALES, "x-default"])
      if (!html.includes(`hreflang="${tag}"`))
        failures.push(`${where}: hreflang ${tag}`);
    const stray = englishLinks(html);
    if (stray.length)
      failures.push(
        `${where}: ${stray.length} links into English, e.g. ${stray[0]}`
      );
    const enFile = path.join(ROOT, `${rel.replace(/^\//, "")}.html`);
    if (!fs.existsSync(enFile)) {
      failures.push(`${where}: no English twin`);
      continue;
    }
    const english = new Set(sentences(fs.readFileSync(enFile, "utf8")));
    const mine = sentences(html);
    const leaked = mine.filter((s) => english.has(s));
    if (mine.length && leaked.length / mine.length > MAX_ENGLISH_SHARE)
      failures.push(
        `${where}: ${leaked.length}/${mine.length} sentences still English, e.g. "${leaked[0]}"`
      );
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`localized prerender ok (${checked} pages)`);
