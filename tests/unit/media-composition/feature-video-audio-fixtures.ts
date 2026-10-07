/**
 * Made-up sound for the align-take and command line tests: tone bursts at
 * uneven gaps that never repeat, a camera's quieter copy of them, and WAV
 * bytes to write either to disk.
 */

/** A seeded random source, so every run hears the same music. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short tone bursts at uneven gaps over a quiet floor: music with no repeat. */
export function clickTrack(
  seconds: number,
  rate: number,
  seed = 7
): Float32Array {
  const next = random(seed);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += 1) out[i] = (next() - 0.5) * 0.002;
  for (let at = 0.1; at < seconds - 0.05; at += 0.15 + 0.45 * next()) {
    const start = Math.round(at * rate);
    const length = Math.round(0.03 * rate);
    const level = 0.3 + 0.6 * next();
    for (let i = 0; i < length && start + i < out.length; i += 1)
      out[start + i]! +=
        level * Math.sin((2 * Math.PI * 1000 * i) / rate) * (1 - i / length);
  }
  return out;
}

/** The music from `fromSeconds`, quieter and over room noise, as a camera hears it. */
export function cameraTake(
  music: Float32Array,
  rate: number,
  fromSeconds: number,
  seconds: number
): Float32Array {
  const next = random(99);
  const start = Math.round(fromSeconds * rate);
  return Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) =>
      (start + i >= 0 ? (music[start + i] ?? 0) * 0.3 : 0) +
      (next() - 0.5) * 0.02
  );
}

/** 16-bit mono WAV bytes. */
export function wav(samples: Float32Array, rate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) =>
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      i * 2
    )
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
