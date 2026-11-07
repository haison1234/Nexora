import type { OfficeStatus } from './office-model';

export type StatusVisual = {
	/** n8n design token. Never shown alone: each status also has an icon and a text label. */
	color: string;
	/** 16 by 16 stroke path. */
	icon: string;
	dashed: boolean;
	pulse: boolean;
};

const MUTED = 'var(--text-color--subtle)';
const CROSSED_CIRCLE = 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM3.8 12.2l8.4-8.4';

export const STATUS_VISUAL: Record<OfficeStatus, StatusVisual> = {
	working: {
		color: 'var(--color--success)',
		icon: 'M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
		dashed: false,
		pulse: true,
	},
	review: {
		color: 'var(--color--warning)',
		icon: 'M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8zM8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z',
		dashed: false,
		pulse: false,
	},
	waiting: {
		color: 'var(--color--primary)',
		icon: 'M2 3h12v8H8l-3 3v-3H2z',
		dashed: false,
		pulse: false,
	},
	blocked: {
		color: 'var(--color--danger)',
		icon: 'M5.2 2h5.6L14 5.2v5.6L10.8 14H5.2L2 10.8V5.2zM8 5v3.5M8 10.6v.1',
		dashed: false,
		pulse: true,
	},
	queued: {
		color: 'var(--color--primary)',
		icon: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v3l2 1.5',
		dashed: false,
		pulse: false,
	},
	idle: { color: MUTED, icon: 'M4 8h8', dashed: false, pulse: false },
	unconfigured: { color: MUTED, icon: CROSSED_CIRCLE, dashed: true, pulse: false },
	unavailable: { color: MUTED, icon: CROSSED_CIRCLE, dashed: true, pulse: false },
};
