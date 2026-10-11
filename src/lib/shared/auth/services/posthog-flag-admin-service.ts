import { browser } from "$app/env";
import type { FeatureId, FeatureFlagConfig, UserFeatureOverrides } from "../domain/models/feature-flag";
import { type UserRole, hasRolePrivilege } from "../domain/models/user-role";
import { authedFetch } from "./authed-fetch";
import { reloadFeatureFlags, setUserProperties } from "../../analytics/services/posthog";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type { GlobalFeatureFlagPersister } from "./global-feature-flag-persister";
import type { UserFeatureFlagPersister } from "./user-feature-flag-persister";

export interface FlagUpdateResult {
  action: "created" | "updated" | "role_updated";
  flagKey: string;
  flagId?: number;
  note?: string;
  dashboardUrl?: string;
}

function featureIdToPostHogKey(featureId: FeatureId): string {
  return featureId.replace(/:/g, "-");
}

export interface FlagAdminState {
  userId: string | null;
  userRole: UserRole;
  globalFlagOverrides: Record<string, boolean>;
  globalRoleOverrides: Record<string, UserRole>;
  flagsVersion: number;
  userOverrides: UserFeatureOverrides;
}

export function createPostHogFlagAdminService(
  getState: () => FlagAdminState,
  setState: (patch: Partial<FlagAdminState>) => void,
  globalFlagPersister: GlobalFeatureFlagPersister,
  userFlagPersister: UserFeatureFlagPersister,
  getSelfInitiatedSaveTimestamp: () => number,
  setSelfInitiatedSaveTimestamp: (ts: number) => void
) {
  return {
    async updateGlobalFeatureFlag(
      featureId: FeatureId,
      updates: Partial<FeatureFlagConfig>
    ): Promise<FlagUpdateResult> {
      if (!browser) {
        return { action: "updated", flagKey: featureIdToPostHogKey(featureId) };
      }

      const state = getState();
      const flagKey = featureIdToPostHogKey(featureId);

      if (updates.minimumRole) {
        const newRoleOverrides = { ...state.globalRoleOverrides, [flagKey]: updates.minimumRole };
        setState({ globalRoleOverrides: newRoleOverrides, flagsVersion: state.flagsVersion + 1 });

        setSelfInitiatedSaveTimestamp(Date.now());
        globalFlagPersister.save({
          globalFlagOverrides: state.globalFlagOverrides,
          globalRoleOverrides: newRoleOverrides,
        }).catch((err) => {
          console.error(`[PostHogFeatureFlagService] Failed to persist role override:`, err);
          toast.error("Failed to save role change. Other users won't see this update.");
        });
        if (typeof updates.enabled !== "boolean") {
          return { action: "role_updated", flagKey };
        }
      }

      // Handle enabled updates via PostHog API
      if (typeof updates.enabled === "boolean") {
        const currentState = getState();
        const previousValue = currentState.globalFlagOverrides[flagKey];

        // Optimistic update
        const newFlagOverrides = { ...currentState.globalFlagOverrides, [flagKey]: updates.enabled };
        setState({ globalFlagOverrides: newFlagOverrides, flagsVersion: currentState.flagsVersion + 1 });

        setSelfInitiatedSaveTimestamp(Date.now());
        globalFlagPersister.save({
          globalFlagOverrides: newFlagOverrides,
          globalRoleOverrides: currentState.globalRoleOverrides,
        }).catch((err) => {
          console.error(`[PostHogFeatureFlagService] Failed to persist flag override:`, err);
          toast.error("Failed to save flag change. Other users won't see this update.");
        });

        try {
          const response = await authedFetch("/api/admin/feature-flags", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flagKey, enabled: updates.enabled }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const detail = errorData.detail ? ` - ${errorData.detail}` : "";
            const reason =
              errorData.firebaseCode === "auth/id-token-expired" || response.status === 401
                ? "Session expired. Sign in again."
                : errorData.message || `HTTP ${response.status}`;
            throw new Error(reason + detail);
          }

          const result = await response.json();
          reloadFeatureFlags();

          let dashboardUrl: string | undefined;
          if (result.flag?.id) {
            dashboardUrl = `https://us.posthog.com/project/${result.projectId || "unknown"}/feature_flags/${result.flag.id}`;
          }

          return {
            action: result.action as "created" | "updated",
            flagKey,
            flagId: result.flag?.id,
            note: result.note,
            dashboardUrl,
          };
        } catch (err) {
          // Rollback
          console.error(`[PostHogFeatureFlagService] Failed to update ${flagKey}, rolling back:`, err);
          const rollbackState = getState();

          if (previousValue !== undefined) {
            setState({ globalFlagOverrides: { ...rollbackState.globalFlagOverrides, [flagKey]: previousValue }, flagsVersion: rollbackState.flagsVersion + 1 });
          } else {
            const { [flagKey]: _, ...rest } = rollbackState.globalFlagOverrides;
            setState({ globalFlagOverrides: rest, flagsVersion: rollbackState.flagsVersion + 1 });
          }
          globalFlagPersister.save({
            globalFlagOverrides: getState().globalFlagOverrides,
            globalRoleOverrides: getState().globalRoleOverrides,
          }).catch(() => { /* rollback best-effort */ });

          throw err;
        }
      }

      return { action: "updated", flagKey };
    },

    async setUserFeatureOverrides(
      targetUserId: string,
      overrides: UserFeatureOverrides
    ): Promise<void> {
      const state = getState();
      if (targetUserId === state.userId) {
        setState({ userOverrides: overrides, flagsVersion: state.flagsVersion + 1 });
      }

      try {
        await userFlagPersister.save(targetUserId, overrides);
      } catch (err) {
        console.error("[PostHogFeatureFlagService] Failed to persist user overrides:", err);
        toast.error("Failed to save feature overrides");
      }
    },

    async setUserRole(targetUserId: string, newRole: UserRole): Promise<void> {
      console.warn(
        "[PostHogFeatureFlagService] setUserRole is deprecated. " +
        "User roles should be managed via Firebase Auth custom claims. " +
        `Attempted to set ${targetUserId} to ${newRole}.`
      );

      const state = getState();
      if (targetUserId === state.userId) {
        setState({ userRole: newRole });
        if (browser) {
          setUserProperties({
            role: newRole,
            is_admin: newRole === "admin",
            is_tester: hasRolePrivilege(newRole, "tester"),
            is_premium: hasRolePrivilege(newRole, "premium"),
          });
          reloadFeatureFlags();
        }
      }
    },

    async logAuditEntry(entry: Record<string, unknown>): Promise<void> {
      if (import.meta.env.DEV) {
        console.debug("[PostHogFeatureFlagService] Audit entry (no-op):", entry);
      }
    },
  };
}
