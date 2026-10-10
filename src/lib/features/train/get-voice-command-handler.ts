import { browser } from '$app/env';
import { VoiceCommandHandler } from './services/voice-command-handler';

let instance: VoiceCommandHandler | null = null;

export function getVoiceCommandHandler(): VoiceCommandHandler {
	if (!browser) throw new Error('getVoiceCommandHandler() is browser-only');
	return instance ??= new VoiceCommandHandler();
}
