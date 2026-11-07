import type { Logger } from '@n8n/backend-common';
import type { Push } from '@/push';
import type { Publisher } from '@/scaling/pubsub/publisher.service';
import type { InstanceSettings } from 'n8n-core';
import type { AgentPushRecipientsService } from '@/modules/agents/agent-push-recipients.service';
import { mock } from 'vitest-mock-extended';
import type { DirectoryRepository } from '../database/repositories/directory.repository';

import { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

describe('AiDepartmentOperationsBroadcaster', () => {
	const logger = mock<Logger>();
	const recipients = mock<AgentPushRecipientsService>();
	const directory = mock<DirectoryRepository>();
	const push = mock<Push>();
	const publisher = mock<Publisher>();
	const instanceSettings = mock<InstanceSettings>();
	const broadcaster = new AiDepartmentOperationsBroadcaster(
		logger,
		recipients,
		directory,
		push,
		publisher,
		instanceSettings,
	);
	const data = { projectId: 'project-1', departmentId: 'department-1', revision: 4 };

	beforeEach(() => {
		vi.clearAllMocks();
		logger.scoped.mockReturnValue(logger);
		Object.defineProperties(instanceSettings, {
			isWorker: { value: false, configurable: true },
			isMultiMain: { value: false, configurable: true },
		});
	});

	it('sends only the project readers a revision signal', async () => {
		recipients.getProjectReaders.mockResolvedValue(['reader-1']);
		broadcaster.notify(data);
		await vi.waitFor(() => expect(push.sendToUsers).toHaveBeenCalledOnce());
		expect(push.sendToUsers).toHaveBeenCalledWith({ type: 'aiDepartmentOperationsUpdated', data }, [
			'reader-1',
		]);
		expect(publisher.publishCommand).not.toHaveBeenCalled();
	});

	it('rechecks project readers when the relay reaches a main', async () => {
		recipients.getProjectReaders.mockResolvedValueOnce([]);
		await broadcaster.handleRelay({ data });
		expect(push.sendToUsers).not.toHaveBeenCalled();
	});

	it('publishes the current department revision after a committed change', async () => {
		directory.findDepartment.mockResolvedValue({
			id: data.departmentId,
			projectId: data.projectId,
			archived: false,
			projectionSequence: 9,
		} as Awaited<ReturnType<DirectoryRepository['findDepartment']>>);
		await broadcaster.notifyCurrent(data.projectId, data.departmentId);
		recipients.getProjectReaders.mockResolvedValue(['reader-1']);
		await vi.waitFor(() => expect(push.sendToUsers).toHaveBeenCalledOnce());
		expect(push.sendToUsers).toHaveBeenCalledWith(
			{
				type: 'aiDepartmentOperationsUpdated',
				data: { ...data, revision: 9 },
			},
			['reader-1'],
		);
	});

	it('does not publish a missing department and signals an archived one', async () => {
		directory.findDepartment.mockResolvedValue(null);
		await broadcaster.notifyCurrent(data.projectId, data.departmentId);
		expect(recipients.getProjectReaders).not.toHaveBeenCalled();
		directory.findDepartment.mockResolvedValue({
			archived: true,
			projectionSequence: 10,
		} as Awaited<ReturnType<DirectoryRepository['findDepartment']>>);
		recipients.getProjectReaders.mockResolvedValue(['reader-1']);
		await broadcaster.notifyCurrent(data.projectId, data.departmentId);
		await vi.waitFor(() => expect(push.sendToUsers).toHaveBeenCalledOnce());
		expect(push.sendToUsers).toHaveBeenCalledWith(
			{
				type: 'aiDepartmentOperationsUpdated',
				data: { ...data, revision: 10 },
			},
			['reader-1'],
		);
	});
});
