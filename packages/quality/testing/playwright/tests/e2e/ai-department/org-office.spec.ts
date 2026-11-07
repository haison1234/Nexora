import { nanoid } from 'nanoid';
import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../../../fixtures/base';
import { AiDepartmentPage } from '../../../pages/AiDepartmentPage';
import type { n8nPage } from '../../../pages/n8nPage';
import type { ApiHelpers } from '../../../services/api-helper';

type OfficeFrameSample = {
	viewport: { width: number; height: number };
	webgl: string;
	renderer: string;
	frameSamples: number;
	p50RenderFrameIntervalMs: number;
	p95RenderFrameIntervalMs: number;
	maxRenderFrameIntervalMs: number;
	drawCalls: number;
	renderedFrames: number;
	p95RenderSubmissionMs: number;
	jsHeapUsedBytes: number | null;
};

declare global {
	interface Window {
		__officePerf?: {
			drawCalls: number;
			renderedFrames: number;
			renderTimestamps: number[];
			submissionMs: number[];
			reset: () => void;
		};
	}
}

test.use({
	locale: 'en-US',
	capability: {
		env: {
			N8N_ENABLED_MODULES: 'agents,ai-department',
			TEST_ISOLATION: 'ai-department-org-office',
		},
	},
});

async function openDepartment(n8n: n8nPage, api: ApiHelpers) {
	const project = await api.projects.getMyPersonalProject();
	await n8n.start.fromHome();

	const department = new AiDepartmentPage(n8n.page);
	await department.goto(project.id);
	await expect(department.getTitle()).toBeVisible();
	const name = n8n.page.getByLabel('Department name', { exact: true });
	let departmentId: string;
	if (await name.isVisible()) {
		await name.fill(`Org Office ${nanoid(6)}`);
		const response = n8n.page.waitForResponse(
			(candidate) =>
				candidate.request().method() === 'POST' && /\/ai-departments$/.test(candidate.url()),
		);
		await n8n.page.getByRole('button', { name: 'Create department', exact: true }).click();
		const body = await (await response).json();
		departmentId = body.data.id;
	} else {
		const selector = n8n.page.getByRole('combobox').first();
		await expect(selector).toBeVisible();
		departmentId = await selector.inputValue();
	}
	return { department, departmentId };
}

test('Org and Office remain usable at 360 pixels with keyboard, reduced motion, and 2D fallback', async ({
	n8n,
	api,
}) => {
	const { department, departmentId } = await openDepartment(n8n, api);
	expect(departmentId).not.toBe('');
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.emulateMedia({ reducedMotion: 'reduce' });

	const project = await api.projects.getMyPersonalProject();
	await n8n.page.goto(
		`/projects/${project.id}/ai-department/office?departmentId=${departmentId}&view=2d`,
	);
	await n8n.page.reload();
	await expect(n8n.page.getByRole('heading', { level: 1, name: 'Office' })).toBeVisible();
	await expect(n8n.page.getByTestId('office-mode-2d')).toHaveAttribute('aria-pressed', 'true');
	expect(await n8n.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
		false,
	);
	expect(
		(
			await new AxeBuilder({ page: n8n.page })
				.include('[data-test-id="ai-department-office"]')
				.analyze()
		).violations,
	).toEqual([]);

	await department.goto(project.id);
	const organization = department.getSectionButton('Organization');
	await expect(organization).toBeVisible();
	await organization.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(n8n.page.getByRole('heading', { level: 2, name: 'Organization' })).toBeVisible();
	expect(await n8n.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
		false,
	);
	expect(
		(await new AxeBuilder({ page: n8n.page }).include('.ai-department').analyze()).violations,
	).toEqual([]);
});

