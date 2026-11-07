import { STATUS_VISUAL } from './status-visual';

describe('STATUS_VISUAL', () => {
	const entries = Object.entries(STATUS_VISUAL);

	it('gives every status a token color and an icon, so color is never the only signal', () => {
		expect(entries.map(([status]) => status).sort()).toEqual([
			'blocked',
			'idle',
			'queued',
			'review',
			'unavailable',
			'unconfigured',
			'waiting',
			'working',
		]);
		for (const [, visual] of entries) {
			expect(visual.color).toMatch(/^var\(--/);
			expect(visual.icon.length).toBeGreaterThan(0);
		}
	});

	it('draws the states without an executor with a dashed outline', () => {
		expect(STATUS_VISUAL.unconfigured.dashed).toBe(true);
		expect(STATUS_VISUAL.unavailable.dashed).toBe(true);
		expect(STATUS_VISUAL.working.dashed).toBe(false);
	});
});
