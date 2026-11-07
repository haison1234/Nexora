import englishMessages from '@n8n/i18n/locales/en.json';
import { i18nInstance } from '@n8n/i18n';

import vietnameseMessages from './locales/vi.json';
import { registerAiDepartmentLocales } from './ai-department.i18n';

describe('AI Department translations', () => {
	it('translates every AI Department string and keeps interpolation tokens', () => {
		const originalLocale = i18nInstance.global.locale.value;
		registerAiDepartmentLocales();
		const messages = i18nInstance.global.getLocaleMessage('vi');
		i18nInstance.global.locale.value = 'vi';

		for (const [key, english] of Object.entries(englishMessages)) {
			if (!key.startsWith('aiDepartment.') || typeof english !== 'string') continue;

			const vietnamese = Object.entries(messages).find(([messageKey]) => messageKey === key)?.[1];
			expect(typeof vietnamese).toBe('string');
			if (key !== 'aiDepartment.title') expect(vietnamese).not.toBe(english);

			const englishTokens = english.match(/\{\w+\}/g) ?? [];
			expect(
				String(vietnamese)
					.match(/\{\w+\}/g)
					?.sort() ?? [],
			).toEqual(englishTokens.sort());
		}

		expect(Object.keys(vietnameseMessages)).toHaveLength(
			Object.keys(englishMessages).filter((key) => key.startsWith('aiDepartment.')).length,
		);
		expect(i18nInstance.global.t('aiDepartment.meeting.callEstimate', { count: 3 })).toContain('3');
		expect(i18nInstance.global.t('aiDepartment.meeting.callEstimateNote')).toContain(
			'có thể phát sinh chi phí',
		);
		i18nInstance.global.locale.value = 'en';
		expect(i18nInstance.global.t('aiDepartment.meeting.callEstimateNote')).toContain(
			'Active calls may still incur cost',
		);
		expect(i18nInstance.global.t('generic.cancel')).not.toBe('generic.cancel');
		i18nInstance.global.locale.value = originalLocale;
	});
});