test('keeps the Office roster available when WebGL is unsupported', async ({ n8n, api }) => {
	const { departmentId } = await openDepartment(n8n, api);
	const project = await api.projects.getMyPersonalProject();
	const response = await api.request.post(
		`/rest/projects/${project.id}/ai-departments/${departmentId}/members`,
		{
			data: {
				name: 'Fallback member',
				role: 'Coordinator',
				managerMemberId: null,
				requestId: `office-fallback-${nanoid(12)}`,
			},
		},
	);
	expect(response.ok()).toBe(true);
	const { data: member } = await response.json();

	await n8n.page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...args: unknown[]
		) {
			if (type === 'webgl2' || type === 'webgl') return null;
			return Reflect.apply(original, this, [type, ...args]);
		} as typeof HTMLCanvasElement.prototype.getContext;
	});
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.goto(`/projects/${project.id}/ai-department/office?departmentId=${departmentId}`);
	await expect(n8n.page.getByTestId('office-fallback')).toBeVisible();
	await expect(n8n.page.getByTestId('office-stage')).toHaveCount(0);
	const roster = n8n.page.getByTestId(`office-roster-member-${member.id}`);
	await expect(roster).toBeVisible();
	await roster.click();
	await expect(roster).toHaveAttribute('aria-pressed', 'true');
});

test('keeps the Office roster available when WebGL renderer setup fails', async ({ n8n, api }) => {
	const { departmentId } = await openDepartment(n8n, api);
	const project = await api.projects.getMyPersonalProject();
	const response = await api.request.post(
		`/rest/projects/${project.id}/ai-departments/${departmentId}/members`,
		{
			data: {
				name: 'Initialization fallback member',
				role: 'Coordinator',
				managerMemberId: null,
				requestId: `office-init-fallback-${nanoid(12)}`,
			},
		},
	);
	expect(response.ok()).toBe(true);
	const { data: member } = await response.json();

	await n8n.page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		let webglRequests = 0;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...args: unknown[]
		) {
			if (type === 'webgl2' || type === 'webgl') {
				webglRequests++;
				if (webglRequests > 1) return null;
			}
			return Reflect.apply(original, this, [type, ...args]);
		} as typeof HTMLCanvasElement.prototype.getContext;
	});
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.goto(`/projects/${project.id}/ai-department/office?departmentId=${departmentId}`);
	await expect(n8n.page.getByTestId('office-fallback')).toBeVisible();
	await expect(n8n.page.getByTestId('office-stage')).toHaveCount(0);
	await expect(n8n.page.getByTestId(`office-roster-member-${member.id}`)).toBeVisible();
});

test('keeps the Office roster available after WebGL context loss', async ({ n8n, api }) => {
	const { departmentId } = await openDepartment(n8n, api);
	const project = await api.projects.getMyPersonalProject();
	const response = await api.request.post(
		`/rest/projects/${project.id}/ai-departments/${departmentId}/members`,
		{
			data: {
				name: 'Context loss fallback member',
				role: 'Coordinator',
				managerMemberId: null,
				requestId: `office-context-fallback-${nanoid(12)}`,
			},
		},
	);
	expect(response.ok()).toBe(true);
	const { data: member } = await response.json();
	await n8n.page.setViewportSize({ width: 360, height: 780 });
	await n8n.page.goto(`/projects/${project.id}/ai-department/office?departmentId=${departmentId}`);
	const canvas = n8n.page.locator('[data-test-id="office-stage"] canvas');
	await expect(canvas).toBeVisible();
	await canvas.evaluate((element) =>
		element.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
	);
	await expect(n8n.page.getByTestId('office-fallback')).toBeVisible();
	await expect(n8n.page.getByTestId('office-stage')).toHaveCount(0);
	await expect(n8n.page.getByTestId(`office-roster-member-${member.id}`)).toBeVisible();
});

