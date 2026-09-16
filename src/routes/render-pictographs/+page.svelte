<script lang="ts">
  import { onMount } from 'svelte';
  import { canvas2DDirectRenderer, type Canvas2DDirectRenderer } from '$lib/shared/render/services/canvas-2d-direct-renderer';

  let status = $state('Initializing...');
  let renderer: Canvas2DDirectRenderer | null = null;
  let csvData: string | null = null;

  async function initialize() {
    try {
      status = 'Loading renderer...';

      // Use direct import (avoids DI container rebuilds)
      renderer = canvas2DDirectRenderer;
      await renderer.initialize();

      status = 'Loading pictograph data...';

      // Load pictograph data from CSV
      const csvPath = '/data/pictographs/DiamondPictographDataframe.csv';
      const response = await fetch(csvPath);
      csvData = await response.text();

      status = 'Ready';

      // Expose render function globally for Playwright script
      (window as any).renderPictograph = async (letter: string): Promise<string> => {
        if (!renderer || !csvData) {
          throw new Error('Renderer not initialized');
        }

        // Parse CSV to find the letter
        const lines = csvData.split('\n');
        const headerLine = lines[0];
        if (!headerLine) {
          throw new Error('CSV header not found');
        }
        const headers = headerLine.split(',');
        let row: string[] | null = null;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const r = line.split(',');
          if (r[0] === letter) {
            row = r;
            break;
          }
        }

        if (!row) {
          throw new Error(`No data found for letter ${letter}`);
        }

        // Create PictographData object from CSV
        const pictographData = {
          id: `pictograph-${letter}`,
          letter: letter,
          motions: {
            left: {
              motionType: row[headers.indexOf('blueMotionType')],
              rotationDirection: row[headers.indexOf('blueRotationDirection')],
              startLocation: row[headers.indexOf('blueStartLocation')],
              endLocation: row[headers.indexOf('blueEndLocation')],
              startOrientation: 'in',
              endOrientation: 'in',
              turns: 1,
              propType: 'staff',
              propPlacementData: {
                propType: 'staff'
              }
            },
            right: {
              motionType: row[headers.indexOf('redMotionType')],
              rotationDirection: row[headers.indexOf('redRotationDirection')],
              startLocation: row[headers.indexOf('redStartLocation')],
              endLocation: row[headers.indexOf('redEndLocation')],
              startOrientation: 'in',
              endOrientation: 'in',
              turns: 1,
              propType: 'staff',
              propPlacementData: {
                propType: 'staff'
              }
            }
          }
        };

        // Render using the REAL Canvas2DDirectRenderer
        const canvas = await renderer.renderPictograph(pictographData as any, {
          size: 950,
          visibility: {
            showGrid: true,
            showTKA: true,
            showTnD: false,
            showElemental: false,
            showPlacements: false,
            showReversals: false,
            showNonRadialPoints: false,
            darkMode: false, // Light background
            handPointVisibility: 'active',
          }
        });

        // Return as base64 data URL
        if (canvas instanceof OffscreenCanvas) {
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          return URL.createObjectURL(blob);
        }
        return (canvas as HTMLCanvasElement).toDataURL('image/png');
      };

      console.log('✅ Renderer ready. window.renderPictograph() is available.');

    } catch (error) {
      status = `Error: ${error instanceof Error ? error.message : String(error)}`;
      console.error('Initialization error:', error);
    }
  }

  onMount(() => {
    initialize();
  });
</script>

<div class="render-page">
  <h1>Pictograph Renderer</h1>
  <div class="status">Status: {status}</div>

  <div class="instructions">
    <p>This page exposes <code>window.renderPictograph(letter)</code> for automated rendering.</p>
    <p>Used by: <code>scripts/generate-pictographs.js</code></p>
  </div>
</div>

<style>
  .render-page {
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
    font-family: system-ui, sans-serif;
  }

  h1 {
    font-size: 24px;
    margin-bottom: 20px;
  }

  .status {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 20px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
  }

  .instructions {
    font-size: 14px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
  }

  .instructions code {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
  }
</style>
