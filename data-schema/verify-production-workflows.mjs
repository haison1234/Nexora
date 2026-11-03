import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const folder = new URL('./workflows/', import.meta.url);
const files = readdirSync(folder)
	.filter((x) => x.endsWith('.json'))
	.sort();
assert.equal(files.length, 8);
const flows = files.map((x) => JSON.parse(readFileSync(new URL(x, folder), 'utf8')));
let checkedExpressions = 0;
for (const flow of flows) {
	const names = new Set(flow.nodes.map((n) => n.name));
	assert.equal(names.size, flow.nodes.length);
	assert.equal(flow.active, false);
	for (const [source, connections] of Object.entries(flow.connections)) {
		assert(names.has(source), source);
		for (const outputs of Object.values(connections))
			for (const output of outputs)
				for (const target of output) assert(names.has(target.node), target.node);
	}
	for (const node of flow.nodes) {
		if (node.type === 'n8n-nodes-base.code')
			new vm.Script(`(async()=>{${node.parameters.jsCode}\n})()`);
		function visit(value) {
			if (typeof value === 'string' && value.startsWith('={{ ') && value.endsWith(' }}')) {
				new vm.Script('(' + value.slice(4, -3) + ')');
				checkedExpressions++;
			} else if (value && typeof value === 'object') for (const v of Object.values(value)) visit(v);
		}
		visit(node.parameters);
		if (node.type === 'n8n-nodes-base.httpRequest')
			assert.notEqual(node.retryOnFail, true, 'Publish requests must not retry automatically');
		if (node.type === 'n8n-nodes-base.dataTable' && node.parameters.operation !== 'get') {
			assert(Object.keys(node.parameters.columns.value).length > 0);
			assert(node.parameters.columns.schema.length > 0);
		}
	}
}
const cfg = {
	brandId: 'techviet',
	model: 'test/model',
	maxVersions: 3,
	toEmail: 'owner@example.com',
};
const post = {
	postId: 'p1',
	planId: 'plan1',
	accountId: 'a1',
	platform: 'INSTAGRAM',
	currentVersionId: 'p1-v1',
	approvedVersionId: 'p1-v1',
	status: 'APPROVED',
	scheduledAt: '2020-01-01T00:00:00+07:00',
	cfg,
};
const version = {
	versionId: 'p1-v1',
	postId: 'p1',
	versionNumber: 1,
	caption: 'Caption',
	hashtags: '#AI',
	imagePrompt: 'A store',
};
const base = {
	...post,
	version,
	asset: { assetId: 'image1', publicUrl: 'https://example.com/image.jpg', status: 'READY' },
	expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
function run(index, name, input, refs = {}, runIndex = 0) {
	const node = flows[index].nodes.find((n) => n.name === name);
	assert(node, name);
	const items = (Array.isArray(input) ? input : [input]).map((json) => ({ json }));
	const sandbox = {
		$json: items[0].json,
		$input: { first: () => items[0], all: () => items },
		$execution: { id: 'test-execution' },
		$runIndex: runIndex,
		$: (key) => ({ first: () => ({ json: refs[key] ?? cfg }) }),
		Date,
		console,
	};
	return vm.runInNewContext(`(()=>{${node.parameters.jsCode}\n})()`, sandbox, { timeout: 1000 });
}
let tests = 0;
const test = (name, fn) => {
	fn();
	tests++;
	console.log('PASS ' + name);
};
test('Writer preserves caption quotes and rejects missing image prompt', () => {
	const refs = { 'Writer prompt': { ...base, versionNumber: 2 } };
	const r = run(
		1,
		'Validate draft',
		{
			output: JSON.stringify({
				caption: 'Xin chào "bạn"\nDòng mới',
				hashtags: ['#AI'],
				imagePrompt: 'A shop',
			}),
		},
		refs,
	)[0].json;
	assert.equal(r.versionId, 'p1-v2');
	assert(r.caption.includes('\n'));
	assert.throws(() => run(1, 'Validate draft', { output: '{"caption":"x"}' }, refs));
});
test('Instagram rejects captions over 2200 characters', () =>
	assert.throws(() =>
		run(
			2,
			'Validate draft',
			{ output: JSON.stringify({ caption: 'x'.repeat(2201), imagePrompt: 'shop' }) },
			{ 'Writer prompt': { ...base, versionNumber: 1 } },
		),
	));
test('Reviewer sends rejected content back for revision', () =>
	assert.equal(
		run(
			4,
			'Validate review',
			{ output: '{"decision":"REJECTED","feedback":"Fix"}' },
			{ 'Review prompt': base },
		)[0].json.nextStatus,
		'NEEDS_REWRITE',
	));
test('Reviewer stops after the last version', () =>
	assert.equal(
		run(
			4,
			'Validate review',
			{ output: '{"decision":"REJECTED","feedback":"Fix"}' },
			{ 'Review prompt': { ...base, version: { ...version, versionNumber: 3 } } },
		)[0].json.nextStatus,
		'REVIEW_FAILED',
	));
test('Reviewer rejects fabricated decisions', () =>
	assert.throws(() =>
		run(
			4,
			'Validate review',
			{ output: '{"decision":"OK","feedback":""}' },
			{ 'Review prompt': base },
		),
	));
test('Human music choice queues manual Instagram posting', () =>
	assert.equal(
		run(
			5,
			'Validate human decision',
			{ data: { decision: 'APPROVE_MUSIC' } },
			{ 'Approval context': base },
		)[0].json.nextStatus,
		'MANUAL_READY',
	));
test('Missing human choice cannot approve a post', () =>
	assert.throws(() =>
		run(5, 'Validate human decision', { data: {} }, { 'Approval context': base }),
	));
test('Expired approval cannot publish', () =>
	assert.equal(
		run(
			5,
			'Validate human decision',
			{},
			{ 'Approval context': { ...base, expiresAt: '2020-01-01T00:00:00Z' } },
		)[0].json.nextStatus,
		'APPROVAL_EXPIRED',
	));
test('Stale approval cannot approve a newer version', () =>
	assert.throws(() =>
		run(
			5,
			'Reject stale decision',
			{ ...post, currentVersionId: 'p1-v2', status: 'WAITING_APPROVAL' },
			{ 'Validate human decision': base },
		),
	));
test('Facebook cannot request Instagram music', () =>
	assert.throws(() =>
		run(
			5,
			'Validate human decision',
			{ data: { decision: 'APPROVE_MUSIC' } },
			{ 'Approval context': { ...base, platform: 'FACEBOOK' } },
		),
	));
test('Publisher blocks already published and uncertain attempts', () => {
	for (const status of ['PUBLISHED', 'PUBLISHING', 'UNKNOWN', 'MANUAL_SENT'])
		assert.equal(
			run(
				7,
				'Prevent repeated publish',
				{ publicationId: 'pub1', status },
				{ 'Publish context': base },
			).length,
			0,
		);
});
test('Publisher increments the attempt counter after an explicit retry', () =>
	assert.equal(
		run(
			6,
			'Prevent repeated publish',
			{ publicationId: 'pub1', status: 'FAILED', attemptCount: 2 },
			{ 'Publish context': { ...base, publicationId: 'pub1' } },
		)[0].json.attemptCount,
		3,
	));
test('Publisher only records success after an API ID', () => {
	assert.equal(
		run(6, 'Interpret publish response', { post_id: '123_456' })[0].json.status,
		'PUBLISHED',
	);
	assert.equal(
		run(6, 'Interpret publish response', { error: { message: 'timeout' } })[0].json.status,
		'UNKNOWN',
	);
	assert.equal(
		run(6, 'Interpret publish response', { error: { code: 190, message: 'Invalid token' } })[0].json
			.status,
		'FAILED',
	);
});
test('Instagram polling has a finite limit', () => {
	assert.equal(
		run(7, 'Container polling result', { status_code: 'IN_PROGRESS' }, {}, 11)[0].json.retry,
		false,
	);
	assert.equal(run(7, 'Container polling result', { status_code: 'FINISHED' })[0].json.ready, true);
});
test('Cloudinary URL is converted to JPEG delivery', () => {
	const result = run(
		3,
		'Validate stored image',
		{
			secure_url: 'https://res.cloudinary.com/test/image/upload/v1/test.png',
			public_id: 'test',
			width: 512,
			height: 512,
			bytes: 20,
		},
		{
			'Preserve image metadata': {
				...base,
				assetId: 'image1',
				seed: 42,
				localPath: '/tmp/test.png',
			},
		},
	)[0].json;
	assert.equal(result.mimeType, 'image/jpeg');
	assert(result.publicUrl.includes('/upload/f_jpg,q_90/'));
});
test('Planner validates exactly 30 consecutive dates', () => {
	const start = '2026-11-02';
	const plans = Array.from({ length: 30 }, (_, i) => ({
		date: new Date(Date.parse(start + 'T00:00:00+07:00') + i * 86400000 + 7 * 3600000)
			.toISOString()
			.slice(0, 10),
		title: 'Topic ' + i,
		brief: 'Brief',
	}));
	const refs = { 'Planning prompt': { cfg, count: 30, start, existing: [] } };
	assert.equal(run(0, 'Validate plans', { output: JSON.stringify({ plans }) }, refs).length, 30);
	plans[1].date = plans[0].date;
	assert.throws(() => run(0, 'Validate plans', { output: JSON.stringify({ plans }) }, refs));
});
console.log(
	JSON.stringify({
		workflows: flows.length,
		nodes: flows.reduce((a, w) => a + w.nodes.length, 0),
		checkedExpressions,
		behaviorTests: tests,
	}),
);
