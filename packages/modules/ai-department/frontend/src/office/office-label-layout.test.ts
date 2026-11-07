import { describe, expect, it } from 'vitest';
import { placeOfficeLabels } from './office-label-layout';

describe('placeOfficeLabels', () => {
	it('moves overlapping labels into separate rows', () => {
		const positions = new Map([
			['a', { x: 100, y: 120, visible: true }],
			['b', { x: 101, y: 120, visible: true }],
		]);
		const sizes = new Map([
			['a', { width: 100, height: 20 }],
			['b', { width: 100, height: 20 }],
		]);

		const result = placeOfficeLabels(positions, sizes, null, { width: 300, height: 200 }, 4);

		expect(result.get('a')?.visible).toBe(true);
		expect(result.get('b')?.visible).toBe(true);
		expect(result.get('a')?.y).not.toBe(result.get('b')?.y);
	});

	it('places the selected member first and hides labels outside the view', () => {
		const positions = new Map([
			['a', { x: 100, y: 120, visible: true }],
			['selected', { x: 101, y: 120, visible: true }],
			['outside', { x: 100, y: 500, visible: true }],
		]);
		const sizes = new Map([
			['a', { width: 100, height: 20 }],
			['selected', { width: 100, height: 20 }],
			['outside', { width: 100, height: 20 }],
		]);

		const result = placeOfficeLabels(positions, sizes, 'selected', { width: 300, height: 200 }, 4);

		expect(result.get('selected')?.y).toBe(120);
		expect(result.get('a')?.y).not.toBe(result.get('selected')?.y);
		expect(result.get('outside')?.visible).toBe(false);
	});
});
