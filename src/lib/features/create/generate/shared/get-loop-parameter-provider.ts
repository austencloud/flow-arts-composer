import { browser } from '$app/env';
import { LOOPParameterProvider } from './services/loop-parameter-provider';
import { getPictographFilter } from './get-pictograph-filter';

let instance: LOOPParameterProvider | null = null;

export function getLOOPParameterProvider(): LOOPParameterProvider {
	if (!browser) throw new Error('getLOOPParameterProvider() is browser-only');
	return instance ??= new LOOPParameterProvider(getPictographFilter());
}
