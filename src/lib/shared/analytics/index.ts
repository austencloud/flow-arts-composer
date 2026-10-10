/**
 * Performance Analytics - A+ Performance Utilities
 *
 * 🚀 Unified export for all performance monitoring tools.
 *
 * Available in development:
 * - Web Vitals tracking (CLS, FCP, INP, LCP, TTFB)
 * - Memory profiling (heap tracking, leak detection)
 * - Runtime monitoring (FPS, long tasks, layout shifts)
 * - Performance budget checking
 *
 * All utilities are tree-shakeable and only active in development.
 *
 * Quick start:
 *   import { initPerformanceMonitoring } from '#lib/shared/analytics/index.js';
 *   initPerformanceMonitoring();
 *
 * Console access (dev only):
 *   window.memoryProfiler.report()
 *   window.runtimeMonitor.report()
 *   window.budgetChecker.report()
 */

export { initWebVitals } from "./web-vitals";
export { memoryProfiler } from "./memory-profiler";
export { runtimeMonitor } from "./runtime-monitor";
export {
  budgetChecker,
  DEFAULT_BUDGET,
  type PerformanceBudget,
} from "./performance-budget";

/**
 * Initialize all performance monitoring in development
 */
export async function initPerformanceMonitoring(): Promise<void> {
  if (typeof window === "undefined") return;

  // Only in development
  const isDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (!isDev) return;

  // Web Vitals
  const { initWebVitals } = await import("./web-vitals");
  await initWebVitals();

  // Memory Profiler
  const { memoryProfiler } = await import("./memory-profiler");
  memoryProfiler.takeSnapshot("init");

  // Runtime Monitor
  const { runtimeMonitor } = await import("./runtime-monitor");
  runtimeMonitor.start();
}
