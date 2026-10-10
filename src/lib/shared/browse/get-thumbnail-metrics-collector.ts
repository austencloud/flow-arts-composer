import { browser } from "$app/env";
import { ThumbnailMetricsCollector } from "./services/thumbnail-metrics-collector";
import {
  installThumbnailAnalyticsSession,
  type ThumbnailAnalyticsSession,
} from "#lib/shared/analytics/thumbnail-analytics.js";

let instance: ThumbnailMetricsCollector | null = null;
let analyticsSession: ThumbnailAnalyticsSession | null = null;

export function getThumbnailMetricsCollector(): ThumbnailMetricsCollector {
  if (!browser)
    throw new Error("getThumbnailMetricsCollector() is browser-only");
  if (!instance) {
    instance = new ThumbnailMetricsCollector();
    analyticsSession = installThumbnailAnalyticsSession(() =>
      instance!.getSummary()
    );
    if (import.meta.env.DEV) {
      instance.startLogging();
    }
  }
  return instance;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    analyticsSession?.dispose();
    analyticsSession = null;
  });
}
