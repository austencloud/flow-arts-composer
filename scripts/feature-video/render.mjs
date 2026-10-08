import {
  delay,
  launchHeadlessChrome,
  navigate,
  openTab,
} from "../lib/chrome-cdp.mjs";

/**
 * `post-project.mjs render`: renders a feature video through an editor that
 * has it open, which saves the MP4 in the project's exports/ folder. With
 * `open`, it first opens that editor in a private headless Chrome, never your
 * Chrome and never the agent browser on 9222, and closes it afterwards.
 */

/** How long Chrome may leave one command unanswered, as in capture.mjs. */
const COMMAND_TIMEOUT_MS = 60000;
/** A desktop window, so the editor lays out as it does on a computer. */
const EDITOR_WINDOW = { width: 1600, height: 1000, deviceScaleFactor: 1 };

/**
 * The origin a browser should open. [::1] and 127.0.0.1 are other sites to a
 * browser, and the editor lives at localhost.
 */
export function browserOrigin(url) {
  const origin = new URL(url);
  if (origin.hostname === "[::1]" || origin.hostname === "127.0.0.1")
    origin.hostname = "localhost";
  return origin.origin;
}

/**
 * Opens the feature video's editor in a private headless Chrome and waits for
 * it to join the bridge. Resolves with that editor's session id and a `close`
 * that ends the Chrome.
 */
export async function openFeatureEditor({
  origin,
  feature,
  listSessions,
  launch = launchHeadlessChrome,
  open = openTab,
  go = navigate,
  sleep = delay,
  waitMs = 180000,
  now = Date.now,
}) {
  // An editor that closed a moment ago still counts as open for about 10 s.
  const before = new Set((await listSessions()).map((session) => session.id));
  const chrome = await launch(EDITOR_WINDOW);
  let tab;
  const close = async () => {
    await tab?.close().catch(() => {});
    await chrome.close();
  };
  try {
    tab = await open("about:blank", {
      port: chrome.port,
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
    });
    await go(tab, `${origin}/post?feature=${encodeURIComponent(feature)}`);
    // A render draws on animation frames, which only a page in front gets.
    await tab.send("Page.bringToFront").catch(() => {});
    for (const deadline = now() + waitMs; ; await sleep(500)) {
      const opened = (await listSessions()).find(
        (session) => session.featureSlug === feature && !before.has(session.id)
      );
      if (opened) return { sessionId: opened.id, close };
      if (now() > deadline)
        throw new Error(
          `The editor for ${feature} did not open within ${Math.round(waitMs / 1000)} s.`
        );
    }
  } catch (cause) {
    await close();
    throw cause;
  }
}

/**
 * Queues a render in an open editor and follows it until the editor saves
 * the file. `log` gets a line for each 10% step.
 */
export async function renderInEditor({
  request,
  sessionId,
  name,
  log = () => {},
  pollMs = 1000,
  stallMs = 180000,
  now = Date.now,
  sleep = delay,
}) {
  const { renderId } = await request(
    "POST",
    {},
    { kind: "render", sessionId, ...(name ? { name } : {}) }
  );
  let line = "";
  let last = "";
  let movedAt = now();
  for (;;) {
    await sleep(pollMs);
    const job = await request("GET", { sessionId, renderId });
    if (job.state === "completed")
      return { file: job.file, path: job.path, bytes: job.bytes };
    if (job.state === "failed")
      throw new Error(job.message || "The render failed.");
    // Any change counts as moving, even one the printed line rounds away.
    const progress = `${job.state} ${job.phase} ${job.percent}`;
    if (progress !== last) {
      last = progress;
      movedAt = now();
    } else if (now() - movedAt > stallMs) {
      throw new Error(
        `The render has not moved for ${Math.round(stallMs / 1000)} s (${line}). Is the editor's tab in front? If that tab stays open, the render carries on there; press Cancel in it to stop the render.`
      );
    }
    const next =
      job.state === "queued"
        ? "waiting for the editor"
        : `${job.phase ?? "rendering"} ${Math.floor(job.percent / 10) * 10}%`;
    if (next !== line) {
      line = next;
      log(line);
    }
  }
}

/**
 * Renders a feature video through the editor that has it open or, with
 * `open`, through one this call opens and closes again. `request` is
 * post-project.mjs's bridge request; `findFeature` rejects for a name no
 * feature video has.
 */
export async function renderFeature({
  request,
  feature,
  name,
  open = false,
  origin,
  log = () => {},
  pollMs,
  openEditor = openFeatureEditor,
  findFeature = async () => {},
}) {
  const listSessions = async () => (await request("GET")).sessions;
  const holding = (await listSessions()).filter(
    (session) => session.featureSlug === feature
  );
  if (holding.length > 1)
    throw new Error(
      `${holding.length} editors have ${feature} open. Close all but one, then try again.`
    );
  const follow = (sessionId) =>
    renderInEditor({ request, sessionId, name, log, pollMs });
  if (holding[0]) return follow(holding[0].id);
  // A misspelled name would otherwise wait for an editor that never opens.
  await findFeature(feature);
  if (!open)
    throw new Error(
      `No editor has ${feature} open. Open ${origin}/post?feature=${feature}, or pass --open.`
    );
  log("opening the editor in a headless Chrome");
  const editor = await openEditor({ origin, feature, listSessions });
  try {
    return await follow(editor.sessionId);
  } finally {
    await editor.close();
  }
}
