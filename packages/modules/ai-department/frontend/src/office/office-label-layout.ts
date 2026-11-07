export type OfficeLabelPosition = { x: number; y: number; visible: boolean };
export type OfficeLabelSize = { width: number; height: number };
export type OfficeLabelViewport = { width: number; height: number };

type PlacedLabel = OfficeLabelPosition & OfficeLabelSize;

export function placeOfficeLabels(
	positions: ReadonlyMap<string, OfficeLabelPosition>,
	sizes: ReadonlyMap<string, OfficeLabelSize>,
	selectedMemberId: string | null,
	viewport: OfficeLabelViewport,
	gap: number,
) {
	const placed = new Map<string, OfficeLabelPosition>();
	const occupied: PlacedLabel[] = [];
	const candidates = [...positions.entries()]
		.filter(([id, position]) => position.visible && sizes.has(id))
		.sort(([leftId, left], [rightId, right]) => {
			if (leftId === rightId) return 0;
			if (leftId === selectedMemberId) return -1;
			if (rightId === selectedMemberId) return 1;
			return left.y - right.y || left.x - right.x || leftId.localeCompare(rightId);
		});

	for (const [id, position] of positions) {
		if (!position.visible || !sizes.has(id)) placed.set(id, { ...position, visible: false });
	}

	for (const [id, position] of candidates) {
		const size = sizes.get(id);
		if (!size) continue;
		if (size.width + gap * 2 > viewport.width || size.height + gap * 2 > viewport.height) {
			placed.set(id, { ...position, visible: false });
			continue;
		}
		const x = Math.min(
			Math.max(position.x, size.width / 2 + gap),
			viewport.width - size.width / 2 - gap,
		);
		const baseTop = position.y - size.height;
		const step = size.height + gap;
		const maxSteps = Math.ceil(viewport.height / step);
		let result: PlacedLabel | undefined;

		for (let index = 0; index <= maxSteps && !result; index++) {
			const offsets = index === 0 ? [0] : [-index * step, index * step];
			for (const offset of offsets) {
				const top = baseTop + offset;
				if (top < gap || top + size.height > viewport.height - gap) continue;
				const candidate = { x, y: top, width: size.width, height: size.height, visible: true };
				const overlaps = occupied.some(
					(other) =>
						candidate.x - candidate.width / 2 < other.x + other.width / 2 + gap &&
						candidate.x + candidate.width / 2 + gap > other.x - other.width / 2 &&
						candidate.y < other.y + other.height + gap &&
						candidate.y + candidate.height + gap > other.y,
				);
				if (!overlaps) {
					result = candidate;
					break;
				}
			}
		}

		if (result) {
			occupied.push(result);
			placed.set(id, { x: result.x, y: result.y + result.height, visible: true });
		} else {
			placed.set(id, { ...position, visible: false });
		}
	}

	return placed;
}
