import type { AiDepartmentMemberDto } from '@n8n/api-types';

export type OrgTreeNode = { member: AiDepartmentMemberDto; children: OrgTreeNode[] };

const byName = (a: AiDepartmentMemberDto, b: AiDepartmentMemberDto) =>
	a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** Members that may become the manager of `memberId`: active, not itself, not one of its reports. */
export function eligibleManagers(
	members: AiDepartmentMemberDto[],
	memberId: string,
): AiDepartmentMemberDto[] {
	const reports = new Set<string>([memberId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const { id, managerMemberId } of members) {
			if (managerMemberId && reports.has(managerMemberId) && !reports.has(id)) {
				reports.add(id);
				grew = true;
			}
		}
	}
	return members.filter(({ id, archived }) => !archived && !reports.has(id)).sort(byName);
}

/** Build reporting trees from `managerMemberId`. Members in a cycle become extra roots. */
export function buildOrgTree(members: AiDepartmentMemberDto[]): OrgTreeNode[] {
	const byId = new Map(members.map((member) => [member.id, member]));
	const childrenOf = new Map<string, AiDepartmentMemberDto[]>();
	const rootMembers: AiDepartmentMemberDto[] = [];
	for (const member of members) {
		const parent = member.managerMemberId;
		if (parent && parent !== member.id && byId.has(parent)) {
			childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), member]);
		} else {
			rootMembers.push(member);
		}
	}

	const visited = new Set<string>();
	const build = (member: AiDepartmentMemberDto): OrgTreeNode => {
		visited.add(member.id);
		const children = (childrenOf.get(member.id) ?? [])
			.filter(({ id }) => !visited.has(id))
			.sort(byName)
			.map(build);
		return { member, children };
	};

	const trees = [...rootMembers].sort(byName).map(build);
	for (const member of [...members].sort(byName)) {
		if (!visited.has(member.id)) trees.push(build(member));
	}
	return trees;
}
