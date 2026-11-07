import type { OrgTreeNode } from './org-tree';

export const ORG_CARD = { width: 214, height: 108 } as const;
export const ORG_GAP = { x: 32, y: 76 } as const;
export const ORG_PADDING = 56;
export const ORG_FIT_PADDING = 48;
export const ORG_ZOOM = { min: 0.25, max: 1.8 } as const;

export type Point = { x: number; y: number };

export type OrgLayoutNode = {
	id: string;
	node: OrgTreeNode;
	x: number;
	y: number;
	children: OrgLayoutNode[];
};

export type OrgEdge = { parent: OrgLayoutNode; child: OrgLayoutNode };

export type OrgLayout = {
	roots: OrgLayoutNode[];
	nodes: OrgLayoutNode[];
	edges: OrgEdge[];
	bounds: { width: number; height: number };
};

function subtreeWidth(node: OrgTreeNode): number {
	if (node.children.length === 0) return ORG_CARD.width;
	const children = node.children.reduce((sum, child) => sum + subtreeWidth(child), 0);
	return Math.max(ORG_CARD.width, children + (node.children.length - 1) * ORG_GAP.x);
}

function place(node: OrgTreeNode, x: number, y: number): OrgLayoutNode {
	const total = subtreeWidth(node);
	const placed: OrgLayoutNode[] = [];
	if (node.children.length > 0) {
		const children = node.children.reduce((sum, child) => sum + subtreeWidth(child), 0);
		const span = children + (node.children.length - 1) * ORG_GAP.x;
		let cursor = x + (total - span) / 2;
		for (const child of node.children) {
			placed.push(place(child, cursor, y + ORG_CARD.height + ORG_GAP.y));
			cursor += subtreeWidth(child) + ORG_GAP.x;
		}
	}
	return {
		id: node.member.id,
		node,
		x: x + (total - ORG_CARD.width) / 2,
		y,
		children: placed,
	};
}

/** Lay out every reporting tree side by side. Pure: the same input gives the same pixels. */
export function layoutOrg(
	roots: OrgTreeNode[],
	positions: Readonly<Record<string, Point>> = {},
): OrgLayout {
	const placedRoots: OrgLayoutNode[] = [];
	let cursor = ORG_PADDING;
	for (const root of roots) {
		placedRoots.push(place(root, cursor, ORG_PADDING));
		cursor += subtreeWidth(root) + ORG_GAP.x * 2;
	}

	const nodes: OrgLayoutNode[] = [];
	const edges: OrgEdge[] = [];
	const walk = (current: OrgLayoutNode) => {
		nodes.push(current);
		for (const child of current.children) {
			edges.push({ parent: current, child });
			walk(child);
		}
	};
	placedRoots.forEach(walk);

	for (const current of nodes) {
		const saved = positions[current.id];
		if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
			current.x = Math.max(ORG_PADDING, Math.min(saved.x, 20_000));
			current.y = Math.max(ORG_PADDING, Math.min(saved.y, 20_000));
		}
	}

	let width = 0;
	let height = 0;
	for (const current of nodes) {
		width = Math.max(width, current.x + ORG_CARD.width);
		height = Math.max(height, current.y + ORG_CARD.height);
	}
	return {
		roots: placedRoots,
		nodes,
		edges,
		bounds: { width: width + ORG_PADDING, height: height + ORG_PADDING },
	};
}

/** Elbow connector from the bottom of a parent card to the top of a child card. */
export function edgePath({ parent, child }: OrgEdge): string {
	const x1 = parent.x + ORG_CARD.width / 2;
	const y1 = parent.y + ORG_CARD.height;
	const x2 = child.x + ORG_CARD.width / 2;
	const y2 = child.y;
	const mid = (y1 + y2) / 2;
	const radius = Math.min(14, Math.abs(x2 - x1) / 2, (y2 - y1) / 4);
	if (radius < 1) return `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`;
	const dir = x2 > x1 ? 1 : -1;
	return [
		`M ${x1} ${y1}`,
		`L ${x1} ${mid - radius}`,
		`Q ${x1} ${mid} ${x1 + dir * radius} ${mid}`,
		`L ${x2 - dir * radius} ${mid}`,
		`Q ${x2} ${mid} ${x2} ${mid + radius}`,
		`L ${x2} ${y2}`,
	].join(' ');
}

export function clampZoom(value: number): number {
	return Math.min(Math.max(value, ORG_ZOOM.min), ORG_ZOOM.max);
}

export type OrgView = { zoom: number; pan: Point };

/** Zoom and pan that show the whole chart centred. Never zooms in past 100%. */
export function fitOrg(
	container: { width: number; height: number },
	bounds: { width: number; height: number },
): OrgView | null {
	if (container.width <= ORG_FIT_PADDING || container.height <= ORG_FIT_PADDING) return null;
	if (bounds.width <= 0 || bounds.height <= 0) return null;
	const zoom = clampZoom(
		Math.min(
			(container.width - ORG_FIT_PADDING) / bounds.width,
			(container.height - ORG_FIT_PADDING) / bounds.height,
			1,
		),
	);
	return {
		zoom,
		pan: {
			x: (container.width - bounds.width * zoom) / 2,
			y: (container.height - bounds.height * zoom) / 2,
		},
	};
}

/** Change zoom while keeping the chart point under `anchor` where it is on screen. */
export function zoomAround(view: OrgView, nextZoom: number, anchor: Point): OrgView {
	const zoom = clampZoom(nextZoom);
	const ratio = zoom / view.zoom;
	return {
		zoom,
		pan: {
			x: anchor.x - ratio * (anchor.x - view.pan.x),
			y: anchor.y - ratio * (anchor.y - view.pan.y),
		},
	};
}

/** Pan so a card is visible with some margin. Used when the keyboard moves focus. */
export function revealNode(
	view: OrgView,
	target: OrgLayoutNode,
	container: { width: number; height: number },
	margin = 24,
): OrgView {
	const left = target.x * view.zoom + view.pan.x;
	const top = target.y * view.zoom + view.pan.y;
	const right = left + ORG_CARD.width * view.zoom;
	const bottom = top + ORG_CARD.height * view.zoom;
	let { x, y } = view.pan;
	if (left < margin) x += margin - left;
	else if (right > container.width - margin) x -= right - (container.width - margin);
	if (top < margin) y += margin - top;
	else if (bottom > container.height - margin) y -= bottom - (container.height - margin);
	return { zoom: view.zoom, pan: { x, y } };
}

export type OrgDirection = 'up' | 'down' | 'left' | 'right';

/** The neighbour card for an arrow key: parent, first child, or the previous and next sibling. */
export function neighbour(
	layout: OrgLayout,
	currentId: string,
	direction: OrgDirection,
): OrgLayoutNode | null {
	const current = layout.nodes.find(({ id }) => id === currentId);
	if (!current) return null;
	if (direction === 'down') return current.children[0] ?? null;
	if (direction === 'up')
		return layout.edges.find(({ child }) => child.id === currentId)?.parent ?? null;
	const parent = layout.edges.find(({ child }) => child.id === currentId)?.parent;
	const siblings = parent ? parent.children : layout.roots;
	const index = siblings.findIndex(({ id }) => id === currentId);
	return siblings[index + (direction === 'right' ? 1 : -1)] ?? null;
}
