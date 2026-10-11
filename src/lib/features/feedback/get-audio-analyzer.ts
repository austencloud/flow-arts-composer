import { browser } from '$app/env';
import { AudioAnalyzer } from './services/audio-analyzer';

let instance: AudioAnalyzer | null = null;

export function getAudioAnalyzer(): AudioAnalyzer {
	if (!browser) throw new Error('getAudioAnalyzer() is browser-only');
	return instance ??= new AudioAnalyzer();
}
