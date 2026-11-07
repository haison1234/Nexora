import type { AiDepartmentMeetingPurpose } from '@n8n/api-types';

export function getMeetingPurposeTemplate(
	purpose: AiDepartmentMeetingPurpose,
	translate: (key: string) => string,
) {
	return {
		topic: translate(`aiDepartment.meeting.template.${purpose}.topic`),
		outcome: translate(`aiDepartment.meeting.template.${purpose}.outcome`),
	};
}

export function getMeetingCallEstimate(participantCount: number): number | null {
	return participantCount >= 2 && participantCount <= 10 ? participantCount + 1 : null;
}
