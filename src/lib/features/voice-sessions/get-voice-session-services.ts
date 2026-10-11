import { VoiceSessionRecorder } from '#lib/shared/voice-control/services/voice-session-recorder.js';
import * as voiceSessionFormatter from './services/voice-session-formatter';
import * as voiceSessionRepository from '#lib/shared/voice-sessions/services/voice-session-repository.js';
import * as voiceSessionAnalyzer from './services/voice-session-analyzer';
import { VoiceSessionReplayer } from './services/voice-session-replayer';
import * as tierPromotionEngine from './services/tier-promotion-engine';
import { getCommandInterpreter } from '#lib/shared/voice-control/get-voice-control-services.js';

let voiceSessionRecorder: VoiceSessionRecorder | null = null;
let voiceSessionReplayer: VoiceSessionReplayer | null = null;

export function getVoiceSessionRecorder(): VoiceSessionRecorder {
  return voiceSessionRecorder ??= new VoiceSessionRecorder();
}

export function getVoiceSessionFormatter(): typeof voiceSessionFormatter {
  return voiceSessionFormatter;
}

export function getVoiceSessionRepository(): typeof voiceSessionRepository {
  return voiceSessionRepository;
}

export function getVoiceSessionAnalyzer(): typeof voiceSessionAnalyzer {
  return voiceSessionAnalyzer;
}

export function getVoiceSessionReplayer(): VoiceSessionReplayer {
  return voiceSessionReplayer ??= new VoiceSessionReplayer(getCommandInterpreter());
}

export function getTierPromotionEngine(): typeof tierPromotionEngine {
  return tierPromotionEngine;
}