test('renders 100 controlled work text updates in Office', async ({ n8n, api }) => {
	const { departmentId } = await openDepartment(n8n, api);
	const project = await api.projects.getMyPersonalProject();
	const endpoint = `/rest/projects/${project.id}/ai-departments/${departmentId}`;
	const memberResponse = await api.request.post(`${endpoint}/members`, {
		data: {
			name: 'Office update member',
			role: 'Coordinator',
			managerMemberId: null,
			requestId: `office-updates-member-${nanoid(12)}`,
		},
	});
	expect(memberResponse.ok()).toBe(true);
	const { data: member } = await memberResponse.json();
	const workResponse = await api.request.post(`${endpoint}/work`, {
		data: {
			instruction: 'Office update 0',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: `office-updates-work-${nanoid(12)}`,
		},
	});
	expect(workResponse.ok()).toBe(true);
	const { data: work } = await workResponse.json();
	let currentState: 'ready' | 'running' | 'review' | 'blocked' = 'ready';

	await n8n.page.route(
		`**${endpoint}/members`,
		async (route) =>
			await route.fulfill({ json: { data: [{ ...member, executionState: 'available' }] } }),
	);
	await n8n.page.route(`**${endpoint}/work?*`, async (route) => {
		await route.fulfill({
			json: {
				data: {
					data: [{ ...work, state: currentState }],
					count: 1,
				},
			},
		});
	});
	await n8n.page.clock.install();
	await n8n.page.goto(`/projects/${project.id}/ai-department/office?departmentId=${departmentId}`);
	const statusLabel = n8n.page
		.locator('.labels .label')
		.filter({ hasText: member.name })
		.locator('.label-status');
	await expect(n8n.page.getByTestId('office-mode-3d')).toHaveAttribute('aria-pressed', 'true');
	await expect(statusLabel).toHaveText('Queued');
	await expect(n8n.page.locator('[data-test-id="office-stage"] canvas')).toBeVisible();

	const updates = [
		{ state: 'running', text: 'Working' },
		{ state: 'review', text: 'Needs review' },
		{ state: 'blocked', text: 'Blocked' },
		{ state: 'ready', text: 'Queued' },
	] as const;
	const latencies: number[] = [];
	for (let index = 1; index <= 100; index++) {
		const update = updates[(index - 1) % updates.length];
		currentState = update.state;
		const startedAt = Date.now();
		await n8n.page.clock.fastForward(4_000);
		await expect(statusLabel).toHaveText(update.text);
		latencies.push(4_000 + Date.now() - startedAt);
	}
	const sorted = [...latencies].sort((a, b) => a - b);
	console.log(
		`OFFICE_CONTROLLED_TEXT_UPDATES ${JSON.stringify({
			count: latencies.length,
			withinFiveSeconds: latencies.filter((latency) => latency <= 5_000).length,
			p95Ms: sorted[Math.floor(sorted.length * 0.95)],
			maxMs: Math.max(...latencies),
		})}`,
	);
	expect(latencies).toHaveLength(100);
	expect(latencies.filter((latency) => latency <= 5_000)).toHaveLength(100);

	for (let cycle = 0; cycle < 5; cycle++) {
		await n8n.page.getByTestId('office-mode-2d').click();
		await expect(n8n.page.getByTestId('office-mode-2d')).toHaveAttribute('aria-pressed', 'true');
		await expect(n8n.page.locator('[data-test-id="office-stage"] canvas')).toHaveCount(0);
		await n8n.page.getByTestId('office-mode-3d').click();
		await expect(n8n.page.getByTestId('office-mode-3d')).toHaveAttribute('aria-pressed', 'true');
		await expect(n8n.page.locator('[data-test-id="office-stage"] canvas')).toHaveCount(1);
	}

	await n8n.page.getByTestId(`office-roster-member-${member.id}`).click();
	const detail = n8n.page.getByTestId('office-detail');
	await expect(detail).toBeVisible();
	const actionsIn3d = await detail.locator('.detail-actions button').allTextContents();
	await n8n.page.getByTestId('office-mode-2d').click();
	await expect(n8n.page.getByTestId('office-mode-2d')).toHaveAttribute('aria-pressed', 'true');
	const actionsIn2d = await detail.locator('.detail-actions button').allTextContents();
	expect(actionsIn3d.sort()).toEqual(['Open member', 'Open work']);
	expect(actionsIn2d.sort()).toEqual(actionsIn3d);
});

