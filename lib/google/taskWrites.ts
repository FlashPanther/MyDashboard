const API = 'https://tasks.googleapis.com/tasks/v1';
/** Longueur maximale d'un titre de tache chez Google. */
export const TASK_TITLE_MAX = 1024;

export type TaskChange = { listId: string } & ({ done: true } | { moveTo: string });

type GoogleCall = { url: string; init: RequestInit };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function tasksUrl(listId: string) {
  return `${API}/lists/${encodeURIComponent(listId)}/tasks`;
}

function jsonInit(method: string, payload: object): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) };
}

export function parseTaskChange(body: unknown): TaskChange | null {
  const { listId, done, moveTo } = (body ?? {}) as Record<string, unknown>;
  const list = text(listId);
  const destination = text(moveTo);
  if (!list) return null;
  if (done === true && !destination) return { listId: list, done: true };
  if (done === undefined && destination) return { listId: list, moveTo: destination };
  return null;
}

export function newTaskRequest(title: string, listId: unknown, extra: { notes?: string; done?: boolean } = {}): GoogleCall {
  const list = text(listId);
  const payload = { title, ...(extra.notes ? { notes: extra.notes } : {}), ...(extra.done ? { status: 'completed' } : {}) };
  return {
    url: list ? tasksUrl(list) : `${API}/lists/@default/tasks`,
    init: jsonInit('POST', payload),
  };
}

export function taskListsRequest(pageToken?: string): GoogleCall {
  const params = new URLSearchParams({ maxResults: '100', ...(pageToken ? { pageToken } : {}) });
  return { url: `${API}/users/@me/lists?${params}`, init: {} };
}

export function newTaskListRequest(title: string): GoogleCall {
  return { url: `${API}/users/@me/lists`, init: jsonInit('POST', { title }) };
}

export function taskChangeRequest(taskId: string, change: TaskChange): GoogleCall {
  const url = `${tasksUrl(change.listId)}/${encodeURIComponent(taskId)}`;
  if ('done' in change) return { url, init: jsonInit('PATCH', { status: 'completed' }) };
  return {
    url: `${url}/move?${new URLSearchParams({ destinationTasklist: change.moveTo })}`,
    init: { method: 'POST' },
  };
}
