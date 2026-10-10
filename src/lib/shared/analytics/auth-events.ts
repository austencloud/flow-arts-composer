/**
 * One auth funnel shared by every account entry surface.
 *
 * The provider forms are reused across the marketing modal, in-app guest
 * nudges, the navigation sheet, Settings, and the festival start page. The
 * current encounter lives here so those forms can attach the surface that
 * opened them without threading analytics props through the component tree.
 */

import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";

export type AuthCta = "header_desktop_signin" | "header_mobile_signin";
export type AuthSurface =
  | "marketing_header_modal"
  | "guest_nudge_modal"
  | "auth_sheet"
  | "settings_profile"
  | "festival_start";

export type AuthMethod =
  | "google"
  | "google_one_tap"
  | "facebook"
  | "instagram"
  | "magic_link"
  | "password";
export type AuthMode = "signin" | "signup";
export type AuthDismiss = "close_button" | "backdrop_or_escape" | "unmounted";
export type AuthProviderOutcome =
  | "accepted"
  | "completed"
  | "failed"
  | "interrupted";

export interface AuthEncounter {
  surface: AuthSurface;
  origin: string;
  page?: string;
  auth_mode?: AuthMode;
  cta?: AuthCta;
}

let encounter: AuthEncounter | null = null;

export function isAuthFunnelArmed(): boolean {
  return encounter !== null;
}

export function getAuthEncounterProperties(): Record<string, string> {
  return encounter ? { ...encounter } : {};
}

export function disarmAuthFunnel(): void {
  encounter = null;
}

export function trackAuthSurfaceOpened(next: AuthEncounter): void {
  encounter = next;
  captureWhenReady("auth_modal_opened", { ...next });
}

/** Preserve the established SiteHeader call shape and event trend. */
export function trackAuthModalOpened(page: string, cta: AuthCta): void {
  trackAuthSurfaceOpened({
    surface: "marketing_header_modal",
    origin: cta,
    page,
    cta,
    auth_mode: "signin",
  });
}

export function trackAuthModalSubmitted(
  method: AuthMethod,
  authMode?: AuthMode
): void {
  if (!encounter) return;
  if (authMode) encounter = { ...encounter, auth_mode: authMode };
  captureWhenReady("auth_modal_submitted", {
    ...encounter,
    method,
  });
}

export function trackAuthProviderResult(
  method: AuthMethod,
  outcome: AuthProviderOutcome,
  failureCode?: string
): void {
  if (!encounter) return;
  const properties = {
    ...encounter,
    method,
    outcome,
    ...(failureCode ? { failure_code: failureCode.slice(0, 80) } : {}),
  };
  captureWhenReady("auth_provider_result", properties);
  if (outcome === "completed") {
    captureWhenReady("auth_modal_completed", properties);
  }
}

export function trackAuthAlternativeSelected(alternative: string): void {
  if (!encounter) return;
  captureWhenReady("auth_alternative_selected", {
    ...encounter,
    alternative,
  });
}

export function trackAuthModalAbandoned(dismiss: AuthDismiss): void {
  if (!encounter) return;
  captureWhenReady("auth_modal_abandoned", { ...encounter, dismiss });
}
