<script lang="ts">
  /**
   * Render Comparison Test Page
   *
   * Three modes:
   * 1. Single Letter - Detailed comparison of one pictograph
   * 2. Bulk Compare - Renders many pictographs from CSV side-by-side
   * 3. Real Sequences - Renders steps from actual database sequences
   *
   * IMPORTANT: Uses motionQueryHandler to load from CSV dataframe
   * (NOT letterQueryHandler which goes to Codex - that's for the Learn tab only)
   */
  import { onMount } from 'svelte';
  import { motionQueryHandler } from '$lib/shared/pictograph/shared/services/motion-query-handler';
  import type { PictographData } from '$lib/shared/pictograph/shared/domain/models/pictograph-data';
  import type { SequenceData } from '$lib/shared/foundation/domain/models/sequence-data';
  import { GridMode } from '$lib/shared/pictograph/grid/domain/enums/grid-enums';
  import { Letter } from '$lib/shared/foundation/domain/models/letter';
  import { PropType } from '$lib/shared/pictograph/prop/domain/enums/prop-type';
  import { renderPictographToSVG } from '$lib/shared/render/utils/pictograph-to-svg';
  import { Canvas2DDirectRenderer } from '$lib/shared/render/services/canvas-2d-direct-renderer';
  import PictographContainer from '$lib/shared/pictograph/shared/components/PictographContainer.svelte';
  import { PublicSequencesLoader } from '$lib/shared/browse/services/public-sequences-loader';

  const STORAGE_KEY = 'render-compare-state';

  // Mode selection
  type CompareMode = 'single' | 'bulk' | 'sequences';
  let mode = $state<CompareMode>('single');

  // Single mode state
  let status = $state('Initializing...');
  let selectedLetter = $state<Letter>(Letter.A);
  let realPictograph = $state<PictographData | null>(null);
  let svgTime = $state(0);
  let canvasTime = $state(0);
  let svgDataUrl = $state('');
  let canvasDataUrl = $state('');
  let error = $state('');
  let availableLetters = $state<Letter[]>([]);
  let allPictographs = $state<PictographData[]>([]);
  let isLoading = $state(false);

  // Bulk mode state
  type BulkRenderResult = {
    pictograph: PictographData;
    svgDataUrl: string;
    canvasDataUrl: string;
    svgTime: number;
    canvasTime: number;
    speedup: number;
  };
  let bulkResults = $state<BulkRenderResult[]>([]);
  let bulkProgress = $state(0);
  let bulkTotal = $state(0);
  let bulkStats = $state<{
    totalSvgTime: number;
    totalCanvasTime: number;
    avgSpeedup: number;
    count: number;
  } | null>(null);

  // Sequences mode state
  type SequenceRenderResult = {
    sequence: SequenceData;
    steps: {
      stepIndex: number;
      letter: string;
      svgDataUrl: string;
      canvasDataUrl: string;
      svgTime: number;
      canvasTime: number;
      speedup: number;
    }[];
    totalSvgTime: number;
    totalCanvasTime: number;
    avgSpeedup: number;
  };
  let sequenceResults = $state<SequenceRenderResult[]>([]);
  let sequenceProgress = $state({ current: 0, total: 0, currentSeq: '', currentStep: 0, totalSteps: 0 });
  let sequenceStats = $state<{
    totalSequences: number;
    totalSteps: number;
    totalSvgTime: number;
    totalCanvasTime: number;
    avgSpeedup: number;
  } | null>(null);
  let loadedSequences = $state<SequenceData[]>([]);
  const SEQUENCE_COUNT = 30; // Number of sequences to render

  const SIZE = 300;
  const BULK_SIZE = 150; // Smaller size for bulk comparison
  const BULK_COUNT = 30; // Number of pictographs to render in bulk mode

  // Save state to localStorage
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedLetter,
        mode,
        hasRendered: svgDataUrl !== ''
      }));
    } catch {
      // Ignore storage errors
    }
  }

  // Load state from localStorage
  function loadState(): { selectedLetter?: Letter; mode?: CompareMode; hasRendered?: boolean } {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore storage errors
    }
    return {};
  }

  onMount(async () => {
    try {
      status = 'Loading pictographs from CSV dataframe...';

      // Query pictographs from the diamond dataframe
      const pictographs = await motionQueryHandler.queryMotions({ gridMode: GridMode.DIAMOND });
      allPictographs = pictographs;

      // Extract unique letters from loaded pictographs
      const uniqueLetters = new Set<Letter>();
      for (const p of pictographs) {
        if (p.letter) {
          uniqueLetters.add(p.letter as Letter);
        }
      }
      availableLetters = Array.from(uniqueLetters).sort();

      const savedState = loadState();
      if (savedState.mode) {
        mode = savedState.mode;
      }

      // Use saved letter if available and valid, otherwise use first letter
      if (savedState.selectedLetter && availableLetters.includes(savedState.selectedLetter)) {
        selectedLetter = savedState.selectedLetter;
      } else if (availableLetters.length > 0 && availableLetters[0]) {
        selectedLetter = availableLetters[0];
      }

      status = `Loaded ${pictographs.length} pictographs. Select mode and click Render`;

      // Auto-render if we had a previous render in single mode
      if (savedState.hasRendered && mode === 'single') {
        await renderBoth();
      }
    } catch (err) {
      error = String(err);
      status = 'Error initializing';
      console.error('Init error:', err);
    }
  });

  async function loadPictograph() {
    try {
      status = `Finding pictograph for letter ${selectedLetter}...`;

      // Find a pictograph with the selected letter from our cached data
      const picto = allPictographs.find(p => p.letter === selectedLetter);

      if (!picto) {
        throw new Error(`No pictograph found for letter ${selectedLetter} in dataframe`);
      }

      realPictograph = picto;
      status = `Found: ${selectedLetter} from ${picto.startPlacement} to ${picto.endPlacement}`;

      return picto;
    } catch (err) {
      error = String(err);
      status = 'Error loading pictograph';
      throw err;
    }
  }

  async function renderBoth() {
    if (isLoading) return;
    isLoading = true;
    error = '';
    svgDataUrl = '';
    canvasDataUrl = '';

    try {
      // Load real pictograph data
      const picto = await loadPictograph();

      // Render with SVG
      status = 'Rendering SVG...';
      const svgStart = performance.now();
      const svgString = await renderPictographToSVG(picto, SIZE, undefined, {
        showTKA: true,
        darkMode: true
      });
      svgTime = performance.now() - svgStart;
      svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

      // Render with Canvas 2D
      status = 'Rendering Canvas 2D...';
      const renderer = new Canvas2DDirectRenderer();
      await renderer.initialize();

      const canvasStart = performance.now();
      const canvas = await renderer.renderPictograph(picto, {
        size: SIZE,
        visibility: {
          showTKA: true,
          showReversals: true,
          showNonRadialPoints: false,
          darkMode: true
        }
      });
      canvasTime = performance.now() - canvasStart;
      if (canvas instanceof OffscreenCanvas) {
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        canvasDataUrl = URL.createObjectURL(blob);
      } else {
        canvasDataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
      }

      const speedup = (svgTime / canvasTime).toFixed(1);
      status = `Done! SVG: ${svgTime.toFixed(0)}ms, Canvas: ${canvasTime.toFixed(0)}ms (${speedup}x faster)`;

      // Save state for persistence across refresh
      saveState();

    } catch (err) {
      error = String(err);
      status = 'Error during render';
      console.error('Render error:', err);
    } finally {
      isLoading = false;
    }
  }

  async function renderBulk() {
    if (isLoading) return;
    isLoading = true;
    error = '';
    bulkResults = [];
    bulkStats = null;

    try {
      // Get a diverse sample of pictographs
      const sampleSize = Math.min(BULK_COUNT, allPictographs.length);
      const step = Math.floor(allPictographs.length / sampleSize);
      const samples: PictographData[] = [];
      for (let i = 0; i < sampleSize; i++) {
        samples.push(allPictographs[i * step]!);
      }

      bulkTotal = samples.length;
      bulkProgress = 0;

      const renderer = new Canvas2DDirectRenderer();
      await renderer.initialize();

      let totalSvgTime = 0;
      let totalCanvasTime = 0;
      const results: BulkRenderResult[] = [];

      for (let i = 0; i < samples.length; i++) {
        const picto = samples[i]!;
        bulkProgress = i + 1;
        status = `Rendering ${i + 1}/${samples.length}: Letter ${picto.letter}...`;

        try {
          // Render SVG
          const svgStart = performance.now();
          const svgString = await renderPictographToSVG(picto, BULK_SIZE, undefined, {
            showTKA: true,
            darkMode: true
          });
          const svgMs = performance.now() - svgStart;
          totalSvgTime += svgMs;

          // Render Canvas 2D
          const canvasStart = performance.now();
          const canvas = await renderer.renderPictograph(picto, {
            size: BULK_SIZE,
            visibility: {
              showTKA: true,
              showReversals: true,
              showNonRadialPoints: false,
              darkMode: true
            }
          });
          const canvasMs = performance.now() - canvasStart;
          totalCanvasTime += canvasMs;

          let canvasDataUrlResult: string;
          if (canvas instanceof OffscreenCanvas) {
            const blob = await canvas.convertToBlob({ type: 'image/png' });
            canvasDataUrlResult = URL.createObjectURL(blob);
          } else {
            canvasDataUrlResult = (canvas as HTMLCanvasElement).toDataURL('image/png');
          }
          results.push({
            pictograph: picto,
            svgDataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString),
            canvasDataUrl: canvasDataUrlResult,
            svgTime: svgMs,
            canvasTime: canvasMs,
            speedup: svgMs / canvasMs
          });

          // Update results incrementally for visual feedback
          bulkResults = [...results];

        } catch (err) {
          console.error(`Error rendering pictograph ${picto.letter}:`, err);
        }
      }

      bulkStats = {
        totalSvgTime,
        totalCanvasTime,
        avgSpeedup: totalSvgTime / totalCanvasTime,
        count: results.length
      };

      status = `Done! Rendered ${results.length} pictographs. Total: SVG ${totalSvgTime.toFixed(0)}ms, Canvas ${totalCanvasTime.toFixed(0)}ms (${(totalSvgTime / totalCanvasTime).toFixed(1)}x faster)`;
      saveState();

    } catch (err) {
      error = String(err);
      status = 'Error during bulk render';
      console.error('Bulk render error:', err);
    } finally {
      isLoading = false;
    }
  }

  async function loadSequencesFromDatabase() {
    status = 'Loading sequences from Firebase...';

    const loader = new PublicSequencesLoader();

    // First get metadata (no steps)
    const metadata = await loader.loadSequenceMetadata();

    // Take up to SEQUENCE_COUNT sequences
    const sequencesToLoad = metadata.slice(0, SEQUENCE_COUNT);

    // Load full data for each sequence (with steps)
    const fullSequences: SequenceData[] = [];
    for (let i = 0; i < sequencesToLoad.length; i++) {
      const seq = sequencesToLoad[i]!;
      status = `Loading sequence ${i + 1}/${sequencesToLoad.length}: ${seq.word}...`;

      const fullData = await loader.loadFullSequenceData(seq.word);
      if (fullData && fullData.steps && fullData.steps.length > 0) {
        fullSequences.push(fullData);
      }
    }

    loadedSequences = fullSequences;
    return fullSequences;
  }

  async function renderSequences() {
    if (isLoading) return;
    isLoading = true;
    error = '';
    sequenceResults = [];
    sequenceStats = null;

    try {
      // Load sequences from Firebase if not already loaded
      let sequences = loadedSequences;
      if (sequences.length === 0) {
        sequences = await loadSequencesFromDatabase();
      }

      if (sequences.length === 0) {
        throw new Error('No sequences with steps found in database. Make sure you have public sequences.');
      }

      const renderer = new Canvas2DDirectRenderer();
      await renderer.initialize();

      let totalSvgTime = 0;
      let totalCanvasTime = 0;
      let totalStepsRendered = 0;
      const results: SequenceRenderResult[] = [];

      sequenceProgress = { current: 0, total: sequences.length, currentSeq: '', currentStep: 0, totalSteps: 0 };

      for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
        const sequence = sequences[seqIdx]!;
        sequenceProgress = {
          ...sequenceProgress,
          current: seqIdx + 1,
          currentSeq: sequence.word,
          currentStep: 0,
          totalSteps: sequence.steps.length
        };
        status = `Rendering sequence ${seqIdx + 1}/${sequences.length}: "${sequence.word}" (${sequence.steps.length} steps)...`;

        const stepResults: SequenceRenderResult['steps'] = [];
        let seqSvgTime = 0;
        let seqCanvasTime = 0;

        for (let stepIdx = 0; stepIdx < sequence.steps.length; stepIdx++) {
          const beat = sequence.steps[stepIdx]!;
          sequenceProgress = { ...sequenceProgress, currentStep: stepIdx + 1 };

          // Convert beat to PictographData format
          // PropType is viewer preference - use STAFF as default for testing
          // Each motion may have its own propType; if not, use default
          const defaultPropType = PropType.STAFF;

          const motionsWithPropType = beat.motions ? {
            left: beat.motions.left ? { ...beat.motions.left, propType: beat.motions.left.propType || defaultPropType } : undefined,
            right: beat.motions.right ? { ...beat.motions.right, propType: beat.motions.right.propType || defaultPropType } : undefined
          } : undefined;

          const pictograph: PictographData = {
            id: `${sequence.id}-beat-${stepIdx}`,
            letter: beat.letter as Letter,
            startPlacement: beat.startPlacement,
            endPlacement: beat.endPlacement,
            gridMode: sequence.gridMode || GridMode.DIAMOND,
            motions: motionsWithPropType || {}
          };

          try {
            // Render SVG
            const svgStart = performance.now();
            const svgString = await renderPictographToSVG(pictograph, BULK_SIZE, undefined, {
              showTKA: true,
              darkMode: true,
              leftPropType: defaultPropType,
              rightPropType: defaultPropType
            });
            const svgMs = performance.now() - svgStart;
            seqSvgTime += svgMs;
            totalSvgTime += svgMs;

            // Render Canvas 2D
            const canvasStart = performance.now();
            const canvas = await renderer.renderPictograph(pictograph, {
              size: BULK_SIZE,
              visibility: {
                showTKA: true,
                showReversals: true,
                showNonRadialPoints: false,
                darkMode: true,
                leftPropType: defaultPropType,
                rightPropType: defaultPropType
              }
            });
            const canvasMs = performance.now() - canvasStart;
            seqCanvasTime += canvasMs;
            totalCanvasTime += canvasMs;

            let stepCanvasDataUrl: string;
            if (canvas instanceof OffscreenCanvas) {
              const blob = await canvas.convertToBlob({ type: 'image/png' });
              stepCanvasDataUrl = URL.createObjectURL(blob);
            } else {
              stepCanvasDataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
            }
            stepResults.push({
              stepIndex: stepIdx,
              letter: beat.letter || '?',
              svgDataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString),
              canvasDataUrl: stepCanvasDataUrl,
              svgTime: svgMs,
              canvasTime: canvasMs,
              speedup: svgMs / canvasMs
            });

            totalStepsRendered++;
          } catch (err) {
            console.error(`Error rendering beat ${stepIdx} of ${sequence.word}:`, err);
          }
        }

        results.push({
          sequence,
          steps: stepResults,
          totalSvgTime: seqSvgTime,
          totalCanvasTime: seqCanvasTime,
          avgSpeedup: seqSvgTime / seqCanvasTime
        });

        // Update results incrementally
        sequenceResults = [...results];
      }

      sequenceStats = {
        totalSequences: results.length,
        totalSteps: totalStepsRendered,
        totalSvgTime,
        totalCanvasTime,
        avgSpeedup: totalSvgTime / totalCanvasTime
      };

      status = `Done! Rendered ${totalStepsRendered} steps from ${results.length} sequences. Total: SVG ${totalSvgTime.toFixed(0)}ms, Canvas ${totalCanvasTime.toFixed(0)}ms (${(totalSvgTime / totalCanvasTime).toFixed(1)}x faster)`;
      saveState();

    } catch (err) {
      error = String(err);
      status = 'Error rendering sequences';
      console.error('Sequence render error:', err);
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Render Comparison Test</title>
</svelte:head>

<div class="container">
  <h1>SVG vs Canvas 2D Render Comparison</h1>
  <p class="subtitle">Using REAL pictograph data from the dataframe ({allPictographs.length} pictographs loaded)</p>

  <div class="mode-tabs">
    <button
      class="tab"
      class:active={mode === 'single'}
      onclick={() => { mode = 'single'; saveState(); }}
    >
      Single Letter
    </button>
    <button
      class="tab"
      class:active={mode === 'bulk'}
      onclick={() => { mode = 'bulk'; saveState(); }}
    >
      Bulk CSV ({BULK_COUNT})
    </button>
    <button
      class="tab"
      class:active={mode === 'sequences'}
      onclick={() => { mode = 'sequences'; saveState(); }}
    >
      Real Sequences ({SEQUENCE_COUNT})
    </button>
  </div>

  <div class="status" class:error={error}>{status}</div>
  {#if error}
    <div class="error-detail">{error}</div>
  {/if}

  {#if mode === 'single'}
    <!-- Single Letter Mode -->
    <div class="controls">
      <label>
        Letter:
        <select bind:value={selectedLetter} disabled={isLoading}>
          {#each availableLetters as letter}
            <option value={letter}>{letter}</option>
          {/each}
        </select>
      </label>

      <button onclick={renderBoth} disabled={isLoading}>
        {isLoading ? 'Rendering...' : 'Render Both Methods'}
      </button>
    </div>

    {#if realPictograph}
      <div class="pictograph-info">
        <strong>Pictograph Data:</strong>
        Letter: {realPictograph.letter} |
        Start: {realPictograph.startPlacement} |
        End: {realPictograph.endPlacement} |
        Blue: {realPictograph.motions?.left?.motionType} ({realPictograph.motions?.left?.turns} turns) |
        Red: {realPictograph.motions?.right?.motionType} ({realPictograph.motions?.right?.turns} turns)
      </div>
    {/if}

    <div class="comparison">
      <div class="render-box">
        <h2>SVG Render (Reference)</h2>
        <div class="render-container">
          {#if svgDataUrl}
            <img src={svgDataUrl} alt="SVG Render" width={SIZE} height={SIZE} />
          {:else}
            <div class="placeholder">Click "Render Both Methods"</div>
          {/if}
        </div>
        {#if svgTime > 0}
          <div class="timing">Time: {svgTime.toFixed(1)}ms</div>
        {/if}
      </div>

      <div class="render-box">
        <h2>Canvas 2D Render</h2>
        <div class="render-container">
          {#if canvasDataUrl}
            <img src={canvasDataUrl} alt="Canvas 2D Render" width={SIZE} height={SIZE} />
          {:else}
            <div class="placeholder">Click "Render Both Methods"</div>
          {/if}
        </div>
        {#if canvasTime > 0}
          <div class="timing">Time: {canvasTime.toFixed(1)}ms</div>
        {/if}
      </div>

      <div class="render-box">
        <h2>Live SVG Component</h2>
        <div class="render-container">
          {#if realPictograph}
            <div style="width: {SIZE}px; height: {SIZE}px;">
              <PictographContainer
                pictographData={realPictograph}
                showTKA={true}
                darkMode={true}
              />
            </div>
          {:else}
            <div class="placeholder">Load a pictograph first</div>
          {/if}
        </div>
        <div class="timing">Live render (reference)</div>
      </div>
    </div>

    <div class="checklist">
      <h3>Visual Comparison Checklist</h3>
      <ul>
        <li><strong>Arrows:</strong> Should appear with correct rotation and position</li>
        <li><strong>Props:</strong> Should match positions exactly</li>
        <li><strong>Grid:</strong> Should be visible with correct mode</li>
        <li><strong>TKA Letter:</strong> Bottom-left corner</li>
        <li><strong>Turn Numbers:</strong> To the RIGHT of the letter (NOT left/right sides of pictograph!)</li>
        <li><strong>Direction Dot:</strong> Above or below letter (same/opp)</li>
      </ul>
    </div>

  {:else if mode === 'bulk'}
    <!-- Bulk Compare Mode -->
    <div class="controls">
      <button onclick={renderBulk} disabled={isLoading}>
        {isLoading ? `Rendering ${bulkProgress}/${bulkTotal}...` : `Render ${BULK_COUNT} Pictographs`}
      </button>

      {#if isLoading}
        <div class="progress-bar">
          <div class="progress-fill" style="width: {(bulkProgress / bulkTotal) * 100}%"></div>
        </div>
      {/if}
    </div>

    {#if bulkStats}
      <div class="stats-summary">
        <h3>Performance Summary</h3>
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-value">{bulkStats.count}</span>
            <span class="stat-label">Pictographs</span>
          </div>
          <div class="stat">
            <span class="stat-value">{bulkStats.totalSvgTime.toFixed(0)}ms</span>
            <span class="stat-label">Total SVG Time</span>
          </div>
          <div class="stat">
            <span class="stat-value">{bulkStats.totalCanvasTime.toFixed(0)}ms</span>
            <span class="stat-label">Total Canvas Time</span>
          </div>
          <div class="stat highlight">
            <span class="stat-value">{bulkStats.avgSpeedup.toFixed(1)}x</span>
            <span class="stat-label">Average Speedup</span>
          </div>
        </div>
      </div>
    {/if}

    <div class="bulk-grid">
      {#each bulkResults as result, i}
        <div class="bulk-item">
          <div class="bulk-header">
            <span class="bulk-letter">{result.pictograph.letter}</span>
            <span class="bulk-speedup">{result.speedup.toFixed(1)}x</span>
          </div>
          <div class="bulk-comparison">
            <div class="bulk-render">
              <img src={result.svgDataUrl} alt="SVG" width={BULK_SIZE} height={BULK_SIZE} />
              <span class="bulk-label">SVG ({result.svgTime.toFixed(0)}ms)</span>
            </div>
            <div class="bulk-render">
              <img src={result.canvasDataUrl} alt="Canvas" width={BULK_SIZE} height={BULK_SIZE} />
              <span class="bulk-label">Canvas ({result.canvasTime.toFixed(0)}ms)</span>
            </div>
          </div>
          <div class="bulk-info">
            {result.pictograph.startPlacement} → {result.pictograph.endPlacement}
          </div>
        </div>
      {/each}
    </div>

    {#if bulkResults.length === 0 && !isLoading}
      <div class="empty-state">
        Click "Render {BULK_COUNT} Pictographs" to compare renders side-by-side
      </div>
    {/if}

  {:else}
    <!-- Sequences Mode -->
    <div class="controls">
      <button onclick={renderSequences} disabled={isLoading}>
        {isLoading
          ? `Rendering seq ${sequenceProgress.current}/${sequenceProgress.total} (step ${sequenceProgress.currentStep}/${sequenceProgress.totalSteps})...`
          : `Render ${SEQUENCE_COUNT} Real Sequences`}
      </button>

      {#if isLoading && sequenceProgress.total > 0}
        <div class="progress-info">
          <span class="current-sequence">{sequenceProgress.currentSeq}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {(sequenceProgress.current / sequenceProgress.total) * 100}%"></div>
        </div>
      {/if}
    </div>

    {#if sequenceStats}
      <div class="stats-summary">
        <h3>Performance Summary - Real Database Sequences</h3>
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-value">{sequenceStats.totalSequences}</span>
            <span class="stat-label">Sequences</span>
          </div>
          <div class="stat">
            <span class="stat-value">{sequenceStats.totalSteps}</span>
            <span class="stat-label">Total Steps</span>
          </div>
          <div class="stat">
            <span class="stat-value">{sequenceStats.totalSvgTime.toFixed(0)}ms</span>
            <span class="stat-label">Total SVG Time</span>
          </div>
          <div class="stat">
            <span class="stat-value">{sequenceStats.totalCanvasTime.toFixed(0)}ms</span>
            <span class="stat-label">Total Canvas Time</span>
          </div>
          <div class="stat highlight">
            <span class="stat-value">{sequenceStats.avgSpeedup.toFixed(1)}x</span>
            <span class="stat-label">Average Speedup</span>
          </div>
        </div>
      </div>
    {/if}

    <div class="sequence-list">
      {#each sequenceResults as result, seqIdx}
        <div class="sequence-item">
          <div class="sequence-header">
            <span class="sequence-word">{result.sequence.word}</span>
            <span class="sequence-meta">
              {result.steps.length} steps |
              SVG: {result.totalSvgTime.toFixed(0)}ms |
              Canvas: {result.totalCanvasTime.toFixed(0)}ms |
              <span class="speedup">{result.avgSpeedup.toFixed(1)}x faster</span>
            </span>
          </div>
          <div class="steps-grid">
            {#each result.steps as beat, stepIdx}
              <div class="beat-item">
                <div class="beat-header">
                  <span class="beat-number">Step {beat.stepIndex + 1}</span>
                  <span class="beat-letter">{beat.letter}</span>
                  <span class="beat-speedup">{beat.speedup.toFixed(1)}x</span>
                </div>
                <div class="beat-comparison">
                  <div class="beat-render">
                    <img src={beat.svgDataUrl} alt="SVG" width={BULK_SIZE} height={BULK_SIZE} />
                    <span class="beat-label">SVG</span>
                  </div>
                  <div class="beat-render">
                    <img src={beat.canvasDataUrl} alt="Canvas" width={BULK_SIZE} height={BULK_SIZE} />
                    <span class="beat-label">Canvas</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    {#if sequenceResults.length === 0 && !isLoading}
      <div class="empty-state">
        <p>Click "Render {SEQUENCE_COUNT} Real Sequences" to load and render actual sequences from Firebase.</p>
        <p class="info-text">This will load public sequences from the database, extract each step, and render them using both SVG and Canvas 2D methods for comparison.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .container {
    padding: 20px;
    background: #1a1a2e;
    color: white;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin: 0 0 5px 0;
  }

  .subtitle {
    color: #888;
    margin: 0 0 20px 0;
  }

  .mode-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 20px;
  }

  .tab {
    padding: 12px 24px;
    font-size: 14px;
    background: #2a2a4e;
    color: #888;
    border: 1px solid #444;
    cursor: pointer;
  }

  .tab:first-child {
    border-radius: 4px 0 0 4px;
  }

  .tab:last-child {
    border-radius: 0 4px 4px 0;
    border-left: none;
  }

  .tab.active {
    background: #4c6ef5;
    color: white;
    border-color: #4c6ef5;
  }

  .controls {
    display: flex;
    gap: 15px;
    align-items: center;
    margin-bottom: 15px;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  select {
    padding: 8px 12px;
    font-size: 16px;
    border-radius: 4px;
    background: #2a2a4e;
    color: white;
    border: 1px solid #444;
  }

  button {
    padding: 10px 20px;
    font-size: 16px;
    background: #4c6ef5;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #364fc7;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: #2a2a4e;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #51cf66;
    transition: width var(--duration-normal) ease;
  }

  .status {
    padding: 10px 15px;
    background: #1e1e3f;
    border-radius: 4px;
    margin-bottom: 15px;
  }

  .status.error {
    background: #3f1e1e;
    color: #ff6b6b;
  }

  .error-detail {
    padding: 10px 15px;
    background: #3f1e1e;
    color: #ff6b6b;
    border-radius: 4px;
    margin-bottom: 15px;
    font-family: monospace;
    font-size: 12px;
  }

  .pictograph-info {
    padding: 10px 15px;
    background: #1e3f1e;
    color: #51cf66;
    border-radius: 4px;
    margin-bottom: 15px;
    font-size: 13px;
  }

  .comparison {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .render-box {
    border: 2px solid #333;
    padding: 15px;
    border-radius: 8px;
    background: #0a0a0f;
  }

  .render-box h2 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: #ccc;
  }

  .render-container {
    width: 300px;
    height: 300px;
    border: 1px solid #444;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0f;
  }

  .render-container img {
    display: block;
  }

  .placeholder {
    color: #666;
    font-size: 14px;
  }

  .timing {
    margin-top: 10px;
    font-size: 12px;
    color: #888;
  }

  .checklist {
    margin-top: 30px;
    padding: 15px;
    background: #1e1e3f;
    border-radius: 8px;
  }

  .checklist h3 {
    margin: 0 0 10px 0;
  }

  .checklist ul {
    margin: 0;
    padding-left: 20px;
  }

  .checklist li {
    margin: 5px 0;
    line-height: 1.5;
  }

  /* Bulk Mode Styles */
  .stats-summary {
    background: #1e1e3f;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .stats-summary h3 {
    margin: 0 0 15px 0;
  }

  .stats-grid {
    display: flex;
    gap: 30px;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-value {
    font-size: 28px;
    font-weight: bold;
    color: #fff;
  }

  .stat-label {
    font-size: 12px;
    color: #888;
    margin-top: 4px;
  }

  .stat.highlight .stat-value {
    color: #51cf66;
  }

  /* Bulk grid styles - :global() because Svelte doesn't detect usage inside #each */
  :global(.bulk-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 15px;
  }

  :global(.bulk-item) {
    background: #0a0a0f;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 12px;
  }

  :global(.bulk-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  :global(.bulk-letter) {
    font-size: 18px;
    font-weight: bold;
    color: #4c6ef5;
  }

  :global(.bulk-speedup) {
    font-size: 14px;
    color: #51cf66;
    font-weight: bold;
  }

  :global(.bulk-comparison) {
    display: flex;
    gap: 10px;
  }

  :global(.bulk-render) {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  :global(.bulk-render img) {
    border: 1px solid #444;
    display: block;
  }

  :global(.bulk-label) {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
  }

  :global(.bulk-info) {
    font-size: 11px;
    color: #666;
    margin-top: 8px;
    text-align: center;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #666;
    font-size: 16px;
  }

  .empty-state p {
    margin: 8px 0;
  }

  .info-text {
    font-size: 14px;
    color: #555;
  }

  .progress-info {
    color: #888;
    font-size: 14px;
  }

  .current-sequence {
    color: #4c6ef5;
    font-weight: bold;
  }

  /* Sequences Mode Styles */
  .sequence-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .sequence-item {
    background: #0a0a0f;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 15px;
  }

  .sequence-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
  }

  .sequence-word {
    font-size: 20px;
    font-weight: bold;
    color: #4c6ef5;
    text-transform: uppercase;
  }

  .sequence-meta {
    font-size: 12px;
    color: #888;
  }

  .sequence-meta .speedup {
    color: #51cf66;
    font-weight: bold;
  }

  .steps-grid {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 10px;
  }

  .beat-item {
    flex-shrink: 0;
    background: #1e1e3f;
    border-radius: 6px;
    padding: 10px;
  }

  .beat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
  }

  .beat-number {
    color: #888;
  }

  .beat-letter {
    font-weight: bold;
    color: #fff;
    font-size: 14px;
  }

  .beat-speedup {
    color: #51cf66;
    font-weight: bold;
  }

  .beat-comparison {
    display: flex;
    gap: 8px;
  }

  .beat-render {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .beat-render img {
    border: 1px solid #444;
    display: block;
  }

  /* Tab styling for 3 tabs */
  .tab:nth-child(2) {
    border-radius: 0;
    border-left: none;
  }

  .tab:last-child {
    border-left: none;
  }
</style>
