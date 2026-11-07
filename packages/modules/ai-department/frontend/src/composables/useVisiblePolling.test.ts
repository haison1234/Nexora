import { defineComponent, h } from 'vue';
import { render } from '@testing-library/vue';

import { useVisiblePolling } from './useVisiblePolling';

describe('useVisiblePolling', () => {
	const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		if (visibilityDescriptor) {
			Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
		}
	});

	it('skips hidden ticks and refreshes when the page becomes visible', async () => {
		const task = vi.fn();
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
		const Harness = defineComponent({
			setup() {
				useVisiblePolling(task, 1000);
				return () => h('div');
			},
		});
		const { unmount } = render(Harness);

		await vi.advanceTimersByTimeAsync(1000);
		expect(task).not.toHaveBeenCalled();

		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			value: 'visible',
		});
		document.dispatchEvent(new Event('visibilitychange'));
		expect(task).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(2);
		unmount();
	});
});
