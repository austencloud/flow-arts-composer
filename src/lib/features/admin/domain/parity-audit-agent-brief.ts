import type { ParityAuditNotification } from "#lib/shared/feedback/domain/models/notification-models.js";

const PARITY_REPAIR_SPEC =
  "docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md";
const FINAL_AUDIT_COMMAND =
  "TKA_ADMIN=1 pnpm exec tsx scripts/diagnostics/audit-sequence-public-parity.ts";

/**
 * Formats the complete incident packet an agent needs to investigate, repair,
 * and verify a parity audit without relying on the scheduler's local report.
 */
export function formatParityAuditAgentBrief(
  notification: ParityAuditNotification
): string {
  const reconcileLabel =
    notification.auditReconcileCount === 1
      ? "sequence projection"
      : "sequence projections";
  const shortcodeLabel =
    notification.auditShortcodeCount === 1 ? "QR code" : "QR codes";
  const total =
    notification.auditReconcileCount + notification.auditShortcodeCount;
  const task =
    notification.auditStatus === "failed"
      ? "Diagnose the failed parity audit, repair the cause, and rerun it to a clean result."
      : `Investigate and repair ${total} parity ${total === 1 ? "mismatch" : "mismatches"}.`;

  const incident = {
    notificationId: notification.id,
    status: notification.auditStatus,
    generatedAt: notification.reportGeneratedAt ?? null,
    sourceReport: notification.reportFile ?? null,
    counts: {
      total,
      reconcile: notification.auditReconcileCount,
      shortcodes: notification.auditShortcodeCount,
    },
    error: notification.auditError ?? null,
    violations: notification.auditViolations,
  };

  return [
    "# Parity audit incident",
    "",
    task,
    "",
    `The audit found ${notification.auditReconcileCount} ${reconcileLabel} and ${notification.auditShortcodeCount} ${shortcodeLabel}.`,
    "",
    "## Repair requirements",
    "",
    `- Follow \`${PARITY_REPAIR_SPEC}\`.`,
    "- Start with a dry run and create a backup before changing production data.",
    "- Use the canonical migration paths. Do not write directly around the repository's behavior owners.",
    "- Do not rewrite an immutable QR payload without proof that the payload itself is wrong.",
    `- Finish by running \`${FINAL_AUDIT_COMMAND}\` and report the final \`actionableTotal\`.`,
    "",
    "## Incident data",
    "",
    "```json",
    JSON.stringify(incident, null, 2),
    "```",
  ].join("\n");
}
