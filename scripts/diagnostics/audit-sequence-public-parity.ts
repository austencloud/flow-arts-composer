/**
 * Scheduled read-only parity audit (parity-repair spec, phase 5).
 *
 * Runs BOTH existing classification engines in dry-run — the corpus
 * reconcile (owner/public/claim parity) and the shortcode label backfill
 * (payload-label parity) — and compares their verdicts against a committed
 * baseline of known, human-acknowledged quarantine. The spec's rule: never
 * build a second scanner with different definitions — this wrapper only
 * orchestrates the engines the migrations themselves used.
 *
 * Actionable drift =
 *   - ANY reconcile classification other than IN_SYNC (the corpus converged
 *     466/466 on 2026-07-27; there is no acceptable non-IN_SYNC state), or
 *   - a shortcode classified anything but a current class
 *     (CURRENT_SHORTCODE_CLASSES in scripts/migrations/lib/shortcode-payload-kinds.ts)
 *     that is NOT in the baseline, or whose class CHANGED from its baselined
 *     class.
 *
 * Baselined records that become a current class are reported as improvements,
 * not violations (a source may be restored, or a human review may repair
 * them) — regenerate the baseline after intentional repairs.
 *
 * Output: human summary + machine-readable JSON in
 * scripts/migrations/backups/parity-audit-*.json. Exit 0 = clean,
 * 2 = actionable drift, 1 = the audit itself failed to run.
 *
 * --alert: on drift OR audit failure, write an in-app notification to every
 * admin (users/{uid}/notifications) — the deployed onNewNotification
 * function pushes it to their devices (unknown types default to sending).
 * The audit never mutates production otherwise; repair remains an explicit
 * Admin operation with a manifest.
 *
 *   TKA_ADMIN=1 npx tsx scripts/diagnostics/audit-sequence-public-parity.ts [--alert]
 *
 * Scheduled daily via Windows Task Scheduler ("TKA Parity Audit"); run it
 * manually after every migration.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { initFirestore } from "../lib/firestore-provider.js";
import {
  formatParityAuditMessage,
  isParityAuditReportFilename,
  parityAuditFingerprint,
  toParityAuditViolation,
} from "./parity-audit-alert";
import { isCurrentShortcodeClass } from "../migrations/lib/shortcode-payload-kinds";
import type { ParityAuditViolation } from "../../src/lib/shared/feedback/domain/models/notification-models";

type AnyRec = Record<string, unknown>;

const ALERT = process.argv.includes("--alert");
// Both engines write their manifests relative to the repo root, so this
// script must run from there (the scheduled task cd's first).
const REPO_ROOT = process.cwd();
const BASELINE_PATH = join(
  REPO_ROOT,
  "scripts",
  "diagnostics",
  "parity-audit-baseline.json"
);
if (!existsSync(join(REPO_ROOT, "scripts", "migrations"))) {
  throw new Error(`run from the repo root (cwd: ${REPO_ROOT})`);
}

interface EngineResult {
  counts: Record<string, number>;
  results: Array<{
    code?: string;
    id?: string;
    cls?: string;
    classification?: string;
    [key: string]: unknown;
  }>;
  manifestPath: string;
}

interface ParityAuditReport {
  generatedAt: string;
  reconcile: {
    counts: Record<string, number>;
    manifest: string;
    actionable: EngineResult["results"];
  };
  shortcodes: {
    counts: Record<string, number>;
    manifest: string;
    actionable: EngineResult["results"];
    improvedFromBaseline: string[];
  };
  actionableTotal: number;
}

function runEngine(script: string, label: string): EngineResult {
  const out = execSync(`npx tsx ${script}`, {
    cwd: REPO_ROOT,
    env: { ...process.env, TKA_ADMIN: "1" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const match = out.match(/manifest:\s*(\S+)/);
  if (!match) throw new Error(`${label}: no manifest path in engine output`);
  const manifestPath = resolve(REPO_ROOT, match[1]!);
  // The shortcode engine writes its rows under `results`, the reconcile
  // engine under `records` — accept either.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    counts: Record<string, number>;
    results?: EngineResult["results"];
    records?: EngineResult["results"];
  };
  const rows = manifest.results ?? manifest.records;
  if (!rows)
    throw new Error(`${label}: manifest has neither results nor records`);
  return { counts: manifest.counts, results: rows, manifestPath };
}

interface AuditAlert {
  message: string;
  auditStatus: "violations" | "failed";
  reportFile?: string;
  reportGeneratedAt?: string;
  auditReconcileCount: number;
  auditShortcodeCount: number;
  auditViolations: ParityAuditViolation[];
  auditError?: string;
}

function readLatestReport(): ParityAuditReport | null {
  const directory = join(REPO_ROOT, "scripts", "migrations", "backups");
  const latest = readdirSync(directory)
    .filter(isParityAuditReportFilename)
    .sort()
    .at(-1);
  if (!latest) return null;
  try {
    return JSON.parse(
      readFileSync(join(directory, latest), "utf8")
    ) as ParityAuditReport;
  } catch (error) {
    console.warn(`could not read previous parity report ${latest}:`, error);
    return null;
  }
}

async function alertAdmins(alert: AuditAlert): Promise<void> {
  const { db, FieldValue, isAdmin } = (await initFirestore()) as AnyRec & {
    db: AnyRec;
    FieldValue: { serverTimestamp(): unknown };
    isAdmin: boolean;
  };
  if (!isAdmin) throw new Error("alerting requires TKA_ADMIN=1");
  const admins = (await (
    (db.collection as (p: string) => AnyRec)("users")["where" as never] as (
      f: string,
      op: string,
      v: string
    ) => { get(): Promise<AnyRec> }
  )("role", "==", "admin").get()) as {
    docs: Array<{
      id: string;
      ref: {
        collection(p: string): {
          doc(): {
            id: string;
            set(d: AnyRec): Promise<unknown>;
          };
        };
      };
    }>;
  };
  for (const adminDoc of admins.docs) {
    const notificationRef = adminDoc.ref.collection("notifications").doc();
    await notificationRef.set({
      userId: adminDoc.id,
      type: "admin-parity-audit",
      ...alert,
      actionUrl: `/admin/parity-audit?notification=${encodeURIComponent(notificationRef.id)}`,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });
  }
  console.log(`alerted ${admins.docs.length} admin(s)`);
}

async function main(): Promise<void> {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
    quarantined: Record<string, string>;
  };

  const reconcile = runEngine(
    "scripts/migrations/reconcile-sequence-public-projections.ts",
    "reconcile"
  );
  const shortcodes = runEngine(
    "scripts/migrations/backfill-shortcode-words.ts",
    "shortcodes"
  );

  const reconcileActionable = reconcile.results.filter(
    (r) => (r.classification ?? r.cls) !== "IN_SYNC"
  );
  const shortcodeActionable = shortcodes.results.filter((r) => {
    const cls = r.cls ?? r.classification ?? "";
    if (isCurrentShortcodeClass(cls)) return false;
    const code = r.code ?? "";
    return baseline.quarantined[code] !== cls;
  });
  const improved = Object.keys(baseline.quarantined).filter((code) =>
    shortcodes.results.some(
      (r) => r.code === code && isCurrentShortcodeClass(r.cls ?? "")
    )
  );

  const actionableTotal =
    reconcileActionable.length + shortcodeActionable.length;
  const previousReport = readLatestReport();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(
    REPO_ROOT,
    "scripts",
    "migrations",
    "backups",
    `parity-audit-${stamp}.json`
  );
  const report: ParityAuditReport = {
    generatedAt: new Date().toISOString(),
    reconcile: {
      counts: reconcile.counts,
      manifest: reconcile.manifestPath,
      actionable: reconcileActionable,
    },
    shortcodes: {
      counts: shortcodes.counts,
      manifest: shortcodes.manifestPath,
      actionable: shortcodeActionable,
      improvedFromBaseline: improved,
    },
    actionableTotal,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("════ PARITY AUDIT ════");
  console.log(`reconcile:  ${JSON.stringify(reconcile.counts)}`);
  console.log(`shortcodes: ${JSON.stringify(shortcodes.counts)}`);
  if (improved.length > 0) {
    console.log(
      `improved from baseline (regenerate after review): ${improved.join(", ")}`
    );
  }
  console.log(`actionable violations: ${actionableTotal}`);
  console.log(`report: ${reportPath}`);

  if (actionableTotal > 0) {
    for (const r of [...reconcileActionable, ...shortcodeActionable].slice(
      0,
      20
    )) {
      console.log(`  ⚠️  ${JSON.stringify(r)}`);
    }
    if (ALERT) {
      const fingerprint = parityAuditFingerprint(
        reconcileActionable,
        shortcodeActionable
      );
      const previousFingerprint = previousReport
        ? parityAuditFingerprint(
            previousReport.reconcile.actionable,
            previousReport.shortcodes.actionable
          )
        : null;
      if (fingerprint === previousFingerprint) {
        console.log(
          "unchanged violation set; duplicate admin alert suppressed"
        );
      } else {
        await alertAdmins({
          message: formatParityAuditMessage(
            reconcileActionable.length,
            shortcodeActionable.length
          ),
          auditStatus: "violations",
          reportFile: `parity-audit-${stamp}.json`,
          reportGeneratedAt: report.generatedAt,
          auditReconcileCount: reconcileActionable.length,
          auditShortcodeCount: shortcodeActionable.length,
          auditViolations: [
            ...reconcileActionable.map((record) =>
              toParityAuditViolation("reconcile", record)
            ),
            ...shortcodeActionable.map((record) =>
              toParityAuditViolation("shortcode", record)
            ),
          ],
        });
      }
    }
    process.exit(2);
  }
  process.exit(0);
}

main().catch(async (e) => {
  console.error("parity audit FAILED to run:", e);
  if (ALERT) {
    try {
      const auditError = String(e instanceof Error ? e.message : e).slice(
        0,
        200
      );
      await alertAdmins({
        message: `Parity audit could not finish: ${auditError}`,
        auditStatus: "failed",
        auditReconcileCount: 0,
        auditShortcodeCount: 0,
        auditViolations: [],
        auditError,
      });
    } catch (alertError) {
      console.error("…and alerting failed too:", alertError);
    }
  }
  process.exit(1);
});
