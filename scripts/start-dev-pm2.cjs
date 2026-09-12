// pm2 entry point for the TKA dev server. pm2's direct .exe spawning is
// unreliable on Windows (powershell exits instantly with empty logs), but its
// node-script handling is first-class — so this shim spawns start-dev.ps1 and
// bridges lifecycle both ways: child exit -> process exit (pm2 restarts us),
// pm2 stop/restart -> tree-kill the whole powershell/vite/cloudflared family.
//
// The signal handlers below are best-effort only. On Windows pm2 stops us with
// process.kill(pid, 'SIGINT'), which node cannot intercept: the shim dies on
// the spot, its handlers never run, and pm2's own tree-kill only finds this one
// pid. That orphaned a live powershell/cmd/pnpm/vite/cloudflared tree on every
// restart; two Agent Hub restarts twenty seconds apart left three Vite servers
// fighting for :5173 and each new boot killed whichever one was healthy. So
// the real cleanup lives in start-dev.ps1: it receives our pid via
// TKA_PM2_PARENT_PID and shuts its whole tree down as soon as we are gone.
const { spawn, execSync } = require("child_process");
const path = require("path");

const child = spawn(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "start-dev.ps1")],
  {
    cwd: path.join(__dirname, ".."),
    stdio: ["ignore", "inherit", "inherit"],
    // Tells start-dev.ps1 it's running under pm2, so its manual-run takeover
    // (pm2 stop tka-dev) doesn't fire and stop ourselves.
    env: { ...process.env, TKA_PM2: "1", TKA_PM2_PARENT_PID: String(process.pid) },
    // Keep the powershell console invisible — pm2's windowsHide doesn't reach
    // this grandchild, and a visible window + autorestart = "unclosable".
    windowsHide: true,
  }
);

child.on("exit", (code) => process.exit(code ?? 1));

function killTree() {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
  } catch {}
  process.exit(0);
}
process.on("SIGINT", killTree);
process.on("SIGTERM", killTree);
