/**
 * Cache Benchmark Utility
 *
 * Comprehensive cache effectiveness testing using real sequence data.
 * Tests cold/warm/hot renders, cross-sequence cache benefits, and gallery simulation.
 *
 * Usage (from browser console):
 *   window.runCacheBenchmark()           // Quick test (10 sequences)
 *   window.runCacheBenchmark(50)         // Full test (50 sequences)
 *   window.runCacheBenchmark(100, true)  // Deep test with L1 clear
 */

import { browser } from "$app/environment";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

interface SequenceRenderResult {
  name: string;
  stepCount: number;
  renderTimeMs: number;
  l2Hits: number;
  l1Hits: number;
  freshRenders: number;
  cacheRate: number;
}

interface BenchmarkResult {
  testName: string;
  totalSequences: number;
  totalSteps: number;
  totalRenderTimeMs: number;
  avgRenderTimeMs: number;
  avgTimePerBeatMs: number;
  cacheStats: {
    totalL2Hits: number;
    totalL1Hits: number;
    totalFreshRenders: number;
    overallCacheRate: number;
  };
  sequences: SequenceRenderResult[];
}

interface ComprehensiveResult {
  coldPass: BenchmarkResult;
  warmPass: BenchmarkResult;
  hotPass: BenchmarkResult;
  crossSequenceBenefit: {
    sharedPictographs: number;
    uniquePictographs: number;
    reuseRate: number;
  };
  summary: {
    coldAvgMs: number;
    warmAvgMs: number;
    hotAvgMs: number;
    l1Speedup: string;
    l2Speedup: string;
    memoryCacheSize: number;
  };
}

interface VisibilityChangeResult {
  defaultPass: BenchmarkResult;
  warmCachePass: BenchmarkResult;
  changedVisibilityPass: BenchmarkResult;
  restoredVisibilityPass: BenchmarkResult;
  analysis: {
    warmCacheHitRate: number;
    visibilityChangeHitRate: number;
    restoredCacheHitRate: number;
    cacheFullyInvalidated: boolean;
    cacheSurvivedToggle: boolean;
  };
}

// Capture per-render stats from console logs
let capturedStats: { l2: number; l1: number; fresh: number } | null = null;

/**
 * Parse the render log to extract cache stats
 */
function parseRenderLog(log: string): { l2: number; l1: number; fresh: number } | null {
  // Format: [Render] "Name" N steps: X L2, Y L1, Z fresh (N% cached)
  const match = log.match(/(\d+) L2, (\d+) L1, (\d+) fresh/);
  if (match) {
    return {
      l2: parseInt(match[1]!, 10),
      l1: parseInt(match[2]!, 10),
      fresh: parseInt(match[3]!, 10),
    };
  }
  return null;
}

/**
 * Run comprehensive cache benchmark with real sequence data
 */
