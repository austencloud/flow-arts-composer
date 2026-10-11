import { browser } from '$app/env';

import { TurnAllocator } from './services/turn-allocator';
import { getLOOPParameterProvider } from './get-loop-parameter-provider';

let instance: TurnAllocator | null = null;

export function getTurnAllocator(): TurnAllocator {
	if (!browser) throw new Error('getTurnAllocator() is browser-only');
	return instance ??= new TurnAllocator(getLOOPParameterProvider());
}
