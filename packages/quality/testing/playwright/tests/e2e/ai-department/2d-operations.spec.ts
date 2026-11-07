import { nanoid } from 'nanoid';
import { AxeBuilder } from '@axe-core/playwright';

import { expect, test } from '../../../fixtures/base';
import { AiDepartmentPage } from '../../../pages/AiDepartmentPage';
import type { n8nPage } from '../../../pages/n8nPage';
import type { ApiHelpers } from '../../../services/api-helper';

const english = {
	departmentName: 'Department name',
	createDepartment: 'Create department',
	sections: [
		{ navigation: 'Organization', heading: 'Organization' },
		{ navigation: 'Overview', heading: 'Needs attention' },
		{ navigation: 'Work', heading: 'Work queue' },
		{ navigation: 'People', heading: 'People' },
		{ navigation: 'Goals', heading: 'Goals' },
		{ navigation: 'Activity', heading: 'Activity' },
	],
};

async function openDepartment(n8n: n8nPage, api: ApiHelpers, locale: typeof english) {
	const project = await api.projects.getMyPersonalProject();
	await n8n.start.fromHome();

	const department = new AiDepartmentPage(n8n.page);
	await department.goto(project.id);
	await expect(department.getTitle()).toBeVisible();
	const departmentName = department.getDepartmentNameInput(locale.departmentName);
	const departmentSelector = n8n.page.getByRole('combobox').first();
	await expect
		.poll(async () => (await departmentName.isVisible()) || (await departmentSelector.isEnabled()))
		.toBe(true);
	if (await departmentName.isVisible()) {
		await department.createDepartment(
			locale.departmentName,
			locale.createDepartment,
			`2D acceptance ${nanoid(6)}`,
		);
	}
	await expect(department.getSectionButton(locale.sections[0].navigation)).toBeVisible();

	return department;
}

test.use({
	locale: 'en-US',
	capability: {
		env: {
			N8N_ENABLED_MODULES: 'agents,ai-department',
			TEST_ISOLATION: 'ai-department-2d-en',
		},
	},
});

test('creates a department and uses each 2D section at 360 pixels', async ({ n8n, api }) => {
	const department = await openDepartment(n8n, api, english);
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.emulateMedia({ reducedMotion: 'reduce' });
	const peopleMotion = await department
		.getSectionButton('People')
		.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
	expect(peopleMotion).toBeLessThanOrEqual(0.001);

	for (const sectionCopy of english.sections) {
		const section = department.getSectionButton(sectionCopy.navigation);
		await section.focus();
		await n8n.page.keyboard.press('Enter');
		await expect(section).toHaveAttribute('aria-selected', 'true');
		await expect(
			n8n.page.getByRole('heading', { level: 2, name: sectionCopy.heading }),
		).toBeVisible();
		expect(
			(await new AxeBuilder({ page: n8n.page }).include('.ai-department').analyze()).violations,
		).toEqual([]);
		expect(await department.hasHorizontalOverflow()).toBe(false);
	}
});

test('replaces meeting creation with the Work coordination view', async ({ n8n, api }) => {
	const department = await openDepartment(n8n, api, english);
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.emulateMedia({ reducedMotion: 'reduce' });
	expect(await department.getSectionButton('Meetings').count()).toBe(0);

	const overview = department.getSectionButton('Overview');
	await overview.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(n8n.page.getByRole('heading', { level: 2, name: 'Needs attention' })).toBeVisible();

	const work = department.getSectionButton('Work');
	await work.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(n8n.page.getByRole('heading', { level: 2, name: 'Work queue' })).toBeVisible();
	await expect(n8n.page.getByRole('button', { name: 'Create work', exact: true })).toBeVisible();
	expect(
		(await new AxeBuilder({ page: n8n.page }).include('.ai-department').analyze()).violations,
	).toEqual([]);
	expect(await department.hasHorizontalOverflow()).toBe(false);
});

test('creates a member, goal, and assigned work through the 2D experience', async ({
	n8n,
	api,
}) => {
	const department = await openDepartment(n8n, api, english);
	const goalTitle = `Quarterly target ${nanoid(5)}`;
	const memberName = `Coordinator ${nanoid(5)}`;
	const instruction = `Review the quarterly target ${nanoid(5)}`;

	const overview = department.getSectionButton('Overview');
	await overview.focus();
	await n8n.page.keyboard.press('Enter');
	await n8n.page.getByLabel('Goal title', { exact: true }).fill(goalTitle);
	const goalResponse = n8n.page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			/\/ai-departments\/[^/]+\/goals$/.test(response.url()),
	);
	await n8n.page.getByRole('button', { name: 'Create', exact: true }).click();
	expect((await goalResponse).ok()).toBe(true);

	const people = department.getSectionButton('People');
	await people.focus();
	await n8n.page.keyboard.press('Enter');
	await n8n.page.getByLabel('Member name', { exact: true }).fill(memberName);
	await n8n.page.getByLabel('Role', { exact: true }).fill('Coordinator');
	const memberResponse = n8n.page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			/\/ai-departments\/[^/]+\/members$/.test(response.url()),
	);
	await n8n.page.getByRole('button', { name: 'Add member', exact: true }).click();
	expect((await memberResponse).ok()).toBe(true);
	await expect(n8n.page.getByText(memberName, { exact: true })).toBeVisible();

	const work = department.getSectionButton('Work');
	await work.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(n8n.page.getByRole('heading', { level: 2, name: 'Work queue' })).toBeVisible();
	await n8n.page.getByLabel('Work instruction', { exact: true }).fill(instruction);
	const workForm = n8n.page.locator('.create-work-form');
	const assignee = workForm.locator('select').nth(0);
	await expect
		.poll(async () => await assignee.locator('option').allTextContents())
		.toContain(memberName);
	const assigneeValue = await assignee.evaluate(
		(element, expectedName) =>
			Array.from(element.querySelectorAll('option')).find(
				(option) => option.textContent?.trim() === expectedName,
			)?.value ?? '',
		memberName,
	);
	expect(assigneeValue).not.toBe('');
	await assignee.selectOption(assigneeValue);
	const goal = workForm.locator('select').nth(1);
	await expect
		.poll(async () => await goal.locator('option').allTextContents())
		.toContain(goalTitle);
	const goalValue = await goal.evaluate(
		(element, expectedTitle) =>
			Array.from(element.querySelectorAll('option')).find(
				(option) => option.textContent?.trim() === expectedTitle,
			)?.value ?? '',
		goalTitle,
	);
	expect(goalValue).not.toBe('');
	await goal.selectOption(goalValue);
	const workResponse = n8n.page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			/\/ai-departments\/[^/]+\/work$/.test(response.url()),
	);
	await n8n.page.getByRole('button', { name: 'Create work', exact: true }).click();
	expect((await workResponse).ok()).toBe(true);
	const workRow = n8n.page.getByRole('listitem').filter({ hasText: instruction });
	await expect(workRow).toContainText(memberName);
	await workRow.getByRole('button', { name: instruction }).click();
	await expect(n8n.page.getByRole('heading', { level: 3, name: 'Work details' })).toBeVisible();
	await expect(n8n.page.locator('.work-detail')).toContainText(instruction);
	await expect(n8n.page.locator('.work-detail')).toContainText(memberName);
	expect(
		(await new AxeBuilder({ page: n8n.page }).include('.ai-department').analyze()).violations,
	).toEqual([]);
});
