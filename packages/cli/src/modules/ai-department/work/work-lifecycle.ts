import type { AiDepartmentWorkState } from '@n8n/api-types';
import { ConflictError } from '@n8n/errors';

export type WorkLifecycleEvent =
	| 'ready'
	| 'start'
	| 'executor_unavailable'
	| 'blocked'
	| 'succeeded'
	| 'runtime_failed'
	| 'retry'
	| 'review_accepted'
	| 'review_returned'
	| 'cancel'
	| 'cancel_requested'
	| 'cancellation_confirmed';

const transitions: Record<
	AiDepartmentWorkState,
	Partial<Record<WorkLifecycleEvent, AiDepartmentWorkState>>
> = {
	backlog: { ready: 'ready', cancel: 'cancelled' },
	ready: {
		start: 'running',
		executor_unavailable: 'blocked',
		cancel: 'cancelled',
		cancel_requested: 'ready',
		cancellation_confirmed: 'cancelled',
	},
	running: {
		blocked: 'blocked',
		succeeded: 'review',
		runtime_failed: 'blocked',
		cancel_requested: 'running',
		cancellation_confirmed: 'cancelled',
	},
	blocked: {
		ready: 'ready',
		start: 'running',
		succeeded: 'review',
		runtime_failed: 'blocked',
		cancel: 'cancelled',
		cancel_requested: 'blocked',
		cancellation_confirmed: 'cancelled',
	},
	review: { review_accepted: 'done', review_returned: 'ready' },
	done: {},
	cancelled: {},
};

export function transitionWorkState(
	current: AiDepartmentWorkState,
	event: WorkLifecycleEvent,
	activeAttempt: boolean,
	reviewPolicy: 'required' | 'automatic' = 'required',
): AiDepartmentWorkState {
	if (
		[
			'blocked',
			'succeeded',
			'runtime_failed',
			'cancel_requested',
			'cancellation_confirmed',
		].includes(event) &&
		!activeAttempt
	) {
		throw new ConflictError('This event requires an active attempt.');
	}
	if (event === 'cancellation_confirmed' && activeAttempt) return 'cancelled';
	if (event === 'start' && current === 'blocked' && !activeAttempt) {
		return 'running';
	}
	if (event === 'start' && current === 'ready' && activeAttempt) {
		throw new ConflictError('Ready work cannot start while another attempt is active.');
	}
	if (event === 'ready' && activeAttempt) {
		throw new ConflictError('Work with an active attempt cannot be made ready.');
	}
	if (event === 'retry' && activeAttempt) {
		throw new ConflictError('Work with an active attempt cannot be retried.');
	}
	if (event === 'executor_unavailable' && activeAttempt) {
		throw new ConflictError('Work with an active attempt cannot start a new dispatch.');
	}
	if ((event === 'review_accepted' || event === 'review_returned') && activeAttempt) {
		throw new ConflictError('Work cannot be reviewed while an attempt is active.');
	}
	if (event === 'cancel' && activeAttempt) {
		throw new ConflictError('Work with an active attempt requires a stop request.');
	}
	const next =
		['running', 'blocked'].includes(current) &&
		event === 'succeeded' &&
		reviewPolicy === 'automatic'
			? 'done'
			: event === 'retry' && current === 'blocked'
				? 'ready'
				: transitions[current][event];
	if (!next) throw new ConflictError(`Work cannot transition from ${current} via ${event}.`);
	return next;
}
