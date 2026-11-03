import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { TransactionRunner } from '@n8n/db';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

import { DepartmentService } from '../department.service';
import { MemberService } from '../member.service';
import { WorkItem } from '../database/entities/work-item.entity';
import { WorkRepository } from '../database/repositories/work.repository';

// This fixture measures indexed planning reads. It does not measure live Agent throughput.
describe('Department planning scale', () => {
	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
	});
	afterAll(async () => await testDb.terminate());
	it('pages and filters 1000 work items across 10 departments and 100 members', async () => {
		const projectId = (await createTeamProject('Department scale fixture')).id;
		const actorId = randomUUID();
		const repository = Container.get(WorkRepository);
		const departmentIds: string[] = [];
		const memberIds: string[][] = [];
		for (let index = 0; index < 10; index++) {
			const department = await Container.get(DepartmentService).create(projectId, actorId, {
				name: `Scale ${index}`,
				requestId: randomUUID(),
			});
			departmentIds.push(department.id);
			const ids: string[] = [];
			for (let member = 0; member < 10; member++) {
				ids.push(
					(
						await Container.get(MemberService).create(projectId, actorId, department.id, {
							name: `Worker ${member}`,
							role: 'Research',
							requestId: randomUUID(),
						})
					).id,
				);
			}
			memberIds.push(ids);
		}
		await Container.get(TransactionRunner).run({}, async (ctx) => {
			for (let index = 0; index < 1000; index++) {
				const department = index % 10;
				await repository.saveWork(
					Object.assign(new WorkItem(), {
						id: randomUUID(),
						projectId,
						departmentId: departmentIds[department],
						assigneeMemberId: memberIds[department][Math.floor(index / 10) % 10],
						goalId: null,
						instruction: `Research item ${index}`,
						priority: 'normal',
						dueAt: null,
						reviewPolicy: 'required',
						state: 'backlog',
						currentAttemptId: null,
						version: 1,
					}),
					ctx,
				);
			}
		});
		const samples: number[] = [];
		for (let index = 0; index < 30; index++) {
			const started = performance.now();
			const result = await repository.listWork(projectId, departmentIds[index % 10], {
				take: 50,
				skip: (index % 2) * 50,
			});
			samples.push(performance.now() - started);
			expect(result.count).toBe(100);
			expect(result.data).toHaveLength(50);
			expect(result.data.every((item) => item.departmentId === departmentIds[index % 10])).toBe(
				true,
			);
		}
		const assigned = await repository.listWork(projectId, departmentIds[0], {
			take: 50,
			skip: 0,
			assigneeMemberId: memberIds[0][0],
		});
		expect(assigned.count).toBe(10);
		samples.sort((a, b) => a - b);
		writeFileSync(
			'/tmp/ai-department-planning-metrics.json',
			JSON.stringify({
				departments: 10,
				members: 100,
				workItems: 1000,
				reads: samples.length,
				p50Ms: samples[15],
				p95Ms: samples[28],
			}),
		);
	}, 30000);
});
