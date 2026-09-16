<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { canvas2DDirectRenderer } from '$lib/shared/render/services/canvas-2d-direct-renderer';

  let status = $state('Loading...');

  onMount(async () => {
    const letter = page.url.searchParams.get('letter');

    if (!letter) {
      status = 'Error: No letter specified. Use ?letter=A';
      return;
    }

    try {
      status = `Rendering ${letter}...`;

      // Use direct import (avoids DI container rebuilds)
      const renderer = canvas2DDirectRenderer;
      await renderer.initialize();

      // Load CSV
      const csvPath = '/data/pictographs/DiamondPictographDataframe.csv';
      const response = await fetch(csvPath);
      const csvData = await response.text();
      const lines = csvData.split('\n');
      const headerLine = lines[0];
      if (!headerLine) {
        status = 'Error: CSV header not found';
        return;
      }
      const headers = headerLine.split(',');

      // Find letter
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
        status = `Error: No data for letter ${letter}`;
        return;
      }

      // Create pictograph data
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
            propPlacementData: { propType: 'staff' }
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
            propPlacementData: { propType: 'staff' }
          }
        }
      };

      // Render
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
          darkMode: false,
          handPointVisibility: 'active',
        }
      });

      // Add canvas to page so script can access it
      // renderPictograph returns RenderCanvas; this page runs in the browser
      // where HTMLCanvasElement is always returned, so cast is safe.
      const htmlCanvas = canvas as HTMLCanvasElement;
      htmlCanvas.style.maxWidth = '400px';
      htmlCanvas.style.border = '1px solid #444';
      document.body.appendChild(htmlCanvas);

      status = `✅ Rendered pictograph-${letter}`;

    } catch (error) {
      status = `Error: ${error instanceof Error ? error.message : String(error)}`;
      console.error(error);
    }
  });
</script>

<svelte:head>
  <title>Render Utility</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div style="padding: 40px; font-family: system-ui;">
  <h1>Pictograph Renderer</h1>
  <p>{status}</p>
  <p style="color: var(--theme-text-muted, #666); font-size: 14px;">Usage: /render?letter=A</p>
</div>
