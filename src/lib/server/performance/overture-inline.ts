/**
 * Inlines the Overture's boot script into the root app shell, where
 * src/app.html leaves its placeholder right after the boot script, and starts
 * it with the compiled worker's URL. The placeholder sits inside the
 * root-app-only block, so landing pages never carry it; retro routes hide the
 * boot screen and the script then removes its canvas.
 *
 * Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
 */
import overtureSource from "#lib/shared/loading/overture/overture-boot.js?raw";
import workerUrl from "#lib/shared/loading/overture/overture.worker.ts?worker&url";

const PLACEHOLDER = "<!-- tka-overture -->";

/** The start call's config, safe inside a <script> element. */
export function overtureConfig(worker: string): string {
  return JSON.stringify({
    worker,
    pool: "/boot/overture-pool.json",
    font: "/fonts/tka/tka.woff2",
  }).replace(/</g, "\\u003c");
}

/** The source without its comment lines and indentation (it has no multi-line strings). */
export function compactScript(source: string): string {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .join("\n");
}

const OVERTURE_SCRIPT = `<script>${compactScript(overtureSource)}\n__tkaStartOverture(${overtureConfig(workerUrl)});</script>`;

export function inlineOverture(html: string): string {
  if (!html.includes(PLACEHOLDER)) return html;
  return html.replace(PLACEHOLDER, () => OVERTURE_SCRIPT);
}
