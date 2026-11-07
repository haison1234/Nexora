import type { AiDepartmentMemberDto } from '@n8n/api-types';
import {
	clampZoom,
	edgePath,
	fitOrg,
	layoutOrg,
	neighbour,
	ORG_CARD,
	ORG_GAP,
	ORG_ZOOM,
	revealNode,
	zoomAround,
} from './org-layout';
import { buildOrgTree } from './org-tree';

function member(id: string, name: string, managerMemberId: string | null = null) {
	return {
		id,
		projectId: 'p',
		departmentId: 'd',
		name,
		role: 'Role',
		managerMemberId,
		expertiseTags: [],
		archived: false,
		version: 1,
		executionState: 'available',
		createdAt: '',
		updatedAt: '',
	} satisfies AiDepartmentMemberDto;
}

const sample = () =>
	layoutOrg(
		buildOrgTree([
			member('a', 'Ada'),
			member('b', 'Bob', 'a'),
			member('c', 'Cat', 'a'),
			member('d', 'Dan', 'b'),
			member('e', 'Eva', 'b'),
			member('f', 'Fox'),
		]),
	);

describe('layoutOrg', () => {
	it('returns an empty layout for no members', () => {
		const layout = layoutOrg([]);
		expect(layout.nodes).toEqual([]);
		expect(layout.edges).toEqual([]);
	});

	it('places a parent centred over leaf children', () => {
		const layout = layoutOrg(
			buildOrgTree([member('a', 'Ada'), member('b', 'Bob', 'a'), member('c', 'Cat', 'a')]),
		);
		const ada = layout.nodes.find(({ id }) => id === 'a')!;
		const [bob, cat] = ada.children;
		expect(ada.x + ORG_CARD.width / 2).toBeCloseTo((bob.x + cat.x + ORG_CARD.width) / 2);
	});

	it('gives a wider subtree more room than a narrow one', () => {
		const ada = sample().nodes.find(({ id }) => id === 'a')!;
		const [bob, cat] = ada.children;
		expect(cat.x - bob.x).toBeGreaterThan(ORG_CARD.width + ORG_GAP.x);
	});

	it('puts each level one row lower', () => {
		const layout = sample();
		const ada = layout.nodes.find(({ id }) => id === 'a')!;
		expect(ada.children[0].y).toBe(ada.y + ORG_CARD.height + ORG_GAP.y);
	});

	it('never overlaps two cards on the same row', () => {
		const layout = sample();
		const rows = new Map<number, number[]>();
		for (const node of layout.nodes) rows.set(node.y, [...(rows.get(node.y) ?? []), node.x]);
		for (const xs of rows.values()) {
			const sorted = [...xs].sort((a, b) => a - b);
			for (let i = 1; i < sorted.length; i++) {
				expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(ORG_CARD.width + ORG_GAP.x);
			}
		}
	});

	it('creates one edge per reporting line and reports bounds that contain every card', () => {
		const layout = sample();
		expect(layout.edges).toHaveLength(4);
		for (const node of layout.nodes) {
			expect(node.x + ORG_CARD.width).toBeLessThanOrEqual(layout.bounds.width);
			expect(node.y + ORG_CARD.height).toBeLessThanOrEqual(layout.bounds.height);
		}
	});

	it('is deterministic', () => {
		expect(JSON.stringify(sample().nodes.map(({ id, x, y }) => [id, x, y]))).toBe(
			JSON.stringify(sample().nodes.map(({ id, x, y }) => [id, x, y])),
		);
	});

	it('uses saved member positions and keeps every card inside the layout bounds', () => {
		const layout = layoutOrg(buildOrgTree([member('a', 'Ada'), member('b', 'Bob', 'a')]), {
			a: { x: 420, y: 260 },
			removed: { x: 900, y: 900 },
		});
		const ada = layout.nodes.find(({ id }) => id === 'a')!;
		expect(ada).toMatchObject({ x: 420, y: 260 });
		for (const node of layout.nodes) {
			expect(node.x + ORG_CARD.width).toBeLessThanOrEqual(layout.bounds.width);
			expect(node.y + ORG_CARD.height).toBeLessThanOrEqual(layout.bounds.height);
		}
	});
});

