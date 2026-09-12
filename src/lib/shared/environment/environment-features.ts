/**
 * Environment-based Feature Visibility
 *
 * Controls module visibility based on deployment environment.
 * In production, only released features are shown.
 * In development, all features are available.
 */

import { browser } from "$app/environment";
import type { ModuleId } from "$lib/shared/navigation/domain/types";

/**
 * Check if running in production environment
 */
export function resolveProductionEnvironment(
  isBrowserRuntime: boolean,
  isProductionBuild: boolean,
  publicEnvironment?: string
): boolean {
  if (!isBrowserRuntime) return false;
  return isProductionBuild || publicEnvironment === "production";
}

export function isProduction(): boolean {
  // Production builds must stay production even when an optional deployment
  // label is absent. Otherwise unreleased assets can load and 404 for users.
  return resolveProductionEnvironment(
    browser,
    import.meta.env.PROD,
    import.meta.env.PUBLIC_ENVIRONMENT
  );
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  if (!browser) return false;
  return (
    import.meta.env.PUBLIC_ENVIRONMENT === "development" ||
    import.meta.env.DEV === true
  );
}

/**
 * Check if a module is enabled in the current environment.
 *
 * Production: uses PRODUCTION_MODULES map (code, not env vars)
 * Development: all modules enabled
 */
export function isModuleEnabledInEnvironment(moduleId: ModuleId): boolean {
  if (!browser) return true;
  if (isProduction()) return PRODUCTION_MODULES[moduleId] ?? false;
  return true;
}

/**
 * Debug tools: enabled in development, disabled in production.
 */
export function isDebugToolsEnabled(): boolean {
  if (!browser) return false;
  return isDevelopment();
}

/**
 * Role override: enabled in development, disabled in production.
 */
export function isRoleOverrideEnabled(): boolean {
  if (!browser) return false;
  return isDevelopment();
}

/**
 * Analytics: always enabled.
 */
export function isAnalyticsEnabled(): boolean {
  return true;
}

export function getEnvironmentName(): string {
  if (!browser) return "server";
  return (import.meta.env.PUBLIC_ENVIRONMENT as string) || "development";
}

/**
 * Detect if running in an automated browser environment (Playwright, Puppeteer, etc.)
 *
 * Used to disable features that don't work in automated contexts, like FedCM.
 * FedCM explicitly blocks automated environments for security reasons.
 *
 * Detection methods:
 * 1. navigator.webdriver - Standard WebDriver flag (Playwright, Selenium, Puppeteer)
 * 2. window.__playwright - Playwright-specific marker
 * 3. window.__puppeteer - Puppeteer-specific marker
 */
export function isAutomatedBrowser(): boolean {
  if (!browser) return false;

  // Standard WebDriver flag - set by Playwright, Selenium, Puppeteer in automation mode
  if (navigator.webdriver === true) {
    return true;
  }

  // Playwright-specific markers
  if ("__playwright" in window || "__pw_manual" in window) {
    return true;
  }

  // Puppeteer-specific marker
  if ("__puppeteer" in window) {
    return true;
  }

  return false;
}

/**
 * Module visibility map for production (what's publicly released)
 */
export const PRODUCTION_MODULES: Record<ModuleId, boolean> = {
  create: true,
  browse: true,
  creators: true,
  feedback: true,
  premium: true, // Premium upsell shown to non-premium users
  // Unreleased modules
  learn: false,
  tika: false, // Tika AI tutor (admin-only for now)
  compose: false,
  train: false,
  admin: true, // Production tool; runtime admin-role checks still control access
  settings: true, // Settings always available
  choreo_card: true, // Production tool; module definition keeps it admin-only
  word_card: false, // Legacy alias for choreo_card
  choreo: true, // Choreo sheet builder (saved acts); relit Sep 2026, the role gate opens it to testers
  moderation: false, // Content moderation (admin-only)
  arena: false, // Arena pairwise ranking (unreleased)
  festivals: true, // Festival Hub (admin-only via feature flags)
  retro: false, // Retro module (graduated from Lab)
  levels: false, // Level progression labs (L4-L7 + Poi, graduated from Lab)
  "hand-paths": false, // Hand path explorer + builder (graduated from Lab)
  video: false, // Video analysis, trails, effects (graduated from Lab)
  social: false, // Social module: community map + nearby spinner sync (graduated from Lab)
  museum: false, // The Archive - walkable museum with 2D/3D flip
  "personal-museum": false, // Personal Museum - saved sequences on the walls (WIP, Tasks 11/12 pending)
  stage: false, // Stage choreography - multi-performer formation locomotion (unreleased)
  mandala: false, // Mandala creation, collection, meditation, export (unreleased)
  lab: false, // Experimental features lab (admin-only) - consolidates skewlab, poi-lab, background-builder, landing-preview, ml-training
  toys: false, // Toys - user-facing interactive toys (first toy: Shape Matrix; unreleased)
  shop: true, // Shop - plain link-out to /shop (Choreo Cards store)
};
