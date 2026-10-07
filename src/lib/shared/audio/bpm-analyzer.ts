/**
 * BPM Analyzer Utility
 *
 * Wraps realtime-bpm-analyzer for detecting BPM from audio files.
 * Uses section-based analysis to handle songs with intros/outros that lack steps.
 */

// Dynamic import: this browser-only package has a broken dist layout (nested dist/dist/)
// that prevents Vite's SSR resolver from finding the entry point at build time.
async function getAnalyzeFullBuffer() {
  const mod = await import("realtime-bpm-analyzer");
  return mod.analyzeFullBuffer;
}

export interface BpmResult {
  bpm: number;
  confidence: number;
  /** Which section of the song had the best beat detection */
  bestSectionStart?: number;
  /** Whether this is a low-confidence estimate */
  isUncertain?: boolean;
}

interface SectionResult {
  bpm: number;
  confidence: number;
  startTime: number;
  endTime: number;
}

/**
 * Analyze an audio file to detect its BPM using section-based analysis.
 * Splits the audio into sections and finds the one with clearest steps.
 * This handles songs with intros/outros that don't have clear rhythm.
 *
 * @param audioUrl - URL or blob URL of the audio file
 * @param onProgress - Optional callback for progress updates
 * @returns Promise with detected BPM and confidence
 */
export async function analyzeAudioBpm(
  audioUrl: string,
  onProgress?: (progress: number) => void
): Promise<BpmResult> {
  const audioContext = new AudioContext();

  try {
    // Fetch and decode the audio
    onProgress?.(0.05);
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();

    onProgress?.(0.15);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;

    // For short audio (<30s), analyze the whole thing
    if (duration < 30) {
      onProgress?.(0.5);
      return await analyzeSection(
        audioBuffer,
        0,
        duration,
        audioContext,
        sampleRate
      );
    }

    // For longer audio, analyze in sections and find the best one
    // Section size: 20 seconds with 10 second overlap
    const SECTION_SIZE = 20;
    const SECTION_STEP = 10;
    const sections: SectionResult[] = [];

    // Skip first 5 seconds (likely intro) and last 5 seconds (likely outro)
    const startOffset = Math.min(5, duration * 0.1);
    const endOffset = Math.max(duration - 5, duration * 0.9);

    let currentStart = startOffset;
    let sectionIndex = 0;
    const totalSections =
      Math.ceil((endOffset - startOffset - SECTION_SIZE) / SECTION_STEP) + 1;

    while (currentStart + SECTION_SIZE <= endOffset) {
      const sectionEnd = Math.min(currentStart + SECTION_SIZE, endOffset);

      // Extract section from audio buffer
      const sectionBuffer = extractSection(
        audioBuffer,
        currentStart,
        sectionEnd,
        audioContext
      );

      onProgress?.(0.2 + (0.6 * sectionIndex) / totalSections);

      try {
        const result = await analyzeSection(
          sectionBuffer,
          currentStart,
          sectionEnd,
          audioContext,
          sampleRate
        );
        sections.push({
          bpm: result.bpm,
          confidence: result.confidence,
          startTime: currentStart,
          endTime: sectionEnd,
        });
      } catch {
        // Skip failed sections
      }

      currentStart += SECTION_STEP;
      sectionIndex++;
    }

    onProgress?.(0.9);

    // Find section with highest confidence
    if (sections.length === 0) {
      // Fallback: analyze whole buffer
      return await analyzeSection(
        audioBuffer,
        0,
        duration,
        audioContext,
        sampleRate
      );
    }

    // Sort by confidence descending
    sections.sort((a, b) => b.confidence - a.confidence);
    const best = sections[0]!;

    // Check if multiple sections agree on BPM (increases confidence)
    const bpmCounts = new Map<number, number>();
    for (const section of sections) {
      // Group similar BPMs (within 2 BPM)
      const roundedBpm = Math.round(section.bpm / 2) * 2;
      bpmCounts.set(roundedBpm, (bpmCounts.get(roundedBpm) ?? 0) + 1);
    }

    // Find most common BPM
    let mostCommonBpm = best.bpm;
    let maxCount = 0;
    for (const [bpm, count] of bpmCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonBpm = bpm;
      }
    }

    // Boost confidence if multiple sections agree
    const agreementBoost = maxCount > 1 ? Math.min(0.3, maxCount * 0.1) : 0;
    const finalConfidence = Math.min(1, best.confidence + agreementBoost);

    onProgress?.(1.0);

    return {
      bpm: mostCommonBpm,
      confidence: finalConfidence,
      bestSectionStart: best.startTime,
      isUncertain: finalConfidence < 0.5,
    };
  } finally {
    await audioContext.close();
  }
}

/**
 * Extract a section of an audio buffer
 */
function extractSection(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number,
  audioContext: AudioContext
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const length = endSample - startSample;

  const sectionBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    length,
    sampleRate
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const destData = sectionBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      destData[i] = sourceData[startSample + i] ?? 0;
    }
  }

  return sectionBuffer;
}

/**
 * Analyze a single audio section for BPM
 */
async function analyzeSection(
  audioBuffer: AudioBuffer,
  startTime: number,
  _endTime: number,
  _audioContext: AudioContext,
  _sampleRate: number
): Promise<BpmResult> {
  const analyzeFullBuffer = await getAnalyzeFullBuffer();
  const result = await analyzeFullBuffer(audioBuffer, {
    frequencyValue: 150,
    qualityValue: 1,
  });

  if (result && result.length > 0) {
    const bestResult = result[0];
    const maxExpectedCount = 100;
    const normalizedConfidence = Math.min(
      1,
      (bestResult?.count ?? 0) / maxExpectedCount
    );

    return {
      bpm: Math.round(bestResult?.tempo ?? 120),
      confidence: normalizedConfidence,
      bestSectionStart: startTime,
      isUncertain: normalizedConfidence < 0.5,
    };
  }

  return { bpm: 120, confidence: 0, isUncertain: true };
}

/**
 * Generate beat timestamps based on BPM and duration.
 * @param bpm - Beats per minute
 * @param duration - Audio duration in seconds
 * @param offset - Optional offset for first beat in seconds
 * @returns Array of beat timestamps in seconds
 */
export function generateStepTimestamps(
  bpm: number,
  duration: number,
  offset: number = 0
): number[] {
  const beatInterval = 60 / bpm; // seconds per beat
  const timestamps: number[] = [];

  let time = offset;
  while (time <= duration) {
    timestamps.push(time);
    time += beatInterval;
  }

  return timestamps;
}
