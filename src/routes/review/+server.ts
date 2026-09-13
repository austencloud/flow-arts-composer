import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const _reviewDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Phone review</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; background: var(--theme-page-bg, #0b0d13); color: var(--theme-text, #f7f8fb); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100dvh; }
      main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: 100dvh; min-height: 100dvh; background: var(--theme-page-bg, #0b0d13); }
      header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px max(16px, env(safe-area-inset-left)); background: var(--theme-panel-bg, #12151d); border-color: var(--theme-stroke, rgba(255,255,255,.16)); }
      header { border-bottom: 1px solid var(--theme-stroke, rgba(255,255,255,.16)); }
      footer { min-height: 45px; border-top: 1px solid var(--theme-stroke, rgba(255,255,255,.16)); color: var(--theme-text-muted, rgba(247,248,251,.68)); font-size: 12px; }
      p { margin: 0; }
      header > div { min-width: 0; }
      .eyebrow { color: var(--theme-text-muted, rgba(247,248,251,.68)); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .path { margin-top: 2px; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
      button { min-height: var(--min-touch-target, 44px); padding: 10px 16px; border: 1px solid var(--theme-stroke, rgba(255,255,255,.16)); border-radius: 8px; background: var(--theme-card-bg, #1b202b); color: var(--theme-text, #f7f8fb); font: inherit; cursor: pointer; }
      button[data-primary="true"] { background: var(--theme-accent, #7c66e8); border-color: var(--theme-accent, #7c66e8); color: var(--theme-text-on-accent, #fff); }
      button:focus-visible { outline: 3px solid var(--theme-accent, #9f8dff); outline-offset: 3px; }
      iframe { display: block; width: 100%; height: 100%; min-height: 0; border: 0; background: #000; }
      .served { max-width: 50%; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; text-align: right; }
      @media (max-width: 500px) { footer { align-items: flex-start; flex-direction: column; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div><p class="eyebrow">Development review</p><p class="path" id="path">/create</p></div>
        <button id="control" type="button" data-primary="false">Pause</button>
      </header>
      <iframe id="preview" title="Interactive phone preview"></iframe>
      <footer aria-live="polite"><span id="status">Connecting to the local review target</span><span class="served" id="served">Serving checkout unavailable</span></footer>
    </main>
    <script>
      (() => {
        const storageKey = "tka-phone-review-paused-target";
        const defaultTarget = { path: "/create", revision: 0 };
        let display = { following: true, displayedPath: defaultTarget.path, displayedRevision: defaultTarget.revision };
        let polling = false;
        let generation = 0;
        const pathLabel = document.querySelector("#path");
        const preview = document.querySelector("#preview");
        const control = document.querySelector("#control");
        const status = document.querySelector("#status");
        const served = document.querySelector("#served");
        const isSafePath = (path) => {
          if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("#")) return false;
          try { const url = new URL(path, location.origin); const decoded = decodeURIComponent(url.pathname); return url.origin === location.origin && decoded !== "/review" && !decoded.startsWith("/review/"); } catch { return false; }
        };
        const source = () => display.displayedPath + (display.displayedPath.includes("?") ? "&" : "?") + "reviewRevision=" + display.displayedRevision;
        const render = () => {
          pathLabel.textContent = display.displayedPath;
          control.textContent = display.following ? "Pause" : "Follow";
          control.dataset.primary = String(!display.following);
          if (preview.dataset.source !== source()) { preview.src = source(); preview.dataset.source = source(); }
        };
        const pause = () => {
          display.following = false;
          generation += 1;
          try { localStorage.setItem(storageKey, JSON.stringify(display)); } catch {}
          status.textContent = "Preview paused on the displayed route";
          render();
        };
        const poll = async () => {
          if (!display.following || polling) return;
          polling = true;
          const pollGeneration = generation;
          try {
            const response = await fetch("/api/dev/phone-review-target", { cache: "no-store" });
            if (!response.ok) throw new Error();
            const result = await response.json();
            if (!display.following || pollGeneration !== generation) return;
            if (isSafePath(result.target?.path) && Number.isSafeInteger(result.target?.revision) && result.target.revision >= 0) {
              display.displayedPath = result.target.path;
              display.displayedRevision = result.target.revision;
              render();
            }
            served.textContent = result.served?.branch && result.served?.commit ? "Serving " + result.served.branch + " @ " + result.served.commit : "Serving checkout unavailable";
            status.textContent = result.stateError ? "The local target file is invalid. Showing the safe default." : "Following the local review target";
          } catch { status.textContent = "The local review target is unavailable. Keeping this preview open."; }
          finally { polling = false; }
        };
        control.addEventListener("click", () => {
          if (display.following) { pause(); return; }
          generation += 1;
          display.following = true;
          try { localStorage.removeItem(storageKey); } catch {}
          render();
          void poll();
        });
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
          if (saved && isSafePath(saved.displayedPath) && Number.isSafeInteger(saved.displayedRevision)) {
            display = { following: false, displayedPath: saved.displayedPath, displayedRevision: saved.displayedRevision };
            status.textContent = "Preview paused on the saved route";
          }
        } catch {}
        render();
        if (display.following) { void poll(); }
        window.setInterval(() => void poll(), 3000);
      })();
    </script>
  </body>
</html>`;

export const GET: RequestHandler = () => {
  if (!dev) error(404, "Not found");
  return new Response(_reviewDocument, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
