/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
export const OFFICE_PRESETS = ['overview', 'desks', 'review', 'blocked', 'lounge'] as const;
export type OfficePresetId = (typeof OFFICE_PRESETS)[number];
