/**
 * When the scheduled watcher notifies Austen, and what the notification says.
 * Pure: watch-mcp-service.mjs probes, waits, stores the state, and shows the
 * notification.
 */

// A failure counts only when a second check a minute later agrees, so a
// deliberate restart or a slow answer does not alert.
export const RECHECK_DELAY_MS = 60_000;
export const REMINDER_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * A dead server and a missing tunnel route need different fixes, so a switch
 * between them is news. Flicker between service states during a crash loop
 * (paused, then briefly running) is not.
 */
export function alertCategories(problems) {
  const categories = new Set(
    problems.map((problem) =>
      problem.kind === "route-missing" ? "route" : "service"
    )
  );
  return [...categories].sort();
}

/**
 * previous: the state this returned on the last run, or null.
 * report: classifyMcpServiceHealth result, already confirmed by a recheck.
 * Returns { notify, state }, where notify is null, "down", "changed",
 * "reminder", or "recovered". Save state only once the notification is shown,
 * so a notification that fails is tried again on the next run.
 */
export function decideAlert(previous, report, now) {
  const at = now.toISOString();
  const wasDown = previous?.status === "down";

  if (report.healthy) {
    const since =
      previous?.status === "up" && previous.since ? previous.since : at;
    return {
      notify: wasDown ? "recovered" : null,
      state: { status: "up", since },
    };
  }

  const categories = alertCategories(report.problems);
  if (!wasDown) {
    return {
      notify: "down",
      state: { status: "down", since: at, categories, alertedAt: at },
    };
  }

  const since = previous.since ?? at;
  if (categories.join() !== (previous.categories ?? []).join()) {
    return {
      notify: "changed",
      state: { status: "down", since, categories, alertedAt: at },
    };
  }
  // An unreadable alertedAt makes the reminder due rather than silencing it.
  const quietFor = now.getTime() - Date.parse(previous.alertedAt);
  if (!(quietFor < REMINDER_INTERVAL_MS)) {
    return {
      notify: "reminder",
      state: { status: "down", since, categories, alertedAt: at },
    };
  }
  return { notify: null, state: previous };
}

function headline(problems, still) {
  const kinds = problems.map((problem) => problem.kind);
  const down = kinds.some(
    (kind) => kind.startsWith("service-") || kind === "health-failed"
  );
  if (down)
    return `The Flow Arts Knowledge MCP server is ${still ? "still down" : "down"}`;
  if (kinds.includes("crashing"))
    return `The Flow Arts Knowledge MCP server ${still ? "is still crashing" : "keeps crashing"}`;
  return `claude.ai ${still ? "still cannot" : "cannot"} reach the Flow Arts Knowledge MCP`;
}

/** "45 min", "2 h 15 min", "3 days 4 h". */
export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} days ${rest} h` : `${days} days`;
}

function formatWhen(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * What to show for a decideAlert result: { title, lines, attribution,
 * persistent }. Problem notifications stay on screen until dismissed; the
 * recovery one does not.
 */
export function alertToast(
  { notify, state },
  report,
  { previous = null, lastError = null, now }
) {
  if (notify === "recovered") {
    const since = Date.parse(previous?.since);
    return {
      title: "The Flow Arts Knowledge MCP works again",
      lines: [
        Number.isNaN(since)
          ? "Its checks pass again."
          : `It was down for ${formatDuration(now.getTime() - since)}.`,
      ],
      attribution: null,
      persistent: false,
    };
  }
  const [first, second] = report.problems;
  return {
    title: headline(report.problems, notify === "reminder"),
    lines: [
      first?.message,
      lastError ? `Last error: ${lastError}` : second?.message,
    ].filter(Boolean),
    attribution: `Since ${formatWhen(new Date(state.since))}. Details: npm run verify:mcp-service`,
    persistent: true,
  };
}

function escapeXml(text) {
  return (
    String(text)
      // XML 1.0 forbids most control characters, and a log line can hold them.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

/**
 * Toast XML for Windows. The reminder scenario keeps a problem on screen
 * until Austen dismisses it, and it needs at least one button to do that.
 */
export function toastXml({ title, lines = [], attribution, persistent }) {
  const texts = [title, ...lines.slice(0, 2)]
    .map((text) => `<text>${escapeXml(text)}</text>`)
    .join("");
  const credit = attribution
    ? `<text placement="attribution">${escapeXml(attribution)}</text>`
    : "";
  const visual = `<visual><binding template="ToastGeneric">${texts}${credit}</binding></visual>`;
  return persistent
    ? `<toast scenario="reminder">${visual}<actions><action content="Dismiss" arguments="dismiss" activationType="system"/></actions></toast>`
    : `<toast>${visual}</toast>`;
}
