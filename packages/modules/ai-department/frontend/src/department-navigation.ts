import type { AiDepartmentSection } from './ai-department.constants';

export const AI_DEPARTMENT_SECTIONS = [
	'organization',
	'overview',
	'work',
	'people',
	'goals',
	'activity',
] as const satisfies readonly AiDepartmentSection[];

export function parseAiDepartmentSection(value: unknown): AiDepartmentSection {
	return (
		AI_DEPARTMENT_SECTIONS.find((section) => section !== 'organization' && section === value) ??
		'organization'
	);
}
