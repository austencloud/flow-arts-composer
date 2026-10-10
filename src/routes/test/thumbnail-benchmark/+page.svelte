<script lang="ts">
  /**
   * Thumbnail Benchmark Page
   *
   * Autonomous performance testing for the 4-tier thumbnail caching system.
   * Runs a configurable number of thumbnail requests and outputs metrics.
   *
   * Usage:
   * 1. Navigate to /test/thumbnail-benchmark
   * 2. Click "Run Benchmark" or add ?autorun=true to URL
   * 3. Results are logged to console and displayed on page
   *
   * For CLI automation, use Playwright or puppeteer to:
   * 1. Navigate to /test/thumbnail-benchmark?autorun=true
   * 2. Wait for [data-benchmark-complete] attribute
   * 3. Read results from [data-benchmark-results]
   */
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import { getThumbnailRenderOrchestrator } from "#lib/shared/browse/get-thumbnail-render-orchestrator.js";
  import { deriveKey as deriveThumbnailKey } from "#lib/shared/browse/services/thumbnail-key-deriver.js";
  import { getThumbnailMetricsCollector } from "#lib/shared/browse/get-thumbnail-metrics-collector.js";
  import { getThumbnailLocalCache } from "#lib/shared/browse/get-thumbnail-local-cache.js";
  import { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { ThumbnailRenderOrchestrator } from "#lib/shared/browse/services/thumbnail-render-orchestrator.js";
  import type { ThumbnailRenderInput } from "#lib/shared/browse/services/thumbnail-key-deriver.js";
  import type { ThumbnailMetricsSummary } from "#lib/shared/browse/services/thumbnail-metrics-collector.js";
  import type { ThumbnailRequestMetrics } from "#lib/shared/browse/services/thumbnail-metrics-collector.js";
  import type { ThumbnailMetricsCollector } from "#lib/shared/browse/services/thumbnail-metrics-collector.js";
  import type { ThumbnailLocalCache } from "#lib/shared/browse/services/thumbnail-local-cache.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  // Configuration
  const DEFAULT_SEQUENCE_COUNT = 50;
  const DEFAULT_ITERATIONS = 2; // Run twice to test cache hits

  // Benchmark modes
  type BenchmarkMode = "standard" | "visibility-change";
  type BenchmarkDataMode = "full" | "metadata";
  type BenchmarkConcurrency = "1" | "3";

  const MODE_OPTIONS = [
    { value: "standard", label: "Standard" },
    { value: "visibility-change", label: "Visibility changes" },
  ] satisfies Array<{ value: BenchmarkMode; label: string }>;
  const PROP_OPTIONS = [
    { value: PropType.STAFF, label: "Staff" },
    { value: PropType.FAN, label: "Fan" },
    { value: PropType.CLUB, label: "Club" },
    { value: PropType.BUUGENG, label: "Buugeng" },
    { value: PropType.POI, label: "Poi" },
  ];
  const DATA_OPTIONS = [
    { value: "metadata", label: "Metadata" },
    { value: "full", label: "Full data" },
  ] satisfies Array<{ value: BenchmarkDataMode; label: string }>;
  const CONCURRENCY_OPTIONS = [
    { value: "1", label: "1 request" },
    { value: "3", label: "3 requests" },
  ] satisfies Array<{ value: BenchmarkConcurrency; label: string }>;

  // State
  let sequenceCount = $state(DEFAULT_SEQUENCE_COUNT);
  let iterations = $state(DEFAULT_ITERATIONS);
  let clearCacheBetweenIterations = $state(false);
  let benchmarkMode = $state<BenchmarkMode>("standard");
  let propType = $state<PropType>(PropType.STAFF);
  let qrEnabled = $state(false);
  let dataMode = $state<BenchmarkDataMode>("metadata");
  let skipCache = $state(false);
  let requestConcurrency = $state<BenchmarkConcurrency>("3");
  let sequenceIdFilter = $state("");

  // Visibility settings for each iteration (used in visibility-change mode)
  // Tests both overlay changes (TKA/Reversals) AND base layer changes (grid options)
  interface VisibilityConfig {
    showTKA: boolean;
    showReversals: boolean;
    showGrid: boolean;
    handPointVisibility: "all" | "active";
    label: string;
    expectedBehavior: string;
  }

  // 5-iteration test sequence to measure cache behavior under visibility changes
  // NOTE: Thumbnails use CANONICAL visibility for ALL overlay settings
  // ALL visibility toggles should hit cache - thumbnails are always rendered the same way
  const VISIBILITY_TEST_SEQUENCE: VisibilityConfig[] = [
    {
      showTKA: true,
      showReversals: true,
      showGrid: true,
      handPointVisibility: "all",
      label: "Default",
      expectedBehavior: "Cache miss - cold start",
    },
    {
      showTKA: true,
      showReversals: true,
      showGrid: true,
      handPointVisibility: "all",
      label: "Same visibility",
      expectedBehavior: "Cache HIT - warm cache",
    },
    {
      showTKA: false,
      showReversals: true,
      showGrid: true,
      handPointVisibility: "all",
      label: "TKA toggled off",
      expectedBehavior: "Cache HIT - TKA is canonical",
    },
    {
      showTKA: true,
      showReversals: true,
      showGrid: true,
      handPointVisibility: "all",
      label: "TKA restored",
      expectedBehavior: "Cache HIT - same canonical key",
    },
    {
      showTKA: true,
      showReversals: true,
      showGrid: true,
      handPointVisibility: "active",
      label: "Grid hand points changed",
      expectedBehavior: "Cache HIT - hand points are canonical",
    },
  ];
  let isRunning = $state(false);
  let progress = $state({ current: 0, total: 0, phase: "" });
  let results = $state<BenchmarkResults | null>(null);
  let error = $state<string | null>(null);
  let benchmarkComplete = $state(false);

  interface IterationResult {
    iteration: number;
    metrics: ThumbnailMetricsSummary;
    duration: number;
    failures: Array<{
      sequenceId: string | null;
      errorCode: string;
      lastStage: string | null;
      workerEligible: boolean | null;
    }>;
    longestRequests: Array<{
      sequenceId: string | null;
      timeToUrl: number;
      layer: ThumbnailRequestMetrics["layer"];
      lastStage: string | null;
      workerEligible: boolean | null;
    }>;
    workerEligibility: {
      eligible: number;
      ineligible: number;
      unknown: number;
    };
    visibilityConfig?: VisibilityConfig; // Used in visibility-change mode
  }

  interface LongAnimationFrameSummary {
    supported: boolean;
    count: number;
    maxDuration: number;
    totalBlockingDuration: number;
    longestDurations: number[];
  }

  interface VisibilityChangeSummary {
    warmCacheHitRate: number; // Iteration 2 TOTAL cache hit rate (static + local + cloud)
    overlayChangeHitRate: number; // Iteration 3 TOTAL cache hit rate
    originalCacheSurvival: number; // Iteration 4 TOTAL cache hit rate
    gridChangeHitRate: number; // Iteration 5 TOTAL cache hit rate
    overlayChangeFullyInvalidated: boolean; // Was cache completely wiped on TKA toggle?
    gridChangeFullyInvalidated: boolean; // Was cache completely wiped on grid change?
    // Timing metrics to show compositional caching benefit
    coldStartDuration: number; // Iteration 1 duration (ms)
    warmCacheDuration: number; // Iteration 2 duration (ms)
    overlayChangeDuration: number; // Iteration 3 duration (ms)
    originalRestoredDuration: number; // Iteration 4 duration (ms)
    gridChangeDuration: number; // Iteration 5 duration (ms)
  }

  // Helper to calculate total cache hit rate (static + local + cloud)
  function getTotalCacheHitRate(metrics: ThumbnailMetricsSummary): number {
    const cacheHits =
      metrics.byLayer.static + metrics.byLayer.local + metrics.byLayer.cloud;
    const total = metrics.totalRequests;
    return total > 0 ? (cacheHits / total) * 100 : 0;
  }

  interface BenchmarkResults {
    mode: BenchmarkMode;
    sequenceCount: number;
    configuration: {
      prop: PropType;
      qr: boolean;
      data: BenchmarkDataMode;
      skipCache: boolean;
      concurrency: number;
      sequenceId: string | null;
    };
    iterations: IterationResult[];
    longAnimationFrames: LongAnimationFrameSummary;
    summary: {
      firstRunMetrics: ThumbnailMetricsSummary;
      cachedRunMetrics: ThumbnailMetricsSummary | null;
      cacheEffectiveness: number; // % improvement on second run
      avgTimeToDisplay: {
        static: number;
        local: number;
        cloud: number;
        render: number;
      };
      visibilityChange?: VisibilityChangeSummary; // Only in visibility-change mode
    };
    timestamp: string;
  }

  function startLongAnimationFrameObserver(): {
    stop: () => LongAnimationFrameSummary;
  } {
    const unsupported: LongAnimationFrameSummary = {
      supported: false,
      count: 0,
      maxDuration: 0,
      totalBlockingDuration: 0,
      longestDurations: [],
    };
    if (
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")
    ) {
      return { stop: () => unsupported };
    }

    const observedSince = performance.now();
    const frames: Array<{ duration: number; blockingDuration: number }> = [];
    const recordFrames = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        if (entry.startTime < observedSince) continue;
        const frame = entry as PerformanceEntry & {
          blockingDuration?: number;
        };
        frames.push({
          duration: frame.duration,
          blockingDuration: frame.blockingDuration ?? 0,
        });
      }
    };
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        recordFrames(list.getEntries());
      });
      observer.observe({ type: "long-animation-frame", buffered: true });
    } catch {
      return { stop: () => unsupported };
    }

    return {
      stop() {
        if (observer) {
          recordFrames(observer.takeRecords());
        }
        observer?.disconnect();
        observer = null;
        const longestDurations = frames
          .map((frame) => frame.duration)
          .sort((a, b) => b - a)
          .slice(0, 5);
        return {
          supported: true,
          count: frames.length,
          maxDuration: longestDurations[0] ?? 0,
          totalBlockingDuration: frames.reduce(
            (total, frame) => total + frame.blockingDuration,
            0
          ),
          longestDurations,
        };
      },
    };
  }

  // Services
  let orchestrator: ThumbnailRenderOrchestrator | null = null;
  let metricsCollector: ThumbnailMetricsCollector | null = null;
  let localCache: ThumbnailLocalCache | null = null;

  onMount(async () => {
    if (!browser) return;

    // Resolve services
    orchestrator = getThumbnailRenderOrchestrator();
    metricsCollector = getThumbnailMetricsCollector();
    localCache = getThumbnailLocalCache();

    // Check for autorun parameter
    const autorun = page.url.searchParams.get("autorun");
    const count = page.url.searchParams.get("count");
    const iter = page.url.searchParams.get("iterations");
    const clearCache = page.url.searchParams.get("clearCache");
    const requestedProp = page.url.searchParams.get("prop");
    const requestedQr = page.url.searchParams.get("qr");
    const requestedData = page.url.searchParams.get("data");
    const requestedSkipCache = page.url.searchParams.get("skipCache");
    const requestedConcurrency = page.url.searchParams.get("concurrency");
    const requestedSequenceId = page.url.searchParams.get("sequenceId");

    if (count) sequenceCount = parseInt(count, 10) || DEFAULT_SEQUENCE_COUNT;
    if (iter) iterations = parseInt(iter, 10) || DEFAULT_ITERATIONS;
    if (clearCache === "true") clearCacheBetweenIterations = true;
    if (PROP_OPTIONS.some((option) => option.value === requestedProp)) {
      propType = requestedProp as PropType;
    }
    if (requestedQr === "true") qrEnabled = true;
    if (requestedData === "full" || requestedData === "metadata") {
      dataMode = requestedData;
    }
    if (requestedSkipCache === "true") skipCache = true;
    if (requestedConcurrency === "1" || requestedConcurrency === "3") {
      requestConcurrency = requestedConcurrency;
    }
    if (requestedSequenceId) sequenceIdFilter = requestedSequenceId;

    // Check for benchmark mode parameter
    const mode = page.url.searchParams.get("mode");
    if (mode === "visibility") {
      benchmarkMode = "visibility-change";
    }

    if (autorun === "true") {
      // Small delay to ensure DI is fully ready
      await new Promise((r) => setTimeout(r, 500));
      runBenchmark();
    }
  });

  async function runBenchmark() {
    if (isRunning || !orchestrator || !metricsCollector) return;

    isRunning = true;
    error = null;
    results = null;
    benchmarkComplete = false;
    const longFrameObserver = startLongAnimationFrameObserver();
    let longAnimationFrames: LongAnimationFrameSummary | null = null;

    try {
      // Load sequences
      progress = {
        current: 0,
        total: 0,
        phase: "Loading sequences from Firebase...",
      };
      const loader = new PublicSequencesLoader();
      const metadata = await loader.loadSequenceMetadata();

      const filteredMetadata = sequenceIdFilter.trim()
        ? metadata.filter((sequence) => sequence.id === sequenceIdFilter.trim())
        : metadata;
      const sequencesToTest = filteredMetadata.slice(0, sequenceCount);

      let sequences: SequenceData[];
      if (dataMode === "metadata") {
        sequences = sequencesToTest;
      } else {
        sequences = [];
        for (let i = 0; i < sequencesToTest.length; i++) {
          progress = {
            current: i + 1,
            total: sequencesToTest.length,
            phase: `Loading full sequence ${i + 1}/${sequencesToTest.length}`,
          };
          const seq = sequencesToTest[i]!;
          const fullData = await loader.loadFullSequenceData(
            seq.word || seq.name || "",
            seq.id
          );
          if (fullData) {
            sequences.push(fullData);
          }
        }
      }

      if (sequences.length === 0) {
        throw new Error(
          sequenceIdFilter.trim()
            ? `No public sequence matched ${sequenceIdFilter.trim()}`
            : "No sequences loaded"
        );
      }

      console.log(`[Benchmark] Loaded ${sequences.length} sequences`);

      // Run iterations based on mode
      const iterationResults: IterationResult[] = [];
      const iterationConfigs =
        benchmarkMode === "visibility-change"
          ? VISIBILITY_TEST_SEQUENCE
          : Array.from({ length: iterations }, () => undefined);

      // CRITICAL: Clear local cache at START of visibility-change mode
      // This ensures we're measuring cold-start performance, not cached data from previous runs
      if (benchmarkMode === "visibility-change" && localCache) {
        progress = {
          current: 0,
          total: 0,
          phase: "Clearing local cache for fresh visibility test...",
        };
        console.log(
          "[Benchmark] Clearing local cache for visibility-change mode cold start"
        );
        await localCache.clear();
      }

      for (let iter = 0; iter < iterationConfigs.length; iter++) {
        // Reset metrics for this iteration
        metricsCollector.reset();

        const visibilityConfig =
          benchmarkMode === "visibility-change"
            ? VISIBILITY_TEST_SEQUENCE[iter]
            : undefined;

        if (iter > 0 && clearCacheBetweenIterations && localCache) {
          progress = {
            current: 0,
            total: 0,
            phase: `Clearing cache for iteration ${iter + 1}...`,
          };
          await localCache.clear();
        }

        const phaseLabel = visibilityConfig
          ? `Iteration ${iter + 1}: ${visibilityConfig.label}`
          : `Iteration ${iter + 1}/${iterationConfigs.length}`;

        progress = {
          current: 0,
          total: sequences.length,
          phase: phaseLabel,
        };

        const iterStart = performance.now();

        // Match Browse pressure deliberately. The queue remains the authority
        // on active rendering; these workers control how many requests arrive
        // together.
        let nextIndex = 0;
        let completed = 0;
        const runRequestWorker = async () => {
          while (true) {
            const i = nextIndex++;
            const seq = sequences[i];
            if (!seq) return;

            const input: ThumbnailRenderInput = {
              sequenceName: seq.word || seq.name || "",
              sequenceId: seq.id,
              leftPropType: propType,
              rightPropType: propType,
              catDogModeEnabled: false,
              lightMode: false,
              variant: "gallery",
              visibility: {
                ...(visibilityConfig
                  ? {
                      showTKA: visibilityConfig.showTKA,
                      showReversals: visibilityConfig.showReversals,
                      showGrid: visibilityConfig.showGrid,
                      handPointVisibility: visibilityConfig.handPointVisibility,
                    }
                  : {}),
                showQRCode: qrEnabled,
              },
            };

            try {
              const result = await orchestrator!.getThumbnail({
                sequence: seq,
                input,
                priority: i,
                skipCache,
              });
              if (result.error) {
                console.warn(
                  `[Benchmark] Failed public sequence ${seq.id}:`,
                  result.error.message
                );
              }
            } catch (requestError) {
              const message =
                requestError instanceof Error
                  ? requestError.message
                  : String(requestError);
              if (message !== "Cancelled") {
                console.warn(
                  `[Benchmark] Failed public sequence ${seq.id}:`,
                  message
                );
              }
            } finally {
              completed++;
              progress = {
                current: completed,
                total: sequences.length,
                phase: `${phaseLabel} (${completed}/${sequences.length})`,
              };
            }
          }
        };

        await Promise.all(
          Array.from(
            {
              length: Math.min(Number(requestConcurrency), sequences.length),
            },
            () => runRequestWorker()
          )
        );

        const iterDuration = performance.now() - iterStart;
        const metrics = metricsCollector.getSummary();
        const requests = metricsCollector.getCompletedRequests();
        const failures = requests
          .filter(
            (request) => request.layer === "failed" && !request.wasCancelled
          )
          .map((request) => ({
            sequenceId: request.context.sequenceId,
            errorCode: request.errorCode ?? "RENDER_FAILED",
            lastStage: request.lastStage ?? null,
            workerEligible: request.context.workerEligible,
          }));
        const longestRequests = [...requests]
          .sort((a, b) => b.timeToUrl - a.timeToUrl)
          .slice(0, 5)
          .map((request) => ({
            sequenceId: request.context.sequenceId,
            timeToUrl: request.timeToUrl,
            layer: request.layer,
            lastStage: request.lastStage ?? null,
            workerEligible: request.context.workerEligible,
          }));
        const workerEligibility = requests.reduce(
          (summary, request) => {
            if (request.context.workerEligible === true) summary.eligible++;
            else if (request.context.workerEligible === false) {
              summary.ineligible++;
            } else {
              summary.unknown++;
            }
            return summary;
          },
          { eligible: 0, ineligible: 0, unknown: 0 }
        );

        iterationResults.push({
          iteration: iter + 1,
          metrics,
          duration: iterDuration,
          failures,
          longestRequests,
          workerEligibility,
          visibilityConfig,
        });

        console.log(
          `[Benchmark] Iteration ${iter + 1} (${visibilityConfig?.label || "standard"}) complete:`,
          {
            duration: `${iterDuration.toFixed(0)}ms`,
            hitRates: metrics.hitRateByLayer,
            expected: visibilityConfig?.expectedBehavior,
          }
        );
      }

      // Calculate summary
      const firstRun = iterationResults[0]!;
      const cachedRun =
        iterationResults.length > 1 ? iterationResults[1]! : null;

      let cacheEffectiveness = 0;
      if (cachedRun && firstRun.metrics.avgTimeByLayer.render > 0) {
        // Compare average time - cached run should be faster
        const firstAvg = calculateWeightedAvgTime(firstRun.metrics);
        const cachedAvg = calculateWeightedAvgTime(cachedRun.metrics);
        if (firstAvg > 0) {
          cacheEffectiveness = ((firstAvg - cachedAvg) / firstAvg) * 100;
        }
      }

      // Calculate visibility change summary if in visibility-change mode
      let visibilityChangeSummary: VisibilityChangeSummary | undefined;
      if (
        benchmarkMode === "visibility-change" &&
        iterationResults.length >= 5
      ) {
        const coldStart = iterationResults[0]!; // Cold start - fresh cache
        const warmCache = iterationResults[1]!; // Same visibility - should hit cache
        const overlayChange = iterationResults[2]!; // TKA toggled - tests overlay change
        const originalRestored = iterationResults[3]!; // TKA restored - tests cache survival
        const gridChange = iterationResults[4]!; // Grid changed - tests base layer change

        // Calculate TOTAL cache hit rates (static + local + cloud, excluding render/failed)
        const warmCacheTotalHitRate = getTotalCacheHitRate(warmCache.metrics);
        const overlayChangeTotalHitRate = getTotalCacheHitRate(
          overlayChange.metrics
        );
        const originalRestoredTotalHitRate = getTotalCacheHitRate(
          originalRestored.metrics
        );
        const gridChangeTotalHitRate = getTotalCacheHitRate(gridChange.metrics);

        visibilityChangeSummary = {
          warmCacheHitRate: warmCacheTotalHitRate,
          overlayChangeHitRate: overlayChangeTotalHitRate,
          originalCacheSurvival: originalRestoredTotalHitRate,
          gridChangeHitRate: gridChangeTotalHitRate,
          // If total cache hit rate dropped significantly, cache was invalidated
          // (comparing to warm cache rate to account for static cache baseline)
          overlayChangeFullyInvalidated:
            overlayChangeTotalHitRate < warmCacheTotalHitRate - 10,
          gridChangeFullyInvalidated:
            gridChangeTotalHitRate < warmCacheTotalHitRate - 10,
          // Timing metrics
          coldStartDuration: coldStart.duration,
          warmCacheDuration: warmCache.duration,
          overlayChangeDuration: overlayChange.duration,
          originalRestoredDuration: originalRestored.duration,
          gridChangeDuration: gridChange.duration,
        };

        console.log(
          "[Benchmark] Visibility Change Analysis:",
          visibilityChangeSummary
        );
      }

      longAnimationFrames = longFrameObserver.stop();
      results = {
        mode: benchmarkMode,
        sequenceCount: sequences.length,
        configuration: {
          prop: propType,
          qr: qrEnabled,
          data: dataMode,
          skipCache,
          concurrency: Number(requestConcurrency),
          sequenceId: sequenceIdFilter.trim() || null,
        },
        iterations: iterationResults,
        longAnimationFrames,
        summary: {
          firstRunMetrics: firstRun.metrics,
          cachedRunMetrics: cachedRun?.metrics ?? null,
          cacheEffectiveness,
          avgTimeToDisplay: {
            static: firstRun.metrics.avgTimeByLayer.static,
            local: firstRun.metrics.avgTimeByLayer.local,
            cloud: firstRun.metrics.avgTimeByLayer.cloud,
            render: firstRun.metrics.avgTimeByLayer.render,
          },
          visibilityChange: visibilityChangeSummary,
        },
        timestamp: new Date().toISOString(),
      };

      // Log final results
      console.log("[Benchmark] Complete!");
      console.log("[Benchmark] Results:", JSON.stringify(results, null, 2));
      metricsCollector.logNow();

      benchmarkComplete = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error("[Benchmark] Error:", err);
    } finally {
      if (!longAnimationFrames) {
        longFrameObserver.stop();
      }
      isRunning = false;
    }
  }

  function calculateWeightedAvgTime(metrics: ThumbnailMetricsSummary): number {
    const total = metrics.totalRequests;
    if (total === 0) return 0;

    return (
      (metrics.byLayer.static * metrics.avgTimeByLayer.static +
        metrics.byLayer.local * metrics.avgTimeByLayer.local +
        metrics.byLayer.cloud * metrics.avgTimeByLayer.cloud +
        metrics.byLayer.render * metrics.avgTimeByLayer.render) /
      total
    );
  }

  function formatMs(ms: number): string {
    return ms.toFixed(0) + "ms";
  }

  function formatPercent(pct: number): string {
    return pct.toFixed(1) + "%";
  }

  let copyButtonText = $state("📋 Copy Results");

  async function copyResults() {
    if (!results) return;

    // Build a clean text summary
    const lines = [
      "# Thumbnail Benchmark Results",
      "",
      `Sequences Tested: ${results.sequenceCount}`,
      `Cache Effectiveness: ${formatPercent(results.summary.cacheEffectiveness)} faster on 2nd run`,
      "",
      "## Cache Hit Rates (First Run)",
      `- Static: ${results.summary.firstRunMetrics.byLayer.static} (${formatPercent(results.summary.firstRunMetrics.hitRateByLayer.static)})`,
      `- Local: ${results.summary.firstRunMetrics.byLayer.local} (${formatPercent(results.summary.firstRunMetrics.hitRateByLayer.local)})`,
      `- Cloud: ${results.summary.firstRunMetrics.byLayer.cloud} (${formatPercent(results.summary.firstRunMetrics.hitRateByLayer.cloud)})`,
      `- Render: ${results.summary.firstRunMetrics.byLayer.render} (${formatPercent(results.summary.firstRunMetrics.hitRateByLayer.render)})`,
    ];

    if (results.summary.visibilityChange) {
      const vc = results.summary.visibilityChange;
      lines.push(
        "",
        "## Visibility Change Analysis",
        `- Warm cache: ${formatPercent(vc.warmCacheHitRate)}`,
        `- TKA toggled: ${formatPercent(vc.overlayChangeHitRate)} ${vc.overlayChangeFullyInvalidated ? "❌" : "✅"}`,
        `- Original restored: ${formatPercent(vc.originalCacheSurvival)} ${vc.originalCacheSurvival > 80 ? "✅" : "❌"}`,
        `- Grid changed: ${formatPercent(vc.gridChangeHitRate)} ${vc.gridChangeFullyInvalidated ? "⚠️" : "✅"}`,
        "",
        "## Timing",
        `- Cold start: ${formatMs(vc.coldStartDuration)}`,
        `- Warm cache: ${formatMs(vc.warmCacheDuration)}`,
        `- TKA toggled: ${formatMs(vc.overlayChangeDuration)}`,
        `- Original restored: ${formatMs(vc.originalRestoredDuration)}`,
        `- Grid changed: ${formatMs(vc.gridChangeDuration)}`
      );
    }

    lines.push(
      "",
      "## Raw JSON",
      "```json",
      JSON.stringify(results, null, 2),
      "```"
    );

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      copyButtonText = "✅ Copied!";
      setTimeout(() => {
        copyButtonText = "📋 Copy Results";
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      copyButtonText = "❌ Failed";
      setTimeout(() => {
        copyButtonText = "📋 Copy Results";
      }, 2000);
    }
  }
</script>

<svelte:head>
  <title>Thumbnail Benchmark</title>
</svelte:head>

<div
  class="container"
  data-benchmark-complete={benchmarkComplete ? "true" : undefined}
  data-benchmark-results={results ? JSON.stringify(results) : undefined}
>
  <h1>Thumbnail Caching Benchmark</h1>
  <p class="subtitle">
    Automated performance testing for the 4-tier thumbnail pipeline
  </p>

  <fieldset class="controls" disabled={isRunning}>
    <div class="control-group mode-control">
      <span class="control-label">Mode</span>
      <SegmentedControl
        options={MODE_OPTIONS}
        value={benchmarkMode}
        onchange={(value) => (benchmarkMode = value)}
        size="sm"
        semantics="radiogroup"
        ariaLabel="Benchmark mode"
      />
    </div>
    <div class="control-group prop-control">
      <span class="control-label">Prop</span>
      <SegmentedControl
        options={PROP_OPTIONS}
        value={propType}
        onchange={(value) => (propType = value)}
        size="sm"
        semantics="radiogroup"
        ariaLabel="Thumbnail prop"
      />
    </div>
    <div class="control-group">
      <span class="control-label">Source data</span>
      <SegmentedControl
        options={DATA_OPTIONS}
        value={dataMode}
        onchange={(value) => (dataMode = value)}
        size="sm"
        semantics="radiogroup"
        ariaLabel="Sequence data source"
      />
    </div>
    <div class="control-group">
      <span class="control-label">Request pressure</span>
      <SegmentedControl
        options={CONCURRENCY_OPTIONS}
        value={requestConcurrency}
        onchange={(value) => (requestConcurrency = value)}
        size="sm"
        semantics="radiogroup"
        ariaLabel="Concurrent requests"
      />
    </div>
    <label>
      Sequences:
      <input
        type="number"
        bind:value={sequenceCount}
        min="1"
        max="500"
        disabled={isRunning}
      />
    </label>
    {#if benchmarkMode === "standard"}
      <label>
        Iterations:
        <input
          type="number"
          bind:value={iterations}
          min="1"
          max="5"
          disabled={isRunning}
        />
      </label>
    {:else}
      <span class="iteration-info"
        >5 iterations (fixed for visibility test)</span
      >
    {/if}
    <label>
      Public sequence ID:
      <input
        type="text"
        bind:value={sequenceIdFilter}
        placeholder="All public sequences"
      />
    </label>
    <div class="toggle-controls">
      <FilterChipBase
        label="Bake QR"
        mode="toggle"
        size="sm"
        active={qrEnabled}
        onclick={() => (qrEnabled = !qrEnabled)}
      />
      <FilterChipBase
        label="Skip every cache tier"
        mode="toggle"
        size="sm"
        active={skipCache}
        onclick={() => (skipCache = !skipCache)}
      />
      <FilterChipBase
        label="Clear cache between iterations"
        mode="toggle"
        size="sm"
        active={clearCacheBetweenIterations}
        onclick={() =>
          (clearCacheBetweenIterations = !clearCacheBetweenIterations)}
      />
    </div>
    <button type="button" onclick={runBenchmark} disabled={isRunning}>
      {isRunning ? "Running..." : "Run Benchmark"}
    </button>
  </fieldset>

  {#if benchmarkMode === "visibility-change"}
    <div class="mode-info">
      <h4>Visibility Change Test Sequence:</h4>
      <ol>
        {#each VISIBILITY_TEST_SEQUENCE as config, i}
          <li><strong>{config.label}</strong> - {config.expectedBehavior}</li>
        {/each}
      </ol>
      <p class="mode-note">
        This test measures how cache invalidation affects performance when
        visibility settings change (e.g., toggling TKA or grid options).
      </p>
    </div>
  {/if}

  {#if isRunning}
    <div class="progress">
      <div class="progress-text">{progress.phase}</div>
      {#if progress.total > 0}
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {(progress.current / progress.total) * 100}%"
          ></div>
        </div>
        <div class="progress-count">{progress.current} / {progress.total}</div>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if results}
    <div class="results">
      <div class="results-header">
        <h2>Results</h2>
        <button class="copy-button" onclick={copyResults}
          >{copyButtonText}</button
        >
      </div>

      <div class="summary-cards">
        <div class="card">
          <div class="card-title">Sequences Tested</div>
          <div class="card-value">{results.sequenceCount}</div>
        </div>
        <div class="card">
          <div class="card-title">Cache Effectiveness</div>
          <div class="card-value highlight">
            {formatPercent(results.summary.cacheEffectiveness)}
          </div>
          <div class="card-subtitle">faster on 2nd run</div>
        </div>
      </div>

      <h3>Cache Hit Rates (First Run)</h3>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Hits</th>
            <th>Rate</th>
            <th>Avg Time</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Static (bundled)</td>
            <td>{results.summary.firstRunMetrics.byLayer.static}</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.hitRateByLayer.static
              )}</td
            >
            <td
              >{formatMs(
                results.summary.firstRunMetrics.avgTimeByLayer.static
              )}</td
            >
          </tr>
          <tr>
            <td>Local (IndexedDB)</td>
            <td>{results.summary.firstRunMetrics.byLayer.local}</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.hitRateByLayer.local
              )}</td
            >
            <td
              >{formatMs(
                results.summary.firstRunMetrics.avgTimeByLayer.local
              )}</td
            >
          </tr>
          <tr>
            <td>Cloud (Firebase)</td>
            <td>{results.summary.firstRunMetrics.byLayer.cloud}</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.hitRateByLayer.cloud
              )}</td
            >
            <td
              >{formatMs(
                results.summary.firstRunMetrics.avgTimeByLayer.cloud
              )}</td
            >
          </tr>
          <tr>
            <td>Render (fallback)</td>
            <td>{results.summary.firstRunMetrics.byLayer.render}</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.hitRateByLayer.render
              )}</td
            >
            <td
              >{formatMs(
                results.summary.firstRunMetrics.avgTimeByLayer.render
              )}</td
            >
          </tr>
          <tr class="failed">
            <td>Failed</td>
            <td>{results.summary.firstRunMetrics.byLayer.failed}</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.hitRateByLayer.failed
              )}</td
            >
            <td>-</td>
          </tr>
        </tbody>
      </table>

      {#if results.summary.cachedRunMetrics}
        <h3>Cache Hit Rates (Second Run - Cached)</h3>
        <table class="metrics-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Hits</th>
              <th>Rate</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Static (bundled)</td>
              <td>{results.summary.cachedRunMetrics.byLayer.static}</td>
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.hitRateByLayer.static
                )}</td
              >
              <td
                >{formatMs(
                  results.summary.cachedRunMetrics.avgTimeByLayer.static
                )}</td
              >
            </tr>
            <tr class="highlight-row">
              <td>Local (IndexedDB)</td>
              <td>{results.summary.cachedRunMetrics.byLayer.local}</td>
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.hitRateByLayer.local
                )}</td
              >
              <td
                >{formatMs(
                  results.summary.cachedRunMetrics.avgTimeByLayer.local
                )}</td
              >
            </tr>
            <tr>
              <td>Cloud (Firebase)</td>
              <td>{results.summary.cachedRunMetrics.byLayer.cloud}</td>
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.hitRateByLayer.cloud
                )}</td
              >
              <td
                >{formatMs(
                  results.summary.cachedRunMetrics.avgTimeByLayer.cloud
                )}</td
              >
            </tr>
            <tr>
              <td>Render (fallback)</td>
              <td>{results.summary.cachedRunMetrics.byLayer.render}</td>
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.hitRateByLayer.render
                )}</td
              >
              <td
                >{formatMs(
                  results.summary.cachedRunMetrics.avgTimeByLayer.render
                )}</td
              >
            </tr>
          </tbody>
        </table>
      {/if}

      {#if results.summary.visibilityChange}
        <h3>Visibility Change Analysis</h3>
        <div class="visibility-analysis">
          <table class="metrics-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Total Cache Hit Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr class="highlight-row">
                <td>Warm cache (same visibility)</td>
                <td
                  >{formatPercent(
                    results.summary.visibilityChange.warmCacheHitRate
                  )}</td
                >
                <td
                  >{results.summary.visibilityChange.warmCacheHitRate > 80
                    ? "✅ Cache working"
                    : "⚠️ Unexpected misses"}</td
                >
              </tr>
              <tr
                class={results.summary.visibilityChange
                  .overlayChangeFullyInvalidated
                  ? "warning-row"
                  : ""}
              >
                <td>Overlay change (TKA toggled)</td>
                <td
                  >{formatPercent(
                    results.summary.visibilityChange.overlayChangeHitRate
                  )}</td
                >
                <td
                  >{results.summary.visibilityChange
                    .overlayChangeFullyInvalidated
                    ? "❌ Cache invalidated"
                    : "✅ Cache survived"}</td
                >
              </tr>
              <tr>
                <td>Original restored</td>
                <td
                  >{formatPercent(
                    results.summary.visibilityChange.originalCacheSurvival
                  )}</td
                >
                <td
                  >{results.summary.visibilityChange.originalCacheSurvival > 50
                    ? "✅ Cache survived"
                    : "❌ Cache lost"}</td
                >
              </tr>
              <tr
                class={results.summary.visibilityChange
                  .gridChangeFullyInvalidated
                  ? "warning-row"
                  : ""}
              >
                <td>Grid change (hand points)</td>
                <td
                  >{formatPercent(
                    results.summary.visibilityChange.gridChangeHitRate
                  )}</td
                >
                <td
                  >{results.summary.visibilityChange.gridChangeFullyInvalidated
                    ? "❌ Cache invalidated"
                    : "✅ Cache survived"}</td
                >
              </tr>
            </tbody>
          </table>

          <h4 style="margin-top: 20px;">
            Iteration Timing (Compositional Caching Effect)
          </h4>
          <table class="metrics-table">
            <thead>
              <tr>
                <th>Iteration</th>
                <th>Duration</th>
                <th>vs Cold Start</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1. Cold start</td>
                <td
                  >{formatMs(
                    results.summary.visibilityChange.coldStartDuration
                  )}</td
                >
                <td>-</td>
                <td class="muted">Baseline (no cache)</td>
              </tr>
              <tr class="highlight-row">
                <td>2. Warm cache</td>
                <td
                  >{formatMs(
                    results.summary.visibilityChange.warmCacheDuration
                  )}</td
                >
                <td class="speedup"
                  >{(
                    (1 -
                      results.summary.visibilityChange.warmCacheDuration /
                        results.summary.visibilityChange.coldStartDuration) *
                    100
                  ).toFixed(0)}% faster</td
                >
                <td class="muted">Thumbnail cache hit</td>
              </tr>
              <tr>
                <td>3. TKA toggled</td>
                <td
                  >{formatMs(
                    results.summary.visibilityChange.overlayChangeDuration
                  )}</td
                >
                <td
                  class={results.summary.visibilityChange
                    .overlayChangeDuration <
                  results.summary.visibilityChange.coldStartDuration * 0.8
                    ? "speedup"
                    : "slowdown"}
                >
                  {(
                    (1 -
                      results.summary.visibilityChange.overlayChangeDuration /
                        results.summary.visibilityChange.coldStartDuration) *
                    100
                  ).toFixed(0)}% {results.summary.visibilityChange
                    .overlayChangeDuration <
                  results.summary.visibilityChange.coldStartDuration
                    ? "faster"
                    : "slower"}
                </td>
                <td class="muted">LayerCompositor base cache</td>
              </tr>
              <tr class="highlight-row">
                <td>4. TKA restored</td>
                <td
                  >{formatMs(
                    results.summary.visibilityChange.originalRestoredDuration
                  )}</td
                >
                <td class="speedup"
                  >{(
                    (1 -
                      results.summary.visibilityChange
                        .originalRestoredDuration /
                        results.summary.visibilityChange.coldStartDuration) *
                    100
                  ).toFixed(0)}% faster</td
                >
                <td class="muted">Base layers from cache!</td>
              </tr>
              <tr>
                <td>5. Grid changed</td>
                <td
                  >{formatMs(
                    results.summary.visibilityChange.gridChangeDuration
                  )}</td
                >
                <td
                  class={results.summary.visibilityChange.gridChangeDuration <
                  results.summary.visibilityChange.coldStartDuration * 0.8
                    ? "speedup"
                    : "slowdown"}
                >
                  {(
                    (1 -
                      results.summary.visibilityChange.gridChangeDuration /
                        results.summary.visibilityChange.coldStartDuration) *
                    100
                  ).toFixed(0)}% {results.summary.visibilityChange
                    .gridChangeDuration <
                  results.summary.visibilityChange.coldStartDuration
                    ? "faster"
                    : "slower"}
                </td>
                <td class="muted">Base layer re-render (grid in key)</td>
              </tr>
            </tbody>
          </table>

          <div class="analysis-summary">
            <h4>Key Findings:</h4>
            <ul>
              {#if results.summary.visibilityChange.overlayChangeFullyInvalidated}
                <li class="finding-bad">
                  ❌ TKA toggle invalidated cache - canonical thumbnails not
                  working
                </li>
              {:else}
                <li class="finding-good">✅ TKA toggle preserved cache</li>
              {/if}
              {#if results.summary.visibilityChange.originalCacheSurvival > 80}
                <li class="finding-good">
                  ✅ Original cache survived - {formatPercent(
                    results.summary.visibilityChange.originalCacheSurvival
                  )} hit rate
                </li>
              {:else if results.summary.visibilityChange.originalCacheSurvival > 50}
                <li class="finding-neutral">
                  ⚠️ Partial cache survival - {formatPercent(
                    results.summary.visibilityChange.originalCacheSurvival
                  )} hit rate
                </li>
              {:else}
                <li class="finding-bad">
                  ❌ Original cache lost - only {formatPercent(
                    results.summary.visibilityChange.originalCacheSurvival
                  )} hit rate
                </li>
              {/if}
              {#if results.summary.visibilityChange.gridChangeFullyInvalidated}
                <li class="finding-bad">
                  ❌ Grid/hand point toggle invalidated cache - should be
                  canonical
                </li>
              {:else}
                <li class="finding-good">
                  ✅ Grid/hand point toggle preserved cache
                </li>
              {/if}
            </ul>
            <p class="recommendation">
              {#if !results.summary.visibilityChange.overlayChangeFullyInvalidated && !results.summary.visibilityChange.gridChangeFullyInvalidated && results.summary.visibilityChange.originalCacheSurvival > 80}
                <strong>✅ 100% Cache Effectiveness!</strong> All visibility toggles
                hit cache. Thumbnails use canonical form.
              {:else if results.summary.visibilityChange.overlayChangeFullyInvalidated || results.summary.visibilityChange.gridChangeFullyInvalidated}
                <strong>⚠️ Issue:</strong> Visibility toggles should not invalidate
                cache. Verify ThumbnailKeyDeriver excludes all visibility settings.
              {:else}
                <strong>Note:</strong> Cache behavior is mostly optimal. Check for
                edge cases.
              {/if}
            </p>
          </div>
        </div>
      {/if}

      <h3>Performance Metrics</h3>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>First Run</th>
            {#if results.summary.cachedRunMetrics}
              <th>Cached Run</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cancel Rate</td>
            <td>{formatPercent(results.summary.firstRunMetrics.cancelRate)}</td>
            {#if results.summary.cachedRunMetrics}
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.cancelRate
                )}</td
              >
            {/if}
          </tr>
          <tr>
            <td>Render Failure Rate</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.renderFailureRate
              )}</td
            >
            {#if results.summary.cachedRunMetrics}
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.renderFailureRate
                )}</td
              >
            {/if}
          </tr>
          <tr>
            <td>Upload Success Rate</td>
            <td
              >{formatPercent(
                results.summary.firstRunMetrics.uploadSuccessRate
              )}</td
            >
            {#if results.summary.cachedRunMetrics}
              <td
                >{formatPercent(
                  results.summary.cachedRunMetrics.uploadSuccessRate
                )}</td
              >
            {/if}
          </tr>
          <tr>
            <td>Queue High Water Mark</td>
            <td>{results.summary.firstRunMetrics.queueHighWaterMark}</td>
            {#if results.summary.cachedRunMetrics}
              <td>{results.summary.cachedRunMetrics.queueHighWaterMark}</td>
            {/if}
          </tr>
          <tr>
            <td>Avg Queue Wait</td>
            <td>{formatMs(results.summary.firstRunMetrics.avgQueueWaitTime)}</td
            >
            {#if results.summary.cachedRunMetrics}
              <td
                >{formatMs(
                  results.summary.cachedRunMetrics.avgQueueWaitTime
                )}</td
              >
            {/if}
          </tr>
          <tr>
            <td>Avg Render Time</td>
            <td>{formatMs(results.summary.firstRunMetrics.avgRenderTime)}</td>
            {#if results.summary.cachedRunMetrics}
              <td>{formatMs(results.summary.cachedRunMetrics.avgRenderTime)}</td
              >
            {/if}
          </tr>
        </tbody>
      </table>

      {#if Object.keys(results.summary.firstRunMetrics.stageDistributions).length > 0}
        <h3>Renderer Stages (First Run)</h3>
        <table class="metrics-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Samples</th>
              <th>P50</th>
              <th>P95</th>
              <th>Max</th>
            </tr>
          </thead>
          <tbody>
            {#each Object.entries(results.summary.firstRunMetrics.stageDistributions) as [stage, distribution] (stage)}
              <tr>
                <td>{stage}</td>
                <td>{distribution.count}</td>
                <td>{formatMs(distribution.p50)}</td>
                <td>{formatMs(distribution.p95)}</td>
                <td>{formatMs(distribution.max)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <h3>Longest Requests (First Run)</h3>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Public sequence ID</th>
            <th>Outcome</th>
            <th>Last stage</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {#each results.iterations[0]?.longestRequests ?? [] as request}
            <tr>
              <td>{request.sequenceId ?? "unknown"}</td>
              <td>{request.layer}</td>
              <td>{request.lastStage ?? "none"}</td>
              <td>{formatMs(request.timeToUrl)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if (results.iterations[0]?.failures.length ?? 0) > 0}
        <h3>Failures (First Run)</h3>
        <table class="metrics-table">
          <thead>
            <tr>
              <th>Public sequence ID</th>
              <th>Error code</th>
              <th>Last stage</th>
            </tr>
          </thead>
          <tbody>
            {#each results.iterations[0]?.failures ?? [] as failure}
              <tr class="failed">
                <td>{failure.sequenceId ?? "unknown"}</td>
                <td>{failure.errorCode}</td>
                <td>{failure.lastStage ?? "none"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <h3>Long Animation Frames</h3>
      {#if results.longAnimationFrames.supported}
        <p class="benchmark-note">
          {results.longAnimationFrames.count} frames observed. Longest:
          {formatMs(results.longAnimationFrames.maxDuration)}. Total blocking:
          {formatMs(results.longAnimationFrames.totalBlockingDuration)}.
        </p>
      {:else}
        <p class="benchmark-note">
          This browser does not expose Long Animation Frame timing.
        </p>
      {/if}

      {#if results.summary.firstRunMetrics.timeDistribution?.count > 0}
        <h3>Timing Distribution (First Run)</h3>
        <table class="metrics-table">
          <thead>
            <tr>
              <th>Percentile</th>
              <th>Time</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>P50 (median)</td>
              <td
                >{formatMs(
                  results.summary.firstRunMetrics.timeDistribution.p50
                )}</td
              >
              <td class="muted">Half of thumbnails load faster</td>
            </tr>
            <tr class="highlight-row">
              <td>P95</td>
              <td
                >{formatMs(
                  results.summary.firstRunMetrics.timeDistribution.p95
                )}</td
              >
              <td class="muted">95% of users see this or better</td>
            </tr>
            <tr>
              <td>P99</td>
              <td
                >{formatMs(
                  results.summary.firstRunMetrics.timeDistribution.p99
                )}</td
              >
              <td class="muted">Worst 1% of cases</td>
            </tr>
            <tr>
              <td>Std Dev</td>
              <td
                >{formatMs(
                  results.summary.firstRunMetrics.timeDistribution.stdDev
                )}</td
              >
              <td class="muted">Consistency (lower = more consistent)</td>
            </tr>
            <tr>
              <td>Min / Max</td>
              <td
                >{formatMs(
                  results.summary.firstRunMetrics.timeDistribution.min
                )} / {formatMs(
                  results.summary.firstRunMetrics.timeDistribution.max
                )}</td
              >
              <td class="muted">Range of observed times</td>
            </tr>
          </tbody>
        </table>
      {/if}

      <div class="raw-json">
        <details>
          <summary>Raw JSON</summary>
          <pre>{JSON.stringify(results, null, 2)}</pre>
        </details>
      </div>
    </div>
  {/if}

  <div class="usage-info">
    <h3>Automation</h3>
    <p>For CLI automation, use these URL parameters:</p>
    <ul>
      <li><code>?autorun=true</code> - Start benchmark immediately</li>
      <li><code>&count=100</code> - Number of sequences to test</li>
      <li><code>&iterations=3</code> - Number of iterations</li>
      <li><code>&clearCache=true</code> - Clear cache between iterations</li>
      <li><code>&prop=fan</code> - Render with the selected prop</li>
      <li><code>&qr=true</code> - Bake a QR code when one is available</li>
      <li>
        <code>&data=metadata</code> - Include the gallery document load in the timing
      </li>
      <li><code>&skipCache=true</code> - Force the renderer path</li>
      <li>
        <code>&concurrency=3</code> - Launch one or three requests together
      </li>
      <li>
        <code>&sequenceId=...</code> - Limit the run to one public sequence
      </li>
    </ul>
    <p>
      Example: <code
        >/test/thumbnail-benchmark?autorun=true&count=50&iterations=2</code
      >
    </p>
    <p>
      Results are available in <code>data-benchmark-results</code> attribute
      when <code>data-benchmark-complete="true"</code>
    </p>
  </div>
</div>

<style>
  .container {
    padding: 20px;
    background: #1a1a2e;
    color: white;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
  }

  h1 {
    margin: 0 0 5px 0;
  }

  .subtitle {
    color: #888;
    margin: 0 0 20px 0;
  }

  .controls {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 20px;
    padding: 15px;
    background: #1e1e3f;
    border-radius: 8px;
    border: 0;
    min-inline-size: 0;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ccc;
  }

  .control-group {
    display: grid;
    gap: 6px;
    width: min(100%, 280px);
  }

  .control-group.mode-control {
    width: min(100%, 330px);
  }

  .control-group.prop-control {
    width: min(100%, 480px);
  }

  .control-label {
    color: #ccc;
    font-size: var(--font-size-min, 14px);
  }

  .toggle-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  input[type="number"],
  input[type="text"] {
    width: 80px;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #444;
    background: #2a2a4e;
    color: white;
    font-size: 14px;
  }

  input[type="text"] {
    width: min(280px, 60vw);
  }

  button {
    padding: 10px 24px;
    font-size: 16px;
    background: #4c6ef5;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  button:hover:not(:disabled) {
    background: #364fc7;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .progress {
    padding: 15px;
    background: #1e1e3f;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .progress-text {
    margin-bottom: 10px;
    color: #ccc;
  }

  .progress-bar {
    height: 8px;
    background: #2a2a4e;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .progress-fill {
    height: 100%;
    background: #51cf66;
    transition: width var(--duration-normal) ease;
  }

  .progress-count {
    font-size: 12px;
    color: #888;
  }

  .error {
    padding: 15px;
    background: #3f1e1e;
    color: #ff6b6b;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .results {
    background: #0a0a0f;
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #333;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .results h2 {
    margin: 0;
  }

  .copy-button {
    padding: 8px 16px;
    font-size: 14px;
    background: #2a2a4e;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .copy-button:hover {
    background: #3a3a5e;
    border-color: #4c6ef5;
  }

  .results h3 {
    margin: 20px 0 10px 0;
    color: #ccc;
    font-size: 16px;
  }

  .summary-cards {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
  }

  .card {
    background: #1e1e3f;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    min-width: 150px;
  }

  .card-title {
    font-size: 12px;
    color: #888;
    margin-bottom: 8px;
  }

  .card-value {
    font-size: 32px;
    font-weight: bold;
  }

  .card-value.highlight {
    color: #51cf66;
  }

  .card-subtitle {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
  }

  .metrics-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  .metrics-table th,
  .metrics-table td {
    padding: 10px 15px;
    text-align: left;
    border-bottom: 1px solid #333;
  }

  .metrics-table th {
    background: #1e1e3f;
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
  }

  .metrics-table tr.failed td {
    color: #ff6b6b;
  }

  .metrics-table tr.highlight-row {
    background: rgba(81, 207, 102, 0.1);
  }

  .metrics-table tr.highlight-row td {
    color: #51cf66;
  }

  .metrics-table td.muted {
    color: #666;
    font-size: 12px;
  }

  .benchmark-note {
    color: #ccc;
    font-size: var(--font-size-min, 14px);
  }

  .raw-json {
    margin-top: 20px;
  }

  .raw-json summary {
    cursor: pointer;
    color: #888;
    padding: 10px;
  }

  .raw-json pre {
    background: #1e1e3f;
    padding: 15px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
    color: #ccc;
  }

  .usage-info {
    margin-top: 30px;
    padding: 20px;
    background: #1e1e3f;
    border-radius: 8px;
  }

  .usage-info h3 {
    margin: 0 0 10px 0;
    color: #ccc;
  }

  .usage-info p {
    color: #888;
    margin: 8px 0;
  }

  .usage-info ul {
    color: #888;
    padding-left: 20px;
  }

  .usage-info code {
    background: #2a2a4e;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
    color: #4c6ef5;
  }

  .iteration-info {
    color: #888;
    font-size: 14px;
    font-style: italic;
  }

  .mode-info {
    background: #1e1e3f;
    padding: 15px 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    border-left: 4px solid #4c6ef5;
  }

  .mode-info h4 {
    margin: 0 0 10px 0;
    color: #ccc;
  }

  .mode-info ol {
    margin: 0;
    padding-left: 20px;
    color: #aaa;
  }

  .mode-info li {
    margin: 5px 0;
  }

  .mode-note {
    margin: 10px 0 0 0;
    color: #666;
    font-size: 13px;
  }

  /* Visibility analysis styles */
  .visibility-analysis {
    background: #1a1a30;
    padding: 15px;
    border-radius: 8px;
    border: 1px solid #2a2a4e;
  }

  .metrics-table tr.warning-row {
    background: rgba(255, 107, 107, 0.1);
  }

  .metrics-table tr.warning-row td {
    color: #ff6b6b;
  }

  .analysis-summary {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #333;
  }

  .analysis-summary h4 {
    margin: 0 0 10px 0;
    color: #ccc;
    font-size: 14px;
  }

  .analysis-summary ul {
    margin: 0 0 15px 0;
    padding-left: 20px;
  }

  .analysis-summary li {
    margin: 5px 0;
  }

  .finding-good {
    color: #51cf66;
  }

  .finding-bad {
    color: #ff6b6b;
  }

  .finding-neutral {
    color: #ffd43b;
  }

  .speedup {
    color: #51cf66;
    font-weight: 500;
  }

  .slowdown {
    color: #ff6b6b;
  }

  .recommendation {
    margin: 0;
    padding: 10px;
    background: #2a2a4e;
    border-radius: 4px;
    color: #ccc;
    font-size: 13px;
  }
</style>