test('clears the Office selection and roster when department access is lost', async ({
	n8n,
	api,
}) => {
	const { departmentId } = await openDepartment(n8n, api);
	const project = await api.projects.getMyPersonalProject();
	const response = await api.request.post(
		`/rest/projects/${project.id}/ai-departments/${departmentId}/members`,
		{
			data: {
				name: 'Access loss member',
				role: 'Coordinator',
				managerMemberId: null,
				requestId: `office-access-loss-${nanoid(12)}`,
			},
		},
	);
	expect(response.ok()).toBe(true);
	const { data: member } = await response.json();
	await n8n.page.goto(
		`/projects/${project.id}/ai-department/office?departmentId=${departmentId}&view=2d`,
	);
	const roster = n8n.page.getByTestId(`office-roster-member-${member.id}`);
	await expect(roster).toBeVisible();
	await roster.click();
	await expect(n8n.page.getByTestId('office-detail')).toBeVisible();

	let accessRequestCount = 0;
	await n8n.page.route(
		`**/rest/projects/${project.id}/ai-departments/${departmentId}/members`,
		async (route) => {
			accessRequestCount++;
			await route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Forbidden' }),
			});
		},
	);
	await expect.poll(() => accessRequestCount, { timeout: 15_000 }).toBeGreaterThan(0);
	await expect(n8n.page.getByRole('alert')).toBeVisible();
	await expect(roster).toHaveCount(0);
	await expect(n8n.page.getByTestId('office-detail')).toHaveCount(0);
	await expect(n8n.page.locator('.label')).toHaveCount(0);
});

