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
        const clientStorageKey = "tka-phone-review-client-id";
        const defaultTarget = { path: "/create", revision: 0 };
        let display = { following: true, displayedPath: defaultTarget.path, displayedRevision: defaultTarget.revision };
        let polling = false;
        let generation = 0;
        let interactionPolling = false;
        let clientId = "";
        const pathLabel = document.querySelector("#path");
        const preview = document.querySelector("#preview");
        const control = document.querySelector("#control");
        const status = document.querySelector("#status");
        const served = document.querySelector("#served");
        const isSafePath = (path) => {
          if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("#")) return false;
          try { const url = new URL(path, location.origin); const decoded = decodeURIComponent(url.pathname); return url.origin === location.origin && decoded !== "/review" && !decoded.startsWith("/review/"); } catch { return false; }
        };
        const getClientId = () => {
          try {
            const saved = sessionStorage.getItem(clientStorageKey);
            if (saved && /^[a-zA-Z0-9-]{8,80}$/.test(saved)) return saved;
            const generated = crypto.randomUUID ? crypto.randomUUID() : "review-" + Date.now() + "-" + Math.random().toString(36).slice(2);
            sessionStorage.setItem(clientStorageKey, generated);
            return generated;
          } catch { return "review-" + Date.now() + "-" + Math.random().toString(36).slice(2); }
        };
        const text = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
        const isVisible = (element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const controlSnapshot = () => {
          const document = preview.contentDocument;
          if (!document) return [];
          const seen = new Set();
          return [...document.querySelectorAll("button, input, select")].filter(isVisible).slice(0, 80).flatMap((element) => {
            const tag = element.tagName.toLowerCase();
            const inputType = tag === "input" ? element.type : undefined;
            if (tag === "input" && !["range", "number", "checkbox", "radio"].includes(inputType)) return [];
            const id = text(element.id, 160);
            if (!id) return [];
            if (seen.has(id)) return [];
            seen.add(id);
            const labelledBy = text(element.getAttribute("aria-labelledby"), 160).split(" ").map((id) => text(document.getElementById(id)?.textContent, 120)).join(" ");
            const label = element.labels?.[0]?.textContent;
            const name = text(element.getAttribute("aria-label") || labelledBy || label || (tag === "button" ? element.textContent : ""), 180);
            if (!name) return [];
            const control = { id, name, kind: tag, disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true" || element.matches(":disabled") };
            if (tag === "input") control.inputType = inputType;
            if (tag === "select") control.options = [...element.options].slice(0, 30).map((option) => text(option.value, 100));
            return [control];
          });
        };
        const iframeRoute = () => {
          try {
            const url = new URL(preview.contentWindow?.location.href || "", location.origin);
            url.searchParams.delete("reviewRevision");
            return url.pathname + (url.search || "");
          } catch { return display.displayedPath; }
        };
        const client = () => ({
          id: clientId,
          label: (matchMedia("(max-width: 600px)").matches ? "phone" : "desktop") + " " + innerWidth + "×" + innerHeight,
          viewport: matchMedia("(max-width: 600px)").matches ? "phone" : "desktop",
          route: iframeRoute(),
          controls: controlSnapshot(),
          lastSeenAt: new Date().toISOString(),
        });
        const report = async (result) => {
          try { await fetch("/api/dev/phone-review-controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: client(), ...(result ? { result } : {}) }) }); } catch {}
        };
        const execute = (command) => {
          if (command.kind === "inspect") return { status: "completed", message: "Controls reported" };
          const controls = controlSnapshot();
          const matches = controls.filter((control) => command.controlId ? control.id === command.controlId : control.name === command.controlName);
          if (matches.length !== 1) return { status: "failed", message: "Control was not uniquely available" };
          const control = matches[0];
          if (control.disabled) return { status: "failed", message: "Control is disabled" };
          const document = preview.contentDocument;
          const element = document.getElementById(control.id);
          if (!element) return { status: "failed", message: "Control changed before execution" };
          if (command.kind === "click") { element.click(); return { status: "completed", message: "Clicked " + control.name }; }
          if (control.kind === "select") {
            if (![...element.options].some((option) => option.value === command.value)) return { status: "failed", message: "Select value is unavailable" };
            element.value = command.value; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
            return { status: "completed", message: "Set " + control.name };
          }
          if (control.kind !== "input" || !control.inputType) return { status: "failed", message: "Control cannot be set" };
          if (["checkbox", "radio"].includes(control.inputType)) {
            if (!["true", "false"].includes(command.value)) return { status: "failed", message: "Toggle value must be true or false" };
            element.checked = command.value === "true"; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
            return { status: "completed", message: "Set " + control.name };
          }
          const number = Number(command.value);
          if (!Number.isFinite(number)) return { status: "failed", message: "Numeric value is invalid" };
          element.value = String(number);
          if (!element.checkValidity()) return { status: "failed", message: "Numeric value is outside this control's constraints" };
          element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
          return { status: "completed", message: "Set " + control.name };
        };
        const pollInteractions = async () => {
          if (!display.following || interactionPolling) return;
          interactionPolling = true;
          const pollGeneration = generation;
          try {
            await report();
            const route = iframeRoute();
            const response = await fetch("/api/dev/phone-review-command?clientId=" + encodeURIComponent(clientId) + "&route=" + encodeURIComponent(route), { cache: "no-store" });
            const result = response.ok ? await response.json() : null;
            if (!display.following || pollGeneration !== generation || !result?.command || result.command.clientId !== clientId || result.command.expectedRoute !== iframeRoute() || Date.parse(result.command.expiresAt) <= Date.now()) return;
            const outcome = execute(result.command);
            await report({ commandId: result.command.id, ...outcome });
          } catch {} finally { interactionPolling = false; }
        };
        const source = () => display.displayedPath + (display.displayedPath.includes("?") ? "&" : "?") + "reviewRevision=" + display.displayedRevision;
        const render = () => {
          pathLabel.textContent = display.displayedPath;
          control.textContent = display.following ? "Pause" : "Follow";
          control.dataset.primary = String(!display.following);
          if (preview.dataset.source !== source()) { generation += 1; preview.src = source(); preview.dataset.source = source(); }
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
        clientId = getClientId();
        preview.addEventListener("load", () => { if (display.following) void report(); });
        render();
        if (display.following) { void poll(); void pollInteractions(); }
        window.setInterval(() => void poll(), 3000);
        window.setInterval(() => void pollInteractions(), 1000);
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