describe('edgePath', () => {
	it('starts under the parent and ends on top of the child', () => {
		const layout = sample();
		const edge = layout.edges[0];
		const path = edgePath(edge);
		expect(
			path.startsWith(`M ${edge.parent.x + ORG_CARD.width / 2} ${edge.parent.y + ORG_CARD.height}`),
		).toBe(true);
		expect(path.endsWith(`L ${edge.child.x + ORG_CARD.width / 2} ${edge.child.y}`)).toBe(true);
	});

	it('draws a straight line for a child straight below', () => {
		const layout = layoutOrg(buildOrgTree([member('a', 'A'), member('b', 'B', 'a')]));
		expect(edgePath(layout.edges[0])).not.toContain('Q');
	});
});

describe('zoom and fit', () => {
	it('clamps zoom to its limits', () => {
		expect(clampZoom(100)).toBe(ORG_ZOOM.max);
		expect(clampZoom(0)).toBe(ORG_ZOOM.min);
	});

	it('fits a wide chart to the container and centres it', () => {
		const view = fitOrg({ width: 800, height: 600 }, { width: 2000, height: 500 })!;
		expect(view.zoom).toBeLessThan(0.5);
		expect(view.pan.x).toBeCloseTo((800 - 2000 * view.zoom) / 2);
	});

	it('fits the organization chart into a 360 CSS pixel viewport', () => {
		const bounds = { width: 1400, height: 620 };
		const view = fitOrg({ width: 360, height: 420 }, bounds)!;

		expect(bounds.width * view.zoom).toBeLessThanOrEqual(360);
		expect(bounds.height * view.zoom).toBeLessThanOrEqual(420);
	});

	it('never zooms past 100% to fit a small chart', () => {
		expect(fitOrg({ width: 2000, height: 1000 }, { width: 300, height: 200 })!.zoom).toBe(1);
	});

	it('returns null for a container that is too small or an empty chart', () => {
		expect(fitOrg({ width: 10, height: 10 }, { width: 300, height: 200 })).toBeNull();
		expect(fitOrg({ width: 800, height: 600 }, { width: 0, height: 0 })).toBeNull();
	});

	it('keeps the anchor point still while zooming', () => {
		const view = { zoom: 1, pan: { x: 40, y: 20 } };
		const anchor = { x: 300, y: 200 };
		const chartPoint = {
			x: (anchor.x - view.pan.x) / view.zoom,
			y: (anchor.y - view.pan.y) / view.zoom,
		};
		const next = zoomAround(view, 1.5, anchor);
		expect(chartPoint.x * next.zoom + next.pan.x).toBeCloseTo(anchor.x);
		expect(chartPoint.y * next.zoom + next.pan.y).toBeCloseTo(anchor.y);
	});

	it('pans a hidden card into view and leaves a visible card alone', () => {
		const layout = sample();
		const far = layout.nodes[layout.nodes.length - 1];
		const hidden = revealNode({ zoom: 1, pan: { x: 0, y: 0 } }, far, { width: 300, height: 200 });
		expect(far.x + hidden.pan.x).toBeGreaterThanOrEqual(0);
		const first = layout.nodes[0];
		const view = { zoom: 1, pan: { x: 0, y: 0 } };
		expect(revealNode(view, first, { width: 4000, height: 4000 })).toEqual(view);
	});
});

describe('neighbour', () => {
	it('moves between parent, first child and siblings', () => {
		const layout = sample();
		expect(neighbour(layout, 'a', 'down')?.id).toBe('b');
		expect(neighbour(layout, 'b', 'up')?.id).toBe('a');
		expect(neighbour(layout, 'b', 'right')?.id).toBe('c');
		expect(neighbour(layout, 'c', 'left')?.id).toBe('b');
		expect(neighbour(layout, 'a', 'right')?.id).toBe('f');
	});

	it('returns null at the edges', () => {
		const layout = sample();
		expect(neighbour(layout, 'a', 'up')).toBeNull();
		expect(neighbour(layout, 'd', 'down')).toBeNull();
		expect(neighbour(layout, 'missing', 'down')).toBeNull();
	});
});
