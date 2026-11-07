import type { Point } from './org-layout';

const DATABASE_NAME = 'n8n-ai-department-org-layout';
const STORE_NAME = 'positions';

export type OrgLayoutScope = {
	userId: string;
	projectId: string;
	departmentId: string;
};

type StoredPosition = OrgLayoutScope & {
	memberId: string;
	position: Point;
	key: string;
};

function scopePrefix(scope: OrgLayoutScope) {
	return (
		[scope.userId, scope.projectId, scope.departmentId].map(encodeURIComponent).join('/') + '/'
	);
}

function positionKey(scope: OrgLayoutScope, memberId: string) {
	return `${scopePrefix(scope)}${encodeURIComponent(memberId)}`;
}

async function openDatabase(): Promise<IDBDatabase> {
	return await new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('Could not open Org layout storage.'));
	});
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => T) {
	const database = await openDatabase();
	try {
		const transaction = database.transaction(STORE_NAME, mode);
		const result = action(transaction.objectStore(STORE_NAME));
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(transaction.error ?? new Error('Could not update Org layout storage.'));
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('Org layout storage update was aborted.'));
		});
		return result;
	} finally {
		database.close();
	}
}

export async function loadOrgPositions(scope: OrgLayoutScope): Promise<Record<string, Point>> {
	return await withStore('readonly', async (store) => {
		const prefix = scopePrefix(scope);
		const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, false);
		const request = store.getAll(range);
		return await new Promise<Record<string, Point>>((resolve, reject) => {
			request.onsuccess = () => {
				const positions: Record<string, Point> = {};
				for (const item of request.result as StoredPosition[]) {
					if (Number.isFinite(item.position?.x) && Number.isFinite(item.position?.y)) {
						positions[item.memberId] = item.position;
					}
				}
				resolve(positions);
			};
			request.onerror = () => reject(request.error ?? new Error('Could not load Org positions.'));
		});
	});
}

export async function saveOrgPosition(
	scope: OrgLayoutScope,
	memberId: string,
	position: Point,
): Promise<void> {
	await withStore('readwrite', (store) =>
		store.put({
			...scope,
			memberId,
			position,
			key: positionKey(scope, memberId),
		} satisfies StoredPosition),
	);
}

export async function removeOrgPositions(
	scope: OrgLayoutScope,
	memberIds?: ReadonlySet<string>,
): Promise<void> {
	await withStore('readwrite', (store) => {
		const prefix = scopePrefix(scope);
		const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, false);
		const request = store.openCursor(range);
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return;
			const position = cursor.value as StoredPosition;
			if (memberIds?.has(position.memberId) !== true) cursor.delete();
			cursor.continue();
		};
	});
}
