import { browser } from '$app/env';
import { CsvLoader } from './services/data/csv-loader';

let instance: CsvLoader | null = null;

export function getCsvLoader(): CsvLoader {
	if (!browser) throw new Error('getCsvLoader() is browser-only');
	return instance ??= new CsvLoader();
}
