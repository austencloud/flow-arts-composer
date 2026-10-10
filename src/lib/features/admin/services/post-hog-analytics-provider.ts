/**
 * PostHog Analytics Provider
 *
 * Reports whether the client-side PostHog instance is initialized. The admin
 * dashboard builds its own PostHog links and reads metrics from cached system
 * state, so no query surface lives here.
 */

import { browser } from "$app/env";
import { getPostHogInstance } from "#lib/shared/analytics/services/posthog.js";

export class PostHogAnalyticsProvider {
  /**
   * Check if PostHog is initialized and available
   */
  isAvailable(): boolean {
    if (!browser) return false;
    const posthog = getPostHogInstance();
    return posthog !== null;
  }
}
