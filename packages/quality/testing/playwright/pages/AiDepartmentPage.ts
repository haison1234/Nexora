import type { Locator } from '@playwright/test';

import { BasePage } from './BasePage';

export class AiDepartmentPage extends BasePage {
	async goto(projectId: string) {
		await this.page.goto(`/projects/${projectId}/ai-department`);
	}

	getTitle() {
		return this.page.getByRole('heading', { level: 1, name: 'AI Department' });
	}

	getDepartmentNameInput(label: string) {
		return this.page.getByLabel(label, { exact: true });
	}

	getCreateDepartmentButton(name: string) {
		return this.page.getByRole('button', { name, exact: true });
	}

	async createDepartment(fieldLabel: string, buttonName: string, name: string) {
		await this.getDepartmentNameInput(fieldLabel).fill(name);
		await Promise.all([
			this.waitForRestResponse(/\/rest\/projects\/[^/]+\/ai-departments$/, 'POST'),
			this.getCreateDepartmentButton(buttonName).click(),
		]);
	}

	getSectionButton(name: string): Locator {
		return this.page
			.getByRole('navigation', { name: /AI Department navigation|Điều hướng AI Department/ })
			.getByRole('tab', { name, exact: true });
	}

	waitForMeetingsListResponse() {
		return this.page.waitForResponse((response) => {
			const url = new URL(response.url());
			return (
				response.request().method() === 'GET' &&
				url.pathname.endsWith('/meetings') &&
				url.searchParams.get('take') === '100'
			);
		});
	}

	async hasHorizontalOverflow(): Promise<boolean> {
		return await this.page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
		);
	}
}
