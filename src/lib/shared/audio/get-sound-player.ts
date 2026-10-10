import { browser } from '$app/env';

import { SoundPlayer } from './services/sound-player';

let instance: SoundPlayer | null = null;

export function getSoundPlayer(): SoundPlayer {
	if (!browser) throw new Error('getSoundPlayer() is browser-only');
	return instance ??= new SoundPlayer();
}
