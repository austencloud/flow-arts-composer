#!/usr/bin/env node
/**
 * Marks the shared agent Chrome so production analytics leaves it out.
 *
 * Sets the `tka_agent_browser` cookie on .tkaflowarts.com through the
 * browser's own DevTools endpoint, so no page has to be opened. The app reads
 * it in src/lib/shared/analytics/agent-browser.ts: PostHog captures nothing
 * and no visit alert is sent. Chrome caps cookie lifetimes at 400 days;
 * launch-chrome-debug.ps1 runs this on every call, which keeps it fresh.
 *
 * Usage: node scripts/mark-agent-browser.mjs [port]   (default 9222)
 */

const COOKIE = "tka_agent_browser";
const DOMAINS = [".tkaflowarts.com"];
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const port = Number(process.argv[2] ?? 9222);
const version = await (
  await fetch(`http://127.0.0.1:${port}/json/version`)
).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

const reply = await new Promise((resolve) => {
  socket.onmessage = (event) => resolve(JSON.parse(event.data));
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Storage.setCookies",
      params: {
        cookies: DOMAINS.map((domain) => ({
          name: COOKIE,
          value: "1",
          domain,
          path: "/",
          secure: true,
          sameSite: "Lax",
          expires: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
        })),
      },
    })
  );
});
socket.close();

if (reply.error) {
  console.error(`Could not mark the agent browser: ${reply.error.message}`);
  process.exit(1);
}
console.log(
  `Agent browser on port ${port} marked (${COOKIE} on ${DOMAINS.join(", ")}).`
);
