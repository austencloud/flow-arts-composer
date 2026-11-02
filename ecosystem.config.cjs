// pm2 app definition for the TKA dev server (vite :5173 + Cloudflare tunnel).
// Daily driver: pm2 restart tka-dev | pm2 logs tka-dev | pm2 status
// Spec: docs/superpowers/specs/2026-07-18-pm2-dev-server-runner-design.md
module.exports = {
  apps: [
    {
      name: "tka-dev",
      script: "scripts/start-dev-pm2.cjs",
      cwd: __dirname,
      autorestart: true,
      // Vite on this project cold-boots slowly; don't flap-detect it as broken.
      min_uptime: 30000,
      max_restarts: 10,
      restart_delay: 3000,
      // Give the script's finally block time to tree-kill vite + cloudflared.
      kill_timeout: 15000,
      windowsHide: true,
    },
    {
      // Runs the d2 ship preflight (push-public.mjs --check, never --push)
      // once local main has been quiet on a new tree for 10 minutes, so a ship
      // finds the verdict cached. Decisions: .git/publish-preflight-watch.log.
      name: "tka-preflight-watch",
      script: "scripts/preflight-watch.mjs",
      cwd: __dirname,
      autorestart: true,
      min_uptime: 10000,
      restart_delay: 30000,
      // A stop mid-run leaves the d2 job running; the next publish of that
      // snapshot waits for it and reuses its verdict.
      kill_timeout: 5000,
      windowsHide: true,
    },
    {
      // Laptop-only backup tunnel: dev2.tkaflowarts.com -> this machine's
      // :5173. Not auto-started by `pm2 start ecosystem.config.cjs` on other
      // machines unless explicitly started: pm2 start ecosystem.config.cjs --only tka-tunnel2
      name: "tka-tunnel2",
      script: "scripts/tunnel2-pm2.cjs",
      cwd: __dirname,
      autorestart: true,
      min_uptime: 10000,
      restart_delay: 3000,
      kill_timeout: 10000,
      windowsHide: true,
    },
  ],
};
