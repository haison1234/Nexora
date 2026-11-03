import { useAiDepartmentStore } from './ai-department.store';

describe('useAiDepartmentStore', () => {
	it('starts not ready and flips once marked', () => {
		const store = useAiDepartmentStore();

		expect(store.isReady).toBe(false);

		store.markReady();

		expect(store.isReady).toBe(true);
	});
});
