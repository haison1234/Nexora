import { onBeforeUnmount, onMounted } from 'vue';

/** Run a task on an interval while the tab is visible. Skips a tick while the last run is pending. */
export function useVisiblePolling(task: () => Promise<void> | void, intervalMs: number) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let pending = false;

	async function tick() {
		if (pending || document.visibilityState !== 'visible') return;
		pending = true;
		try {
			await task();
		} catch {
			// The task reports its own failures. A failed tick must not stop the next one.
		} finally {
			pending = false;
		}
	}

	const onVisible = () => {
		if (document.visibilityState === 'visible') void tick();
	};

	onMounted(() => {
		timer = setInterval(() => {
			void tick();
		}, intervalMs);
		document.addEventListener('visibilitychange', onVisible);
	});

	onBeforeUnmount(() => {
		if (timer) clearInterval(timer);
		document.removeEventListener('visibilitychange', onVisible);
	});
}
