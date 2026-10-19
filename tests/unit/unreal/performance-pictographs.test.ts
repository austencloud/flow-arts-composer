import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPictographs, verifyPictographs } from '../../../unreal/Shared/Tools/performance-pictographs.mjs';

const PNG = Buffer.from('89504e470d0a1a0a010203', 'hex');
const hash = 'a'.repeat(64);
const score = {
  id: 'score', word: 'AB', startPlacement: { letter: 'α' },
  steps: [
    { letter: 'A', duration: 2, motions: { left: { motionType: 'pro' }, right: { motionType: 'anti' } } },
    { letter: 'B', duration: 1, motions: { left: { motionType: 'anti' }, right: { motionType: 'pro' } } },
  ],
};
const library = {
  schema: 'tka-performance-library-v1',
  entries: [
    { id: 'x-bot/M_one', sequenceSHA256: hash, sequenceJson: JSON.stringify(score), propFamily: 'staff', scoreUnitsPerSecond: 2, durationSeconds: 1.5 },
    { id: 'x-bot/M_two', sequenceSHA256: hash, sequenceJson: JSON.stringify(score), propFamily: 'staff', scoreUnitsPerSecond: 1, durationSeconds: 3 },
  ],
};

describe('performance pictograph sidecar', () => {
  it('uses exact score motions, excludes untimed start, and shares score images across capture rates', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tka-pictographs-'));
    try {
      const inputs: unknown[] = [];
      const result = await buildPictographs(library, directory, async input => { inputs.push(input); return PNG; });
      expect(result).toMatchObject({ entries: 2, images: 2 });
      expect(inputs).toHaveLength(2);
      expect(inputs[0]).toMatchObject({ letter: 'A', leftMotion: { motionType: 'pro', hand: 'left' }, rightMotion: { motionType: 'anti', hand: 'right' } });
      const manifest = JSON.parse(readFileSync(result.file, 'utf8'));
      expect(manifest.entries[0].steps.map((step: { index: number; startSeconds: number; endSeconds: number }) => [step.index, step.startSeconds, step.endSeconds]))
        .toEqual([[0, 0, 1], [1, 1, 1.5]]);
      expect(manifest.entries[1].steps.map((step: { startSeconds: number; endSeconds: number }) => [step.startSeconds, step.endSeconds]))
        .toEqual([[0, 2], [2, 3]]);
      expect(verifyPictographs(library, directory)).toMatchObject({ entries: 2, images: 2 });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('rejects timing drift and altered image paths or bytes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tka-pictographs-'));
    try {
      await expect(buildPictographs({ ...library, entries: [{ ...library.entries[0], durationSeconds: 2 }] }, directory, async () => PNG))
        .rejects.toThrow('durations differ');
      const result = await buildPictographs(library, directory, async () => PNG);
      const manifest = JSON.parse(readFileSync(result.file, 'utf8'));
      const image = join(directory, ...manifest.entries[0].steps[0].image.split('/'));
      writeFileSync(image, Buffer.from('89504e470d0a1a0a090909', 'hex'));
      expect(() => verifyPictographs(library, directory)).toThrow('hash mismatch');
      manifest.entries[0].steps[0].image = 'Pictographs/../../escape.png';
      writeFileSync(result.file, JSON.stringify(manifest));
      expect(() => verifyPictographs(library, directory)).toThrow('differs from score');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