test('records software WebGL frame pacing diagnostics at desktop and 360 pixels', async ({
	n8n,
	api,
}) => {
	const { departmentId } = await openDepartment(n8n, api);
	const project = await api.projects.getMyPersonalProject();
	const endpoint = `/rest/projects/${project.id}/ai-departments/${departmentId}/members`;
	let leadId = '';
	for (let index = 0; index < 20; index++) {
		const response = await api.request.post(endpoint, {
			data: {
				name: `Office member ${index + 1}`,
				role: index === 0 ? 'Coordinator' : 'Engineer',
				managerMemberId: index === 0 ? null : leadId,
				requestId: `office-perf-${nanoid(12)}`,
			},
		});
		expect(response.ok()).toBe(true);
		if (index === 0) {
			const body = await response.json();
			leadId = body.data.id;
		}
	}

	await n8n.page.setViewportSize({ width: 1280, height: 800 });
	await n8n.page.emulateMedia({ reducedMotion: 'no-preference' });
	await n8n.page.goto(`/projects/${project.id}/ai-department/office?departmentId=${departmentId}`);
	await expect(n8n.page.getByRole('heading', { level: 1, name: 'Office' })).toBeVisible();
	await expect(n8n.page.getByTestId('office-preset-overview')).toBeVisible({ timeout: 30_000 });
	await expect(n8n.page.locator('.label:visible').first()).toBeVisible();
	await expect(n8n.page.locator('.label-status').first()).toBeVisible();
	const visibleLabelBoxes = await n8n.page.locator('.label:visible').evaluateAll((labels) =>
		labels.map((label) => {
			const bounds = label.getBoundingClientRect();
			return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
		}),
	);
	for (let left = 0; left < visibleLabelBoxes.length; left++) {
		for (let right = left + 1; right < visibleLabelBoxes.length; right++) {
			const a = visibleLabelBoxes[left];
			const b = visibleLabelBoxes[right];
			expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
				true,
			);
		}
	}
	const firstVisibleLabel = n8n.page.locator('.label:visible').first();
	await firstVisibleLabel.focus();
	await n8n.page.keyboard.press('Enter');
	await expect(firstVisibleLabel).toHaveAttribute('aria-pressed', 'true');
	await expect(n8n.page.getByTestId('office-detail')).toBeVisible();
	expect(
		(
			await new AxeBuilder({ page: n8n.page })
				.include('[data-test-id="ai-department-office"]')
				.analyze()
		).violations,
	).toEqual([]);
	await n8n.page.screenshot({ path: '/tmp/nexora-office-3d-desktop-20261107.png' });
	await n8n.page.evaluate(() => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			'[data-test-id="office-stage"] canvas',
		);
		const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
		if (!context) throw new Error('Office WebGL context is unavailable.');
		const perf = {
			drawCalls: 0,
			renderedFrames: 0,
			renderTimestamps: [] as number[],
			submissionMs: [] as number[],
			reset() {
				this.drawCalls = 0;
				this.renderedFrames = 0;
				this.renderTimestamps = [];
				this.submissionMs = [];
			},
		};
		window.__officePerf = perf;
		const contextPrototype = Object.getPrototypeOf(context) as Record<string, unknown>;
		for (const method of [
			'drawElements',
			'drawArrays',
			'drawElementsInstanced',
			'drawArraysInstanced',
		]) {
			const original = contextPrototype[method];
			if (typeof original !== 'function') continue;
			contextPrototype[method] = function (
				this: WebGLRenderingContext | WebGL2RenderingContext,
				...args: unknown[]
			) {
				if (window.__officePerf) window.__officePerf.drawCalls++;
				return Reflect.apply(original, this, args);
			};
		}
		const requestFrame = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (callback) =>
			requestFrame((time) => {
				const active = window.__officePerf;
				const callsBefore = active?.drawCalls ?? 0;
				const started = performance.now();
				callback(time);
				const elapsed = performance.now() - started;
				if (active && active.drawCalls > callsBefore) {
					active.renderedFrames++;
					if (active.renderTimestamps.at(-1) !== time) active.renderTimestamps.push(time);
					active.submissionMs.push(elapsed);
				}
			});
	});

	const collect = async () =>
		await n8n.page.evaluate(async () => {
			const canvas = document.querySelector<HTMLCanvasElement>(
				'[data-test-id="office-stage"] canvas',
			);
			if (!canvas) throw new Error('Office WebGL canvas was not created.');
			const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
			if (!context) throw new Error('Office WebGL context is unavailable.');
			const debug = context.getExtension('WEBGL_debug_renderer_info');
			const renderer = debug
				? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
				: String(context.getParameter(context.RENDERER));
			const perf = window.__officePerf;
			if (!perf) throw new Error('Office WebGL instrumentation is missing.');
			const endAt = performance.now() + 4500;
			const presets = [
				'office-preset-review',
				'office-preset-blocked',
				'office-preset-lounge',
				'office-preset-desks',
			];
			let presetIndex = 0;
			const presetTimer = window.setInterval(() => {
				document
					.querySelector<HTMLButtonElement>(
						`[data-test-id="${presets[presetIndex++ % presets.length]}"]`,
					)
					?.click();
			}, 1000);
			while (performance.now() < endAt) await new Promise((resolve) => setTimeout(resolve, 25));
			clearInterval(presetTimer);
			const renderIntervals = perf.renderTimestamps
				.slice(1)
				.map((time, index) => time - perf.renderTimestamps[index]);
			const sorted = [...renderIntervals].sort((left, right) => left - right);
			const sortedSubmission = [...perf.submissionMs].sort((left, right) => left - right);
			const percentile = (ratio: number) =>
				sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
			const p95Submission =
				sortedSubmission[
					Math.min(sortedSubmission.length - 1, Math.floor(sortedSubmission.length * 0.95))
				] ?? 0;
			const memory = performance as Performance & {
				memory?: { usedJSHeapSize?: number };
			};
			return {
				viewport: { width: innerWidth, height: innerHeight },
				webgl: context instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1',
				renderer,
				frameSamples: renderIntervals.length,
				p50RenderFrameIntervalMs: percentile(0.5),
				p95RenderFrameIntervalMs: percentile(0.95),
				maxRenderFrameIntervalMs: sorted.at(-1) ?? 0,
				drawCalls: perf.drawCalls,
				renderedFrames: perf.renderedFrames,
				p95RenderSubmissionMs: p95Submission,
				jsHeapUsedBytes: memory.memory?.usedJSHeapSize ?? null,
			};
		});

	const results: OfficeFrameSample[] = [];
	for (const viewport of [
		{ width: 1280, height: 800 },
		{ width: 360, height: 780 },
	]) {
		await n8n.page.setViewportSize(viewport);
		await n8n.page.evaluate(() => window.__officePerf?.reset());
		await n8n.page.getByTestId('office-preset-desks').click();
		results.push(await collect());
	}
	console.log(`OFFICE_FRAME_MEASUREMENTS ${JSON.stringify(results)}`);
	expect(results).toHaveLength(2);
	for (const result of results) {
		expect(result.frameSamples).toBeGreaterThan(5);
		expect(result.drawCalls).toBeGreaterThan(0);
		expect(result.renderedFrames).toBeGreaterThan(0);
		expect(result.p95RenderFrameIntervalMs).toBeGreaterThan(0);
	}
});
