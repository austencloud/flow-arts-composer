import { browser } from '$app/env';
import { FilterPersister, type IFilterPersister } from './services/filter-persister';

let instance: IFilterPersister | null = null;

export function getFilterPersister(): IFilterPersister {
	if (!browser) throw new Error('getFilterPersister() is browser-only');
	return instance ??= new FilterPersister();
}
