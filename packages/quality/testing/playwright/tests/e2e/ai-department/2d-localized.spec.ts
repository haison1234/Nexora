import { nanoid } from 'nanoid';
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../../../fixtures/base';
import { AiDepartmentPage } from '../../../pages/AiDepartmentPage';
import type { n8nPage } from '../../../pages/n8nPage';
import type { ApiHelpers } from '../../../services/api-helper';

test.use({
	locale: 'vi-VN',
	capability: {
		env: {
			N8N_ENABLED_MODULES: 'agents,ai-department',
			N8N_DEFAULT_LOCALE: 'vi',
			TEST_ISOLATION: 'ai-department-2d-vi',
		},
	},
});

async function openDepartment(n8n: n8nPage, api: ApiHelpers) {
	const project = await api.projects.getMyPersonalProject();
	await n8n.start.fromHome();

	const department = new AiDepartmentPage(n8n.page);
	await department.goto(project.id);
	await expect(department.getTitle()).toBeVisible();
	const departmentName = n8n.page
		.getByLabel(/^(Department name|Tên phòng ban)$/)
		.filter({ visible: true });
	const departmentSelector = n8n.page.getByRole('combobox', { name: /Department|Phòng ban/ });
	await expect
		.poll(async () => (await departmentName.isVisible()) || (await departmentSelector.isEnabled()))
		.toBe(true);
	if (await departmentName.isVisible()) {
		await departmentName.fill(`2D acceptance ${nanoid(6)}`);
		await n8n.page.getByRole('button', { name: /^(Create department|Tạo phòng ban)$/ }).click();
	}
	await expect(department.getSectionButton('Tổ chức')).toBeVisible();

	return department;
}

test('uses localized 2D sections with the keyboard', async ({ n8n, api }) => {
	const department = await openDepartment(n8n, api);

	for (const sectionCopy of [
		{ navigation: 'Tổ chức', heading: 'Tổ chức' },
		{ navigation: 'Tổng quan', heading: 'Cần chú ý' },
		{ navigation: 'Công việc', heading: 'Hàng đợi công việc' },
		{ navigation: 'Nhân sự', heading: 'Nhân sự' },
		{ navigation: 'Mục tiêu', heading: 'Mục tiêu' },
		{ navigation: 'Hoạt động', heading: 'Hoạt động' },
	]) {
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
	}
});

test('replaces meeting creation with localized Work coordination', async ({ n8n, api }) => {
	const department = await openDepartment(n8n, api);
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.emulateMedia({ reducedMotion: 'reduce' });
	expect(await department.getSectionButton('Cuộc họp').count()).toBe(0);

	const work = department.getSectionButton('Công việc');
	await work.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(
		n8n.page.getByRole('heading', { level: 2, name: 'Hàng đợi công việc' }),
	).toBeVisible();
	await expect(n8n.page.getByRole('button', { name: 'Tạo công việc', exact: true })).toBeVisible();
	expect(
		(await new AxeBuilder({ page: n8n.page }).include('.ai-department').analyze()).violations,
	).toEqual([]);
	expect(await department.hasHorizontalOverflow()).toBe(false);
});

test('creates a member, goal, and assigned work through the localized 2D experience', async ({
	n8n,
	api,
}) => {
	const department = await openDepartment(n8n, api);
	const goalTitle = `Mục tiêu quý ${nanoid(5)}`;
	const memberName = `Điều phối ${nanoid(5)}`;
	const instruction = `Rà soát mục tiêu ${nanoid(5)}`;

	const overview = department.getSectionButton('Tổng quan');
	await overview.focus();
	await n8n.page.keyboard.press('Enter');
	const goalCard = n8n.page.locator('article').filter({ hasText: 'Tạo mục tiêu' });
	await goalCard.getByLabel('Tên mục tiêu', { exact: true }).fill(goalTitle);
	const goalResponse = n8n.page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			/\/ai-departments\/[^/]+\/goals$/.test(response.url()),
	);
	await goalCard.locator('form').getByRole('button').click();
	expect((await goalResponse).ok()).toBe(true);

	const people = department.getSectionButton('Nhân sự');
	await people.focus();
	await n8n.page.keyboard.press('Enter');
	await n8n.page.getByLabel('Tên thành viên', { exact: true }).fill(memberName);
	await n8n.page.getByLabel('Vai trò', { exact: true }).fill('Điều phối');
	const memberResponse = n8n.page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			/\/ai-departments\/[^/]+\/members$/.test(response.url()),
	);
	await n8n.page.getByRole('button', { name: 'Thêm thành viên', exact: true }).click();
	expect((await memberResponse).ok()).toBe(true);
	await expect(n8n.page.getByText(memberName, { exact: true })).toBeVisible();

	const work = department.getSectionButton('Công việc');
	await work.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(
		n8n.page.getByRole('heading', { level: 2, name: 'Hàng đợi công việc' }),
	).toBeVisible();
	await n8n.page.getByLabel('Hướng dẫn công việc', { exact: true }).fill(instruction);
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
	await n8n.page.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
	expect((await workResponse).ok()).toBe(true);
	const workRow = n8n.page.getByRole('listitem').filter({ hasText: instruction });
	await expect(workRow).toContainText(memberName);
	await workRow.getByRole('button', { name: instruction }).click();
	await expect(
		n8n.page.getByRole('heading', { level: 3, name: 'Chi tiết công việc' }),
	).toBeVisible();
	await expect(n8n.page.locator('.work-detail')).toContainText(instruction);
	await expect(n8n.page.locator('.work-detail')).toContainText(memberName);
	expect(
		(await new AxeBuilder({ page: n8n.page }).include('.ai-department').analyze()).violations,
	).toEqual([]);
});
