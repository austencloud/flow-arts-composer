/**
 * Shared emulator harness for the read-only authorization audit
 * (docs/reports/opus-batch-2026-09-12/security-rules-audit.md).
 *
 * These probes are ISOLATED from tests/integration/firestore-rules/: they own
 * their own vitest config and never edit firestore.rules or storage.rules. The
 * audit is read-only on production code — every finding is proven by an
 * emulator request, not by reading the rules and guessing.
 *
 * Repro tests that demonstrate an OPEN finding are quarantined behind
 * AUDIT_RUN_REPROS=1 so the default run stays green (see `repro` below). Run
 * them with the flag to reproduce the red evidence quoted in the report.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

export const PROJECT_ID = "the-kinetic-alphabet";

/** Victim: a full (password) account that owns the content under attack. */
export const VICTIM_UID = "audit-victim-full";
/** Attacker with a permanent credential — passes every isFullUser() gate. */
export const ATTACKER_UID = "audit-attacker-full";
/** Attacker with an anonymous credential — passes isAuthenticated() only. */
export const ANON_UID = "audit-attacker-anon";
export const ADMIN_UID = "audit-admin";
export const THIRD_PARTY_UID = "audit-third-party";

/**
 * Long polling is load-bearing, not a preference: over gRPC/WebChannel the
 * emulator write stream corrupts on this setup, which wedges the shared
 * emulator process and makes writes in LATER test files silently fail to land.
 * Copied deliberately from tests/integration/firestore-rules/.
 */
export const SDK_SETTINGS = { experimentalForceLongPolling: true } as const;

/**
 * Quarantine gate for red repro tests. A repro asserts the SAFE behavior
 * (assertFails on a cross-tenant write), so it is RED while the finding is
 * open. Default runs skip it; AUDIT_RUN_REPROS=1 runs it to capture evidence.
 */
export const repro = process.env.AUDIT_RUN_REPROS === "1" ? it : it.skip;

export async function createTestEnv(): Promise<RulesTestEnvironment> {
  const repoRoot = resolve(__dirname, "../..");
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(repoRoot, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync(resolve(repoRoot, "storage.rules"), "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
}

type Ctx = ReturnType<RulesTestEnvironment["authenticatedContext"]>;

/** A guest session: anonymous provider, so isFullUser() is false. */
export function anonCtx(env: RulesTestEnvironment, uid = ANON_UID): Ctx {
  return env.authenticatedContext(uid, {
    firebase: { sign_in_provider: "anonymous" },
  });
}

/** A real account: password provider, so isFullUser() is true. */
export function fullCtx(env: RulesTestEnvironment, uid: string): Ctx {
  return env.authenticatedContext(uid, {
    firebase: { sign_in_provider: "password" },
  });
}

/** An admin: every claim shape isAdmin() accepts. */
export function adminCtx(env: RulesTestEnvironment): Ctx {
  return env.authenticatedContext(ADMIN_UID, {
    firebase: { sign_in_provider: "password" },
    role: "admin",
    admin: true,
    isAdmin: true,
  });
}
