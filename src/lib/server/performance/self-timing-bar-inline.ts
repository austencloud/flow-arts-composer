import engineSource from "#lib/shared/loading/self-timing-bar.engine.js?raw";

/**
 * src/app.html's boot screen runs the shared self-timing bar before any
 * bundle loads, so the engine has to be in the page itself. It is written
 * once (self-timing-bar.engine.js, which the app also imports) and inlined
 * here at the placeholder app.html keeps for it. A page without the
 * placeholder (the stripped homepage) is returned unchanged.
 */
const PLACEHOLDER = "<!-- tka-self-timing-bar -->";
const ENGINE_SCRIPT = `<script>${engineSource}</script>`;

export function inlineSelfTimingBar(html: string): string {
  if (!html.includes(PLACEHOLDER)) return html;
  return html.replace(PLACEHOLDER, () => ENGINE_SCRIPT);
}
