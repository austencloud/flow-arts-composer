import { browser } from '$app/env';
import { TrainingDataPersister } from './services/training-data-persister';

let instance: TrainingDataPersister | null = null;

export function getTrainingDataPersister(): TrainingDataPersister {
	if (!browser) throw new Error('getTrainingDataPersister() is browser-only');
	return instance ??= new TrainingDataPersister();
}
