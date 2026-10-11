/**
 * Memory Profiler - A+ Performance Utility
 *
 * 🚀 PERFORMANCE: Track memory usage and detect leaks in development.
 * Uses Performance API memory metrics when available.
 *
 * Usage:
 *   import { memoryProfiler } from '#lib/shared/analytics/memory-profiler.js';
 *   memoryProfiler.startTracking();
 *   memoryProfiler.takeSnapshot('after-mount');
 *   memoryProfiler.report();
 */

interface MemorySnapshot {
  timestamp: number;
  label: string;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface MemoryReport {
  snapshots: MemorySnapshot[];
  peakUsage: number;
  averageUsage: number;
  leakWarnings: string[];
}

class MemoryProfiler {
  private snapshots: MemorySnapshot[] = [];
  private trackingInterval: ReturnType<typeof setInterval> | null = null;
  private isEnabled = false;

  /**
   * Check if memory API is available (Chrome/Edge only)
   */
  private get hasMemoryAPI(): boolean {
    return (
      typeof window !== "undefined" &&
      "performance" in window &&
      "memory" in (performance as unknown as { memory?: unknown })
    );
  }

  private getCurrentMemory(): Omit<
    MemorySnapshot,
    "timestamp" | "label"
  > | null {
    if (!this.hasMemoryAPI) return null;

    const memory = (
      performance as unknown as {
        memory: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      }
    ).memory;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Enable memory profiling (dev only)
   */
  enable(): void {
    if (typeof window === "undefined") return;
    if (
      !window.location.hostname.includes("localhost") &&
      !window.location.hostname.includes("127.0.0.1")
    ) {
      return;
    }
    this.isEnabled = true;
  }

  /**
   * Take a memory snapshot with a label
   */
  takeSnapshot(label: string): void {
    if (!this.isEnabled) return;

    const memory = this.getCurrentMemory();
    if (!memory) {
      console.warn(
        "🧠 [Memory Profiler] Memory API not available (Chrome/Edge only)"
      );
      return;
    }

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      label,
      ...memory,
    };

    this.snapshots.push(snapshot);
  }

  /**
   * Start automatic memory tracking at intervals
   */
  startTracking(intervalMs = 10000): void {
    if (!this.isEnabled) return;
    if (this.trackingInterval) return;

    this.takeSnapshot("tracking-start");

    this.trackingInterval = setInterval(() => {
      this.takeSnapshot(`auto-${Date.now()}`);
    }, intervalMs);
  }

  /**
   * Stop automatic tracking
   */
  stopTracking(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  /**
   * Analyze snapshots for potential memory leaks
   */
  private detectLeaks(): string[] {
    const warnings: string[] = [];

    if (this.snapshots.length < 3) return warnings;

    // Check for continuous growth pattern
    const recentSnapshots = this.snapshots.slice(-5);
    let growthCount = 0;

    for (let i = 1; i < recentSnapshots.length; i++) {
      const current = recentSnapshots[i];
      const previous = recentSnapshots[i - 1];
      if (
        current &&
        previous &&
        current.usedJSHeapSize > previous.usedJSHeapSize
      ) {
        growthCount++;
      }
    }

    if (growthCount === recentSnapshots.length - 1) {
      warnings.push("⚠️ Continuous memory growth detected - possible leak");
    }

    // Check if exceeding 80% of heap limit
    const latest = this.snapshots[this.snapshots.length - 1];
    if (latest) {
      const usagePercent =
        (latest.usedJSHeapSize / latest.jsHeapSizeLimit) * 100;

      if (usagePercent > 80) {
        warnings.push(
          `⚠️ High memory usage: ${usagePercent.toFixed(1)}% of heap limit`
        );
      }
    }

    return warnings;
  }

  /**
   * Generate a memory report
   */
  report(): MemoryReport | null {
    if (!this.isEnabled || this.snapshots.length === 0) {
      return null;
    }

    const usages = this.snapshots.map((s) => s.usedJSHeapSize);
    const peakUsage = Math.max(...usages);
    const averageUsage = usages.reduce((a, b) => a + b, 0) / usages.length;
    const leakWarnings = this.detectLeaks();

    const report: MemoryReport = {
      snapshots: this.snapshots,
      peakUsage,
      averageUsage,
      leakWarnings,
    };

    return report;
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots = [];
  }

  /**
   * Get current heap usage percentage
   */
  getHeapUsagePercent(): number | null {
    const memory = this.getCurrentMemory();
    if (!memory) return null;
    return (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
  }
}

// Singleton instance
export const memoryProfiler = new MemoryProfiler();

// Auto-enable in development
if (typeof window !== "undefined") {
  memoryProfiler.enable();

  // Expose to window for debugging
  (window as unknown as { memoryProfiler: MemoryProfiler }).memoryProfiler =
    memoryProfiler;
}
