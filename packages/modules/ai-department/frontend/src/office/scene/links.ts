import type { OfficeLayout } from './layout';
import type { Disposer, Three } from './resources';

export type HelpLink = { requesterId: string; recipientId: string };

/** Dashed arcs from a member who asked for help to the member who should answer. */
export function createHelpLinks(
	T: Three,
	d: Disposer,
	layout: OfficeLayout,
	links: HelpLink[],
	color: number,
) {
	const group = new T.Group();
	const material = d.track(
		new T.LineDashedMaterial({
			color,
			dashSize: 0.28,
			gapSize: 0.18,
			transparent: true,
			opacity: 0.9,
		}),
	);
	for (const { requesterId, recipientId } of links) {
		const from = layout.desks.get(requesterId);
		const to = layout.desks.get(recipientId);
		if (!from || !to || requesterId === recipientId) continue;
		const start = new T.Vector3(from.seat.x, 1.6, from.seat.z);
		const end = new T.Vector3(to.seat.x, 1.6, to.seat.z);
		const control = start.clone().add(end).multiplyScalar(0.5);
		control.y += Math.min(3, 0.8 + start.distanceTo(end) * 0.25);
		const geometry = d.track(
			new T.BufferGeometry().setFromPoints(
				new T.QuadraticBezierCurve3(start, control, end).getPoints(32),
			),
		);
		const line = new T.Line(geometry, material);
		line.computeLineDistances();
		group.add(line);
	}
	return group;
}