export async function runCacheBenchmark(
  sequenceCount = 10,
  clearL1BetweenPasses = false
): Promise<ComprehensiveResult | null> {
  if (!browser) {
    console.error("[CacheBenchmark] Must run in browser");
    return null;
  }

  console.log("\n" + "=".repeat(70));
  console.log("🧪 COMPREHENSIVE CACHE BENCHMARK");
  console.log("=".repeat(70));
  console.log(`Testing with ${sequenceCount} real sequences\n`);

  try {
    const { getImageComposer } = await import("../get-image-composer");
    const imageComposer = getImageComposer();

    // Load real sequences from the browse index
    const sequences = await loadRealSequences(sequenceCount);
    if (sequences.length === 0) {
      console.error("[CacheBenchmark] No valid sequences found");
      return null;
    }

    console.log(`✓ Loaded ${sequences.length} sequences with valid step data\n`);

    const renderOptions = {
      stepSize: 240,
      includeStartPlacement: true,
      addStepNumbers: true,
      addWord: true,
      addDifficultyLevel: true,
      visibilityOverrides: {
        showTKA: true,
        showTnD: false,
        showElemental: false,
        showPlacements: false,
        showReversals: true,
        showNonRadialPoints: false,
        darkMode: false,
      },
    };

    // Intercept console.log to capture render stats
    const originalLog = console.log;
    console.log = (...args) => {
      const msg = args[0];
      if (typeof msg === "string" && msg.startsWith("[Render]")) {
        capturedStats = parseRenderLog(msg);
      }
      originalLog.apply(console, args);
    };

    // Cast to the expected shape for runPass (dev utility, type safety not critical)
    const composer = imageComposer as unknown as {
      composeSequenceImage: (seq: SequenceData, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      getCacheStats: () => unknown;
      clearCache: (includeIndexedDB?: boolean) => Promise<void>;
    };

    // PASS 1: Cold renders (empty cache)
    console.log("━".repeat(70));
    console.log("📊 PASS 1: COLD RENDERS (empty cache - measuring baseline)\n");
    await composer.clearCache(true); // Clear both L1 and L2
    const coldPass = await runPass("Cold", sequences, composer, renderOptions);

    // PASS 2: Warm renders (L1 populated, L2 cleared)
    console.log("\n" + "━".repeat(70));
    console.log("📊 PASS 2: WARM RENDERS (L1 blob cache populated)\n");
    if (clearL1BetweenPasses) {
      await composer.clearCache(true);
    } else {
      await composer.clearCache(false); // Clear only L2
    }
    const warmPass = await runPass("Warm", sequences, composer, renderOptions);

    // PASS 3: Hot renders (both L1 and L2 populated)
    console.log("\n" + "━".repeat(70));
    console.log("📊 PASS 3: HOT RENDERS (L2 memory cache populated)\n");
    const hotPass = await runPass("Hot", sequences, composer, renderOptions);

    // Restore console.log
    console.log = originalLog;

    // Calculate cross-sequence benefit
    const uniquePictographs = coldPass.cacheStats.totalFreshRenders;
    const sharedPictographs = coldPass.totalSteps - uniquePictographs;
    const reuseRate = coldPass.totalSteps > 0
      ? (sharedPictographs / coldPass.totalSteps) * 100
      : 0;

    // Build result
    const result: ComprehensiveResult = {
      coldPass,
      warmPass,
      hotPass,
      crossSequenceBenefit: {
        sharedPictographs,
        uniquePictographs,
        reuseRate,
      },
      summary: {
        coldAvgMs: coldPass.avgRenderTimeMs,
        warmAvgMs: warmPass.avgRenderTimeMs,
        hotAvgMs: hotPass.avgRenderTimeMs,
        l1Speedup: ((1 - warmPass.avgRenderTimeMs / coldPass.avgRenderTimeMs) * 100).toFixed(1) + "%",
        l2Speedup: ((1 - hotPass.avgRenderTimeMs / coldPass.avgRenderTimeMs) * 100).toFixed(1) + "%",
        memoryCacheSize: (composer.getCacheStats() as { memoryCacheSize: number }).memoryCacheSize,
      },
    };

    printComprehensiveSummary(result);
    return result;

  } catch (error) {
    console.error("[CacheBenchmark] Failed:", error);
    return null;
  }
}

/**
 * Run a single benchmark pass over all sequences
 */
async function runPass(
  passName: string,
  sequences: SequenceData[],
  imageComposer: {
    composeSequenceImage: (seq: SequenceData, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    getCacheStats: () => unknown;
    clearCache: (includeIndexedDB?: boolean) => Promise<void>;
  },
  renderOptions: Record<string, unknown>
): Promise<BenchmarkResult> {
  const results: SequenceRenderResult[] = [];
  let totalRenderTime = 0;
  let totalSteps = 0;
  let totalL2 = 0;
  let totalL1 = 0;
  let totalFresh = 0;

  for (let i = 0; i < sequences.length; i++) {
    const seq = sequences[i]!;
    const stepCount = seq.steps?.length || 0;
    totalSteps += stepCount;

    capturedStats = null;
    const start = performance.now();
    await imageComposer.composeSequenceImage(seq, renderOptions);
    const renderTime = performance.now() - start;
    totalRenderTime += renderTime;

    const stats = capturedStats || { l2: 0, l1: 0, fresh: stepCount };
    totalL2 += stats.l2;
    totalL1 += stats.l1;
    totalFresh += stats.fresh;

    const totalCached = stats.l2 + stats.l1;
    const total = stats.l2 + stats.l1 + stats.fresh;
    const cacheRate = total > 0 ? (totalCached / total) * 100 : 0;

    results.push({
      name: seq.word || seq.name || "unnamed",
      stepCount,
      renderTimeMs: renderTime,
      l2Hits: stats.l2,
      l1Hits: stats.l1,
      freshRenders: stats.fresh,
      cacheRate,
    });

    // Progress indicator every 10 sequences
    if ((i + 1) % 10 === 0 || i === sequences.length - 1) {
      const progress = ((i + 1) / sequences.length * 100).toFixed(0);
      console.log(`  [${passName}] ${i + 1}/${sequences.length} (${progress}%) - Avg: ${(totalRenderTime / (i + 1)).toFixed(0)}ms/seq`);
    }
  }

  const totalCached = totalL2 + totalL1;
  const totalOps = totalL2 + totalL1 + totalFresh;

  return {
    testName: passName,
    totalSequences: sequences.length,
    totalSteps,
    totalRenderTimeMs: totalRenderTime,
    avgRenderTimeMs: totalRenderTime / sequences.length,
    avgTimePerBeatMs: totalSteps > 0 ? totalRenderTime / totalSteps : 0,
    cacheStats: {
      totalL2Hits: totalL2,
      totalL1Hits: totalL1,
      totalFreshRenders: totalFresh,
      overallCacheRate: totalOps > 0 ? (totalCached / totalOps) * 100 : 0,
    },
    sequences: results,
  };
}

/**
 * Load real sequences from the browse index using BrowseLoader
 */
async function loadRealSequences(count: number): Promise<SequenceData[]> {
  try {
    const { getBrowseLoader } = await import("$lib/shared/browse/get-browse-loader");
    const browseLoader = getBrowseLoader() as {
      loadSequenceMetadata: () => Promise<SequenceData[]>;
      loadFullSequenceData: (name: string) => Promise<SequenceData | null>;
    };

    // Take the names from the metadata the loader already returns. This used
    // to discard that result and then fetch `/data/sequence-index.json`, which
    // does not exist — the benchmark bailed out with zero sequences every time
    // anyone ran it. The browse loader is the canonical owner of the corpus.
    console.log("[CacheBenchmark] Loading sequence metadata...");
    let metadata: SequenceData[] = [];
    try {
      metadata = await browseLoader.loadSequenceMetadata();
      console.log(`[CacheBenchmark] ✓ Index loaded (${metadata.length} sequences)`);
    } catch (indexErr) {
      const msg = indexErr instanceof Error ? indexErr.message : String(indexErr);
      console.error("[CacheBenchmark] Failed to load index:", msg);
      return [];
    }

    if (metadata.length === 0) return [];

    // Shuffle a copy — `loadSequenceMetadata` may hand back cached state.
    const shuffled = [...metadata].sort(() => Math.random() - 0.5);
    const selectedNames = shuffled
      .slice(0, count * 2)
      .map((s) => s.word || s.name);

    // Load full sequence data for each
    const loadedSequences: SequenceData[] = [];
    let loadAttempts = 0;

    console.log(`[CacheBenchmark] Loading sequences from ${selectedNames.length} candidates...`);

    for (const name of selectedNames) {
      if (loadedSequences.length >= count) break;
      if (!name) continue;

      loadAttempts++; // eslint-disable-line @typescript-eslint/no-unused-vars
      try {
        const fullSeq = await browseLoader.loadFullSequenceData(name);
        if (fullSeq?.steps && fullSeq.steps.length > 0) {
          // Just accept sequences with steps - the renderer will show what works
          loadedSequences.push(fullSeq);
          console.log(`[CacheBenchmark] ✓ Loaded "${name}" (${fullSeq.steps.length} steps)`);
        } else {
          console.log(`[CacheBenchmark] ✗ "${name}" has no steps or returned null`);
        }
      } catch (err) {
        // Skip sequences that fail to load
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`[CacheBenchmark] ✗ "${name}" failed: ${errorMsg}`);
      }
    }

    console.log(`[CacheBenchmark] Loaded ${loadedSequences.length} sequences with steps`);

    return loadedSequences;

  } catch (error) {
    console.error("[CacheBenchmark] Failed to load sequences:", error);
    return [];
  }
}

/**
 * Print comprehensive summary
 */
function printComprehensiveSummary(result: ComprehensiveResult): void {
  console.log("\n" + "=".repeat(70));
  console.log("📊 COMPREHENSIVE BENCHMARK RESULTS");
  console.log("=".repeat(70));

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ RENDER TIMES                                                        │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Cold (no cache):      ${result.summary.coldAvgMs.toFixed(0).padStart(6)}ms avg/sequence                       │`);
  console.log(`│ Warm (L1 blob):       ${result.summary.warmAvgMs.toFixed(0).padStart(6)}ms avg/sequence  (${result.summary.l1Speedup.padStart(6)} faster)     │`);
  console.log(`│ Hot (L2 memory):      ${result.summary.hotAvgMs.toFixed(0).padStart(6)}ms avg/sequence  (${result.summary.l2Speedup.padStart(6)} faster)     │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ CACHE EFFECTIVENESS                                                 │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Cold pass cache rate:  ${result.coldPass.cacheStats.overallCacheRate.toFixed(1).padStart(5)}% (cross-sequence pictograph reuse)    │`);
  console.log(`│ Warm pass cache rate:  ${result.warmPass.cacheStats.overallCacheRate.toFixed(1).padStart(5)}% (L1 IndexedDB hits)                  │`);
  console.log(`│ Hot pass cache rate:   ${result.hotPass.cacheStats.overallCacheRate.toFixed(1).padStart(5)}% (L2 memory hits)                     │`);
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Unique pictographs:    ${String(result.crossSequenceBenefit.uniquePictographs).padStart(5)}                                       │`);
  console.log(`│ Shared pictographs:    ${String(result.crossSequenceBenefit.sharedPictographs).padStart(5)} (reused across sequences)             │`);
  console.log(`│ Pictograph reuse rate: ${result.crossSequenceBenefit.reuseRate.toFixed(1).padStart(5)}%                                       │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TOTALS                                                              │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Sequences tested:      ${String(result.coldPass.totalSequences).padStart(5)}                                       │`);
  console.log(`│ Total steps rendered:  ${String(result.coldPass.totalSteps).padStart(5)}                                       │`);
  console.log(`│ Memory cache entries:  ${String(result.summary.memoryCacheSize).padStart(5)}                                       │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  // Performance interpretation
  console.log("\n📈 INTERPRETATION:");

  const l1SpeedupNum = parseFloat(result.summary.l1Speedup);
  const l2SpeedupNum = parseFloat(result.summary.l2Speedup);
  const coldCacheRate = result.coldPass.cacheStats.overallCacheRate;

  if (coldCacheRate > 30) {
    console.log(`   ✓ High cross-sequence reuse (${coldCacheRate.toFixed(0)}%) - pictographs are being shared well`);
  } else if (coldCacheRate > 10) {
    console.log(`   → Moderate cross-sequence reuse (${coldCacheRate.toFixed(0)}%) - some pictograph sharing`);
  } else {
    console.log(`   ⚠ Low cross-sequence reuse (${coldCacheRate.toFixed(0)}%) - sequences have unique pictographs`);
  }

  if (l1SpeedupNum > 50) {
    console.log(`   ✓ L1 blob cache very effective (${l1SpeedupNum.toFixed(0)}% speedup)`);
  } else if (l1SpeedupNum > 20) {
    console.log(`   → L1 blob cache moderately effective (${l1SpeedupNum.toFixed(0)}% speedup)`);
  } else {
    console.log(`   ⚠ L1 blob cache underperforming (${l1SpeedupNum.toFixed(0)}% speedup)`);
  }

  if (l2SpeedupNum > 80) {
    console.log(`   ✓ L2 memory cache excellent (${l2SpeedupNum.toFixed(0)}% speedup) - near instant re-renders`);
  } else if (l2SpeedupNum > 50) {
    console.log(`   → L2 memory cache good (${l2SpeedupNum.toFixed(0)}% speedup)`);
  } else {
    console.log(`   ⚠ L2 memory cache underperforming (${l2SpeedupNum.toFixed(0)}% speedup)`);
  }

  console.log("\n" + "=".repeat(70));
}

/**
 * Quick single-sequence test (original behavior)
 */
export async function runQuickBenchmark(): Promise<void> {
  if (!browser) {
    console.error("[CacheBenchmark] Must run in browser");
    return;
  }

  console.log("Running quick single-sequence benchmark...");
  console.log("For comprehensive multi-sequence test, use: window.runCacheBenchmark(50)\n");

  await runCacheBenchmark(1);
}

/**
 * Run visibility change benchmark to measure cache invalidation behavior
 *
 * Tests the hypothesis: "Changing visibility settings invalidates ALL cached thumbnails"
 *
 * Pass 1: Default visibility (showTKA=true, showReversals=true) - cold start
 * Pass 2: Same visibility - warm cache test (should hit cache)
 * Pass 3: Changed visibility (showTKA=false) - cache invalidation test
 * Pass 4: Restored visibility (showTKA=true) - cache survival test
 */
export async function runVisibilityChangeBenchmark(
  sequenceCount = 10
): Promise<VisibilityChangeResult | null> {
  if (!browser) {
    console.error("[CacheBenchmark] Must run in browser");
    return null;
  }

  console.log("\n" + "=".repeat(70));
  console.log("🔄 VISIBILITY CHANGE CACHE BENCHMARK");
  console.log("=".repeat(70));
  console.log(`Testing cache invalidation with ${sequenceCount} sequences\n`);
  console.log("This test measures what happens to the cache when visibility toggles.\n");

  try {
    const { getImageComposer } = await import("../get-image-composer");
    const imageComposer = getImageComposer();

    // Load real sequences
    const sequences = await loadRealSequences(sequenceCount);
    if (sequences.length === 0) {
      console.error("[CacheBenchmark] No valid sequences found");
      return null;
    }

    console.log(`✓ Loaded ${sequences.length} sequences with valid step data\n`);

    // Base render options (without visibility)
    const baseRenderOptions = {
      stepSize: 240,
      includeStartPlacement: true,
      addStepNumbers: true,
      addWord: true,
      addDifficultyLevel: true,
    };

    // Default visibility (TKA and Reversals ON)
    const defaultVisibility = {
      showTKA: true,
      showTnD: false,
      showElemental: false,
      showPlacements: false,
      showReversals: true,
      showNonRadialPoints: false,
      darkMode: false,
      showGrid: true,
      handPointVisibility: "all" as const,
    };

    // Changed visibility (TKA OFF - overlay change)
    const changedVisibility = {
      ...defaultVisibility,
      showTKA: false,
    };

    // Intercept console.log to capture render stats
    const originalLog = console.log;
    console.log = (...args) => {
      const msg = args[0];
      if (typeof msg === "string" && msg.startsWith("[Render]")) {
        capturedStats = parseRenderLog(msg);
      }
      originalLog.apply(console, args);
    };

    // Cast for dev utility
    const composer = imageComposer as unknown as {
      composeSequenceImage: (seq: SequenceData, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      getCacheStats: () => unknown;
      clearCache: (includeIndexedDB?: boolean) => Promise<void>;
    };

    // Clear all caches before starting
    await composer.clearCache(true);

    // PASS 1: Default visibility (cold start)
    console.log("━".repeat(70));
    console.log("📊 PASS 1: DEFAULT VISIBILITY (cold cache - baseline)\n");
    console.log("   Visibility: showTKA=true, showReversals=true, showGrid=true\n");
    const defaultPass = await runPass(
      "Default",
      sequences,
      composer,
      { ...baseRenderOptions, visibilityOverrides: defaultVisibility }
    );

    // PASS 2: Same visibility (warm cache test)
    console.log("\n" + "━".repeat(70));
    console.log("📊 PASS 2: SAME VISIBILITY (warm cache - should hit cache)\n");
    console.log("   Visibility: showTKA=true, showReversals=true, showGrid=true\n");
    const warmCachePass = await runPass(
      "Warm",
      sequences,
      composer,
      { ...baseRenderOptions, visibilityOverrides: defaultVisibility }
    );

    // PASS 3: Changed visibility (TKA toggled off)
    console.log("\n" + "━".repeat(70));
    console.log("📊 PASS 3: CHANGED VISIBILITY (cache invalidation test)\n");
    console.log("   Visibility: showTKA=FALSE, showReversals=true, showGrid=true\n");
    console.log("   EXPECTED: Cache MISS - visibility is part of cache key\n");
    const changedVisibilityPass = await runPass(
      "Changed",
      sequences,
      composer,
      { ...baseRenderOptions, visibilityOverrides: changedVisibility }
    );

    // PASS 4: Restored visibility (cache survival test)
    console.log("\n" + "━".repeat(70));
    console.log("📊 PASS 4: RESTORED VISIBILITY (cache survival test)\n");
    console.log("   Visibility: showTKA=true, showReversals=true, showGrid=true\n");
    console.log("   EXPECTED: Cache HIT if original cache survived visibility toggle\n");
    const restoredVisibilityPass = await runPass(
      "Restored",
      sequences,
      composer,
      { ...baseRenderOptions, visibilityOverrides: defaultVisibility }
    );

    // Restore console.log
    console.log = originalLog;

    // Analyze results
    const warmCacheHitRate = warmCachePass.cacheStats.overallCacheRate;
    const visibilityChangeHitRate = changedVisibilityPass.cacheStats.overallCacheRate;
    const restoredCacheHitRate = restoredVisibilityPass.cacheStats.overallCacheRate;

    // Cache is "fully invalidated" if changing visibility causes ~0% cache hits
    const cacheFullyInvalidated = visibilityChangeHitRate < 5;

    // Cache "survived" the toggle if restoring visibility still hits cache
    const cacheSurvivedToggle = restoredCacheHitRate > 50;

    const result: VisibilityChangeResult = {
      defaultPass,
      warmCachePass,
      changedVisibilityPass,
      restoredVisibilityPass,
      analysis: {
        warmCacheHitRate,
        visibilityChangeHitRate,
        restoredCacheHitRate,
        cacheFullyInvalidated,
        cacheSurvivedToggle,
      },
    };

    printVisibilityChangeSummary(result);
    return result;

  } catch (error) {
    console.error("[CacheBenchmark] Failed:", error);
    return null;
  }
}

/**
 * Print visibility change benchmark summary
 */
function printVisibilityChangeSummary(result: VisibilityChangeResult): void {
  console.log("\n" + "=".repeat(70));
  console.log("📊 VISIBILITY CHANGE BENCHMARK RESULTS");
  console.log("=".repeat(70));

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ CACHE HIT RATES BY PASS                                             │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Pass 1 (Default - cold):     ${result.defaultPass.cacheStats.overallCacheRate.toFixed(1).padStart(5)}%  (expected: low/0%)            │`);
  console.log(`│ Pass 2 (Same visibility):    ${result.analysis.warmCacheHitRate.toFixed(1).padStart(5)}%  (expected: high ~100%)        │`);
  console.log(`│ Pass 3 (TKA toggled off):    ${result.analysis.visibilityChangeHitRate.toFixed(1).padStart(5)}%  (tests cache invalidation)   │`);
  console.log(`│ Pass 4 (Restored default):   ${result.analysis.restoredCacheHitRate.toFixed(1).padStart(5)}%  (tests cache survival)       │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ RENDER TIMES                                                        │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Default (cold):      ${result.defaultPass.avgRenderTimeMs.toFixed(0).padStart(6)}ms avg/sequence                       │`);
  console.log(`│ Same visibility:     ${result.warmCachePass.avgRenderTimeMs.toFixed(0).padStart(6)}ms avg/sequence                       │`);
  console.log(`│ Changed visibility:  ${result.changedVisibilityPass.avgRenderTimeMs.toFixed(0).padStart(6)}ms avg/sequence                       │`);
  console.log(`│ Restored visibility: ${result.restoredVisibilityPass.avgRenderTimeMs.toFixed(0).padStart(6)}ms avg/sequence                       │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ ANALYSIS                                                            │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");

  // Cache invalidation analysis
  if (result.analysis.cacheFullyInvalidated) {
    console.log("│ ⚠️  VISIBILITY CHANGE INVALIDATES CACHE                              │");
    console.log(`│    Toggling TKA caused ${(100 - result.analysis.visibilityChangeHitRate).toFixed(0)}% cache miss rate                       │`);
  } else {
    console.log("│ ✓  Cache partially survived visibility change                       │");
    console.log(`│    ${result.analysis.visibilityChangeHitRate.toFixed(0)}% of pictographs still cached after toggle               │`);
  }

  // Cache survival analysis
  if (result.analysis.cacheSurvivedToggle) {
    console.log("│ ✓  Original cache survived the visibility toggle                    │");
    console.log(`│    Restored ${result.analysis.restoredCacheHitRate.toFixed(0)}% cache hit rate on return to default            │`);
  } else {
    console.log("│ ⚠️  Original cache was evicted during visibility change              │");
    console.log(`│    Only ${result.analysis.restoredCacheHitRate.toFixed(0)}% cache hit rate after returning to default        │`);
  }

  console.log("└─────────────────────────────────────────────────────────────────────┘");

  // Cost calculation
  const costOfVisibilityChange = result.changedVisibilityPass.avgRenderTimeMs;

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ COST OF VISIBILITY CHANGE                                           │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Time to re-render on visibility change: ${costOfVisibilityChange.toFixed(0).padStart(5)}ms avg/sequence        │`);

  if (result.analysis.cacheFullyInvalidated) {
    console.log("│                                                                     │");
    console.log("│ 💡 RECOMMENDATION: Implement compositional caching                  │");
    console.log("│    - Separate BASE layer (grid+props+arrows) from OVERLAYS         │");
    console.log("│    - Base layer cache survives visibility toggles                  │");
    console.log("│    - Only re-composite on visibility change (~1-2ms)               │");
  }

  console.log("└─────────────────────────────────────────────────────────────────────┘");
  console.log("\n" + "=".repeat(70));
}

// Expose globally for console access
if (browser && typeof window !== "undefined") {
  (window as unknown as {
    runCacheBenchmark: typeof runCacheBenchmark;
    runQuickBenchmark: typeof runQuickBenchmark;
    runVisibilityChangeBenchmark: typeof runVisibilityChangeBenchmark;
  }).runCacheBenchmark = runCacheBenchmark;
  (window as unknown as { runQuickBenchmark: typeof runQuickBenchmark }).runQuickBenchmark = runQuickBenchmark;
  (window as unknown as { runVisibilityChangeBenchmark: typeof runVisibilityChangeBenchmark }).runVisibilityChangeBenchmark = runVisibilityChangeBenchmark;
}
