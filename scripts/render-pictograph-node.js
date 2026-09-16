#!/usr/bin/env node
/**
 * Render pictograph using Node.js canvas (no browser, no auth required)
 *
 * Usage: node scripts/render-pictograph-node.js A
 */

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const letter = process.argv[2];

if (!letter) {
  console.log('Usage: node scripts/render-pictograph-node.js <letter>');
  console.log('Example: node scripts/render-pictograph-node.js A');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'static', 'images', 'grant-feature');

(async () => {
  try {
    console.log(`Rendering pictograph ${letter}...`);

    // Load CSV data
    const csvPath = path.join(__dirname, '..', 'static', 'data', 'pictographs', 'DiamondPictographDataframe.csv');
    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');

    // Find letter
    let row = null;
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

    // Import the DI container and renderer
    const { container } = await import('../src/lib/shared/inversify/di.ts');
    const { TYPES } = await import('../src/lib/shared/inversify/types/core.types.ts');

    // Get Canvas2DDirectRenderer from DI container
    const renderer = container.get(TYPES.IDirectRenderer);

    // Initialize with Node.js canvas
    // The renderer should work with Node.js canvas since it uses standard Canvas API
    await renderer.initialize();

    // Render the pictograph
    const canvas = await renderer.renderPictograph(pictographData, {
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

    // Save to file
    const buffer = canvas.toBuffer('image/png');

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const outputPath = path.join(OUTPUT_DIR, `pictograph-${letter}.png`);
    fs.writeFileSync(outputPath, buffer);

    console.log(`✅ Rendered: ${outputPath}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
