/**
 * watch-mcp-service: the scheduled half of verify-mcp-service.
 *
 * mcp-server/deploy/install-watch-task.ps1 registers it for Austen's account
 * at logon and every 15 minutes. It runs the same read-only check, and a
 * failure counts only if a second check a minute later agrees. It shows a
 * Windows notification when the connector stops working, when the kind of
 * problem changes, every 6 hours while it stays down, and once when it works
 * again. The last state and a short log live in %LOCALAPPDATA%\FlowArtsKnowledgeMCP.
 *
 *   node scripts/watch-mcp-service.mjs                      # what the task runs
 *   node scripts/watch-mcp-service.mjs --test-notification  # show a sample
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import {
  alertToast,
  decideAlert,
  RECHECK_DELAY_MS,
  toastXml,
} from "./lib/mcp-service-alerts.mjs";
import {
  classifyMcpServiceHealth,
  describeFacts,
  hasServiceProblem,
} from "./lib/mcp-service-health.mjs";
import { probeMcpService, readLastError } from "./lib/mcp-service-probe.mjs";

const DATA_DIR = join(
  process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
  "FlowArtsKnowledgeMCP"
);
const STATE_PATH = join(DATA_DIR, "watch-state.json");
const LOG_PATH = join(DATA_DIR, "watch.log");
const LOG_LIMIT_BYTES = 512 * 1024;

// PowerShell 7 cannot load the WinRT notification types, so the notifier is
// Windows PowerShell 5.1. Its Start menu shortcut registers this app ID, which
// is what lets an unpackaged script show a notification at all.
const WINDOWS_POWERSHELL = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
);
const NOTIFIER_APP_ID =
  "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

function localStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function firstLine(error) {
  return (
    String(error?.stderr || error?.message || error)
      .trim()
      .split(/\r?\n/)[0] || "unknown failure"
  );
}

function log(line) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(LOG_PATH, `${localStamp(new Date())} ${line}\n`);
    if (statSync(LOG_PATH).size > LOG_LIMIT_BYTES) {
      const tail = readFileSync(LOG_PATH, "utf8").slice(-LOG_LIMIT_BYTES / 2);
      writeFileSync(LOG_PATH, tail.slice(tail.indexOf("\n") + 1));
    }
  } catch {
    // The log is a convenience; it must never stop a check or an alert.
  }
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

// Tag and group make each notification replace the previous one, so a long
// outage leaves one entry in the notification center, not one per reminder.
function showToast(xml) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]",
    "$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]",
    "$document = [Windows.Data.Xml.Dom.XmlDocument]::new()",
    `$document.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(xml, "utf8").toString("base64")}')))`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($document)",
    "$toast.Tag = 'status'",
    "$toast.Group = 'flow-arts-mcp'",
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${NOTIFIER_APP_ID}').Show($toast)`,
  ].join("\n");
  execFileSync(
    WINDOWS_POWERSHELL,
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, windowsHide: true }
  );
}

async function confirmedCheck() {
  let facts = await probeMcpService();
  let report = classifyMcpServiceHealth(facts);
  if (!report.healthy) {
    log(
      `check failed (${describeFacts(facts)}); checking again in ${RECHECK_DELAY_MS / 1000} s`
    );
    await sleep(RECHECK_DELAY_MS);
    facts = await probeMcpService();
    report = classifyMcpServiceHealth(facts);
  }
  return { facts, report };
}

async function main() {
  if (process.argv.includes("--test-notification")) {
    showToast(
      toastXml({
        title: "Test: Flow Arts Knowledge MCP alerts work",
        lines: [
          "A real alert looks like this and stays until you dismiss it.",
          "This test did not check the service.",
        ],
        attribution: "watch-mcp-service --test-notification",
        persistent: true,
      })
    );
    log("showed a test notification");
    return;
  }

  const { facts, report } = await confirmedCheck();
  const now = new Date();
  const previous = readState();
  const decision = decideAlert(previous, report, now);
  const summary = `${report.healthy ? "OK" : "DOWN"} ${describeFacts(facts)}`;

  if (!decision.notify) {
    writeState(decision.state);
    log(summary);
    return;
  }
  const lastError = hasServiceProblem(report.problems)
    ? readLastError()?.line
    : null;
  try {
    showToast(
      toastXml(alertToast(decision, report, { previous, lastError, now }))
    );
  } catch (error) {
    // The old state stays, so the next run tries this notification again.
    log(
      `${summary}; notification (${decision.notify}) failed: ${firstLine(error)}`
    );
    process.exitCode = 1;
    return;
  }
  writeState(decision.state);
  log(`${summary}; notified (${decision.notify})`);
}

if (process.platform !== "win32") {
  process.stderr.write(
    "[mcp-watch] Windows only: the service runs under NSSM on Austen's machine.\n"
  );
  process.exit(2);
}

try {
  await main();
} catch (error) {
  log(`watcher failed: ${firstLine(error)}`);
  process.exitCode = 1;
}
