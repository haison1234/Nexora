import type {
	AiDepartmentDto,
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
	AiDepartmentWorkState,
	CreateAiDepartmentDto,
} from '@n8n/api-types';
import { useRootStore } from '@n8n/stores/useRootStore';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
	createDepartmentGoal,
	createDepartment,
	createDepartmentMember,
	createDepartmentWork,
	listDepartments,
	listGoals,
	listMembers,
	listWork,
	markDepartmentWorkReady,
	reviewDepartmentWork,
	listProjectAgents,
	getMemberExecutorBinding,
	setMemberExecutorBinding,
	clearMemberExecutorBinding,
} from './ai-department.api';
import type { AiDepartmentAgent, AiDepartmentMemberBinding } from './ai-department.api';
import type { AiDepartmentSection } from './ai-department.constants';

export const useAiDepartmentStore = defineStore('aiDepartment', () => {
	const rootStore = useRootStore();
	const isReady = ref(false);
	const departments = ref<AiDepartmentDto[]>([]);
	const selectedDepartmentId = ref<string>();
	const members = ref<AiDepartmentMemberDto[]>([]);
	const agents = ref<AiDepartmentAgent[]>([]);
	const goals = ref<AiDepartmentGoalDto[]>([]);
	const overviewWork = ref<AiDepartmentWorkItemDto[]>([]);
	const work = ref<AiDepartmentWorkItemDto[]>([]);
	const workCount = ref(0);
	const section = ref<AiDepartmentSection>('overview');
	const loading = ref(false);
	const saving = ref(false);
	const error = ref<unknown>();
	const department = computed(
		() => departments.value.find(({ id }) => id === selectedDepartmentId.value) ?? null,
	);
	const attentionWork = computed(() =>
		overviewWork.value.filter(({ state }) => ['review', 'blocked'].includes(state)),
	);
	const activeWork = computed(() =>
		overviewWork.value.filter(({ state }) => ['running', 'ready'].includes(state)),
	);

	async function load(projectId: string, preferredDepartmentId?: string) {
		loading.value = true;
		error.value = undefined;
		try {
			departments.value = await listDepartments(rootStore.restApiContext, projectId);
			const nextId = departments.value.some(({ id }) => id === preferredDepartmentId)
				? preferredDepartmentId
				: departments.value.some(({ id }) => id === selectedDepartmentId.value)
					? selectedDepartmentId.value
					: departments.value[0]?.id;
			selectedDepartmentId.value = nextId;
			if (nextId) await loadDepartment(projectId, nextId);
			else clearDepartmentData();
		} catch (cause) {
			departments.value = [];
			clearDepartmentData();
			error.value = cause;
		} finally {
			loading.value = false;
			isReady.value = true;
		}
	}

	async function loadDepartment(projectId: string, departmentId: string) {
		selectedDepartmentId.value = departmentId;
		const requests = await Promise.allSettled([
			listMembers(rootStore.restApiContext, projectId, departmentId),
			listGoals(rootStore.restApiContext, projectId, departmentId),
			listWork(rootStore.restApiContext, projectId, departmentId, { take: 100, skip: 0 }),
		]);
		const [membersResult, goalsResult, workResult] = requests;
		members.value = membersResult.status === 'fulfilled' ? membersResult.value : [];
		goals.value = goalsResult.status === 'fulfilled' ? goalsResult.value : [];
		work.value = workResult.status === 'fulfilled' ? workResult.value.data : [];
		overviewWork.value = work.value;
		workCount.value = workResult.status === 'fulfilled' ? workResult.value.count : 0;
		const failed = requests.find((result) => result.status === 'rejected');
		error.value = failed?.status === 'rejected' ? failed.reason : undefined;
	}

	function clearDepartmentData() {
		selectedDepartmentId.value = undefined;
		members.value = [];
		goals.value = [];
		work.value = [];
		overviewWork.value = [];
		workCount.value = 0;
	}

	async function selectDepartment(projectId: string, departmentId: string) {
		loading.value = true;
		error.value = undefined;
		try {
			await loadDepartment(projectId, departmentId);
		} catch (cause) {
			clearDepartmentData();
			error.value = cause;
		} finally {
			loading.value = false;
		}
	}

	async function refreshWork(
		projectId: string,
		options: {
			search?: string;
			state?: AiDepartmentWorkState;
			skip?: number;
		} = {},
	) {
		if (!selectedDepartmentId.value) return;
		const response = await listWork(
			rootStore.restApiContext,
			projectId,
			selectedDepartmentId.value,
			{
				take: 100,
				skip: options.skip ?? 0,
				...options,
			},
		);
		work.value = response.data;
		workCount.value = response.count;
		if (!options.search && !options.state && !options.skip) overviewWork.value = response.data;
	}

	async function createGoal(projectId: string, title: string) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await createDepartmentGoal(rootStore.restApiContext, projectId, selectedDepartmentId.value, {
				title,
				requestId: crypto.randomUUID(),
			});
			goals.value = await listGoals(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function createDepartmentItem(projectId: string, name: string) {
		saving.value = true;
		try {
			await createDepartment(rootStore.restApiContext, projectId, {
				name,
				requestId: crypto.randomUUID(),
			} satisfies CreateAiDepartmentDto);
			departments.value = await listDepartments(rootStore.restApiContext, projectId);
			const created = departments.value.find((item) => item.name === name);
			if (created) await loadDepartment(projectId, created.id);
		} finally {
			saving.value = false;
		}
	}

	function markReadyFlag() {
		isReady.value = true;
	}

	async function createMember(projectId: string, name: string, role: string) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await createDepartmentMember(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				{
					name,
					role,
					requestId: crypto.randomUUID(),
				},
			);
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function loadAgents(projectId: string) {
		agents.value = await listProjectAgents(rootStore.restApiContext, projectId);
	}

	async function loadMemberBinding(
		projectId: string,
		memberId: string,
	): Promise<AiDepartmentMemberBinding> {
		if (!selectedDepartmentId.value) throw new Error('No department is selected.');
		return await getMemberExecutorBinding(
			rootStore.restApiContext,
			projectId,
			selectedDepartmentId.value,
			memberId,
		);
	}

	async function setMemberBinding(
		projectId: string,
		member: AiDepartmentMemberDto,
		executorId: string,
	) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await setMemberExecutorBinding(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				member.id,
				{
					provider: 'n8n-agent',
					executorId,
					expectedVersion: member.version,
					requestId: crypto.randomUUID(),
				},
			);
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function clearMemberBinding(projectId: string, member: AiDepartmentMemberDto) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await clearMemberExecutorBinding(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				member.id,
				{ expectedVersion: member.version, requestId: crypto.randomUUID() },
			);
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function createWorkItem(
		projectId: string,
		instruction: string,
		assigneeMemberId: string | undefined,
		goalId: string | undefined,
	) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await createDepartmentWork(rootStore.restApiContext, projectId, selectedDepartmentId.value, {
				instruction,
				assigneeMemberId: assigneeMemberId ?? null,
				goalId: goalId ?? null,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId: crypto.randomUUID(),
			});
			await refreshWork(projectId);
		} finally {
			saving.value = false;
		}
	}

	async function markWorkReady(projectId: string, item: AiDepartmentWorkItemDto) {
		if (!selectedDepartmentId.value) return;
		await markDepartmentWorkReady(
			rootStore.restApiContext,
			projectId,
			selectedDepartmentId.value,
			item,
			crypto.randomUUID(),
		);
		await refreshWork(projectId);
	}

	async function review(
		projectId: string,
		item: AiDepartmentWorkItemDto,
		decision: 'accept' | 'return',
		reason?: string,
	) {
		if (!selectedDepartmentId.value || !item.currentAttemptId) return;
		await reviewDepartmentWork(
			rootStore.restApiContext,
			projectId,
			selectedDepartmentId.value,
			item,
			{
				attemptId: item.currentAttemptId,
				decision,
				reason,
				requestId: crypto.randomUUID(),
			},
		);
		await refreshWork(projectId);
	}

	return {
		departments,
		isReady,
		selectedDepartmentId,
		members,
		agents,
		goals,
		work,
		overviewWork,
		workCount,
		section,
		loading,
		saving,
		error,
		department,
		attentionWork,
		activeWork,
		load,
		markReady: markReadyFlag,
		selectDepartment,
		refreshWork,
		createGoal,
		createDepartmentItem,
		createMember,
		loadAgents,
		loadMemberBinding,
		setMemberBinding,
		clearMemberBinding,
		createWorkItem,
		markWorkReady,
		review,
	};
});
