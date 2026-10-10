/**
 * Write Module Types
 *
 * Types for the Act creation and choreography writing features.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Sequence placement within an act
 */
export interface ActSequence {
  id: string;
  sequenceData: SequenceData;
  startTime: number; // ms from act start
  duration: number; // ms
  row: number; // Grid row position
}

/**
 * Act data structure
 */
export interface ActData {
  id: string;
  name: string;
  description?: string;
  sequences: ActSequence[];
  duration: number; // Total duration in ms
  bpm?: number;
  musicUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Thumbnail info for act browser
 */
export interface ActThumbnailInfo {
  id: string;
  name: string;
  description?: string;
  filePath?: string;
  sequenceCount: number;
  hasMusic: boolean;
  thumbnailUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
  /** Last modification time (alias for updatedAt) */
  lastModified?: Date;
}

/**
 * Music player state
 */
export interface MusicPlayerState {
  isPlaying: boolean;
  currentTime: number; // ms
  duration: number; // ms
  volume: number; // 0-1
  isMuted: boolean;
  isLoading: boolean;
  isLoaded: boolean;
  filename?: string;
  error: string | null;
}

export function createDefaultMusicPlayerState(): MusicPlayerState {
  return {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isLoading: false,
    isLoaded: false,
    filename: undefined,
    error: null,
  };
}

export function createEmptyAct(name: string = "Untitled Act"): ActData {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name,
    sequences: [],
    duration: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a placeholder thumbnail for a sequence
 * (stub implementation - actual rendering handled by thumbnail services)
 *
 * Synchronous by design: returns null when no precomputed thumbnail exists so
 * callers can use it directly inside a `$derived` without resolving a Promise.
 */
export function generateSequenceThumbnail(
  _sequence: SequenceData
): string | null {
  // Return null to use default thumbnail rendering
  return null;
}

/**
 * Format time in milliseconds to MM:SS display
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
