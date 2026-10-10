import { describe, expect, it } from "vitest";
import type { ParityAuditNotification } from "#lib/shared/feedback/domain/models/notification-models.js";
import { formatParityAuditAgentBrief } from "#lib/features/admin/domain/parity-audit-agent-brief.js";

function notification(
  overrides: Partial<ParityAuditNotification> = {}
): ParityAuditNotification {
  return {
    id: "audit-alert-1",
    type: "admin-parity-audit",
    message: "Parity audit found data mismatches.",
    createdAt: new Date("2026-08-08T09:33:40.971Z"),
    read: false,
    auditStatus: "violations",
    actionUrl: "/admin/parity-audit?notification=audit-alert-1",
    reportFile: "parity-audit-2026-08-08T09-33-40-971Z.json",
    reportGeneratedAt: "2026-08-08T09:33:40.971Z",
    auditReconcileCount: 1,
    auditShortcodeCount: 0,
    auditViolations: [
      {
        source: "reconcile",
        id: "public-sequence-1",
        ownerId: "deleted-owner",
        classification: "ORPHAN_PUBLIC",
        detail: "Owner document is missing.",
        changedKeys: ["ownerId"],
      },
    ],
    ...overrides,
  };
}

describe("parity audit agent brief", () => {
  it("preserves the complete incident and required verification command", () => {
    const brief = formatParityAuditAgentBrief(notification());

    expect(brief).toContain("Investigate and repair 1 parity mismatch.");
    expect(brief).toContain(
      "TKA_ADMIN=1 pnpm exec tsx scripts/diagnostics/audit-sequence-public-parity.ts"
    );
    expect(brief).toContain('"classification": "ORPHAN_PUBLIC"');
    expect(brief).toContain('"ownerId": "deleted-owner"');
    expect(brief).toContain(
      '"sourceReport": "parity-audit-2026-08-08T09-33-40-971Z.json"'
    );
  });

  it("gives a failed audit a diagnosis task and includes its error", () => {
    const brief = formatParityAuditAgentBrief(
      notification({
        auditStatus: "failed",
        auditError: "Firestore deadline exceeded",
        auditReconcileCount: 0,
        auditViolations: [],
      })
    );

    expect(brief).toContain("Diagnose the failed parity audit");
    expect(brief).toContain('"error": "Firestore deadline exceeded"');
  });
});
