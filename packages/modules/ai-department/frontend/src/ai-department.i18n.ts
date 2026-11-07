import { i18nInstance } from '@n8n/i18n';

import vietnameseMessages from './locales/vi.json';

export function registerAiDepartmentLocales() {
	i18nInstance.global.mergeLocaleMessage('vi', vietnameseMessages);
}
