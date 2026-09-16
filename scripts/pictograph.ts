#!/usr/bin/env tsx
/**
 * Standalone Pictograph CLI
 *
 * Renders pictographs using the real Canvas2DDirectRenderer in Node.js
 * No browser, no auth, no dev server required
 *
 * Usage:
 *   npm run pictograph A
 *   npm run pictograph A B C
 *   npm run pictograph --all
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { createCanvas, Canvas as NodeCanvas } from 'canvas';
import { pathToFileURL } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Provide global Canvas for Node.js context
if (typeof global !== 'undefined') {
  (global as any).Canvas = NodeCanvas;
}

const OUTPUT_DIR = path.join(__dirname, '..', 'static', 'images', 'grant-feature');

interface PictographData {
  id: string;
  letter: string;
  motions: {
    left: MotionData;
    right: MotionData;
  };
}

interface MotionData {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  startOrientation: string;
  endOrientation: string;
  turns: number;
  propType: string;
  propPlacementData: {
    propType: string;
  };
}

async function loadPictographData(letter: string): Promise<PictographData> {
  const csvPath = path.join(__dirname, '..', 'static', 'data', 'pictographs', 'DiamondPictographDataframe.csv');
  const csvData = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvData.split('\n');
  const headers = lines[0].split(',');

  let row: string[] | null = null;
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split(',');
    if (r[0] === letter) {
      row = r;
      break;
    }
  }

  if (!row) {
    throw new Error(`No data found for letter ${letter}`);
  }

  return {
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
}

async function renderPictograph(letter: string): Promise<string> {
  console.log(`\n🎨 Rendering pictograph ${letter}...`);

  // Load pictograph data
  const pictographData = await loadPictographData(letter);
  console.log(`  ✓ Loaded data`);

  // Import minimal Node.js render container (avoids SvelteKit-specific dependencies)
  const containerPath = path.join(__dirname, 'render-container-node.ts');
  const { nodeContainer } = await import(pathToFileURL(containerPath).href);
  console.log(`  ✓ Loaded render container`);

  // Get Canvas2DDirectRenderer from container
  const renderer = nodeContainer.items.canvas2DRenderer;
  await renderer.initialize();
  console.log(`  ✓ Initialized renderer`);

  // Render using real Canvas2DDirectRenderer
  const canvas = await renderer.renderPictograph(pictographData as any, {
    size: 950,
    showGrid: true,
    showTKA: true,
    showTND: false,
    showElemental: false,
    showPlacements: false,
    showReversals: false,
    showNonRadialPoints: false,
    darkMode: false,
    handPointVisibility: 'active',
  });

  console.log(`  ✓ Rendered (${canvas.width}x${canvas.height})`);

  // Save to file
  const buffer = canvas.toBuffer('image/png');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, `pictograph-${letter}.png`);
  fs.writeFileSync(outputPath, buffer);

  console.log(`  ✅ Saved: ${outputPath}`);

  return outputPath;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run pictograph A B C');
    console.log('   Or: npm run pictograph --all');
    process.exit(1);
  }

  let letters = args;

  if (args[0] === '--all') {
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  TKA Pictograph CLI');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\n📝 Generating ${letters.length} pictograph(s)...`);

  const startTime = Date.now();
  const results: { letter: string; success: boolean; path?: string; error?: string }[] = [];

  for (const letter of letters) {
    try {
      const outputPath = await renderPictograph(letter);
      results.push({ letter, success: true, path: outputPath });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed: ${errorMsg}`);
      results.push({ letter, success: false, error: errorMsg });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${letters.length}`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length}`);
    failed.forEach(f => console.log(`  - ${f.letter}: ${f.error}`));
  }

  console.log(`\n⏱️  Total time: ${elapsed}s`);
  console.log(`📁 Output: ${OUTPUT_DIR}\n`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  console.error(error.stack);
  process.exit(1);
});
