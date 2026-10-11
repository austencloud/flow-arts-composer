/**
 * Boot snapshot — a tiny, synchronously-readable record of the last successful
 * boot. Lets the app skip the auth "Warming up" spinner on warm reloads and
 * (optionally) seed the last-known tier so a signed-in user renders as their
 * real tier instantly instead of flashing guest while Firebase auth reconciles.
 *
 * Pure module: no reactive state, no class. Reads/writes localStorage only.
 * localStorage access is guarded by try/catch for SSR safety (typeof check)
 * and storage-quota errors.
 */
import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
import type { AccessTier } from "#lib/shared/auth/domain/access-tier.js";

export const BOOT_SNAPSHOT_KEY = "tka-boot-snapshot";
export const BOOT_SNAPSHOT_VERSION = 1;

export interface BootSnapshot {
  /** Last-known authenticated uid, or null for guest. */
  uid: string | null;
  /** Last-known role — used to seed optimistic tier (W1b). */
  role: UserRole;
  /** Last-active module id — used to pick the right skeleton on reload. */
  activeModule: string;
  /** Last-known resolved access tier — seeds the optimistic tier on reload. */
  tier: AccessTier;
  /** Schema version; a mismatch means "treat as no snapshot". */
  version: number;
}

export function readBootSnapshot(): BootSnapshot | null {
  try {
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BootSnapshot;
    if (parsed?.version !== BOOT_SNAPSHOT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBootSnapshot(
  snapshot: Omit<BootSnapshot, "version">
): void {
  try {
    localStorage.setItem(
      BOOT_SNAPSHOT_KEY,
      JSON.stringify({ ...snapshot, version: BOOT_SNAPSHOT_VERSION })
    );
  } catch {
    /* storage full / unavailable — non-fatal, boot proceeds without optimism */
  }
}

export function clearBootSnapshot(): void {
  try {
    localStorage.removeItem(BOOT_SNAPSHOT_KEY);
  } catch {
    /* non-fatal */
  }
}
