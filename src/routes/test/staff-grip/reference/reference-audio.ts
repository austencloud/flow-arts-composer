/**
 * The opening seconds of a video's sound as one mono channel, for the clap
 * finder. Null when the browser cannot decode the file's audio or it has none.
 */
export interface DecodedOpening {
  samples: Float32Array;
  sampleRate: number;
}

export async function decodeOpeningAudio(
  file: Blob,
  seconds = 20
): Promise<DecodedOpening | null> {
  if (typeof AudioContext === "undefined") return null;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const length = Math.min(
      buffer.length,
      Math.round(seconds * buffer.sampleRate)
    );
    const samples = new Float32Array(length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1)
        samples[i]! += data[i]! / buffer.numberOfChannels;
    }
    return { samples, sampleRate: buffer.sampleRate };
  } catch {
    return null;
  } finally {
    void context.close();
  }
}
