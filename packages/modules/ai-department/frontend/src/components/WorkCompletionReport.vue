<script setup lang="ts">
import type { AiDepartmentWorkCompletionReport } from '@n8n/api-types';
import { useI18n, type BaseTextKey } from '@n8n/i18n';

const props = defineProps<{ report: AiDepartmentWorkCompletionReport }>();
const i18n = useI18n();
const text = (key: string) => i18n.baseText(key as BaseTextKey);

const sections = [
	{ key: 'completedWork', label: 'aiDepartment.report.completedWork' },
	{ key: 'checkedEvidence', label: 'aiDepartment.report.checkedEvidence' },
	{ key: 'openIssues', label: 'aiDepartment.report.openIssues' },
	{ key: 'nextSteps', label: 'aiDepartment.report.nextSteps' },
] as const;
</script>

<template>
	<section class="completion-report" :aria-label="text('aiDepartment.report.title')">
		<h4>{{ text('aiDepartment.report.title') }}</h4>
		<p>{{ props.report.result }}</p>
		<section v-for="section in sections" :key="section.key">
			<h5>{{ text(section.label) }}</h5>
			<ul v-if="props.report[section.key].length">
				<li v-for="(item, index) in props.report[section.key]" :key="index">
					{{ typeof item === 'string' ? item : item.summary }}
				</li>
			</ul>
			<p v-else>{{ text('aiDepartment.report.empty') }}</p>
		</section>
	</section>
</template>
