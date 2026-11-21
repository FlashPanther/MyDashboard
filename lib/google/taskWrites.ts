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

function taskUrl(listId: string, taskId: string) {
  return `${tasksUrl(listId)}/${encodeURIComponent(taskId)}`;
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

export function taskRequest(listId: string, taskId: string): GoogleCall {
  return { url: taskUrl(listId, taskId), init: {} };
}

export function taskDeleteRequest(listId: string, taskId: string): GoogleCall {
  return { url: taskUrl(listId, taskId), init: { method: 'DELETE' } };
}

/** Seuls les champs donnés sont modifiés : renommer ne touche pas à l'état, cocher ne touche pas au titre. */
export function taskUpdateRequest(listId: string, taskId: string, { title, done }: { title?: string; done?: boolean }): GoogleCall {
  const state = done === undefined ? {} : done ? { status: 'completed' } : { status: 'needsAction', completed: null };
  return { url: taskUrl(listId, taskId), init: jsonInit('PATCH', { ...(title === undefined ? {} : { title }), ...state }) };
}

/** Les tâches d'une liste, faites et masquées comprises ; avec `updatedMin`, seulement celles modifiées depuis, supprimées comprises. */
export function tasksInListRequest(listId: string, pageToken?: string, updatedMin?: string): GoogleCall {
  const params = new URLSearchParams({
    maxResults: '100',
    showCompleted: 'true',
    showHidden: 'true',
    ...(updatedMin ? { updatedMin, showDeleted: 'true' } : {}),
    ...(pageToken ? { pageToken } : {}),
  });
  return { url: `${tasksUrl(listId)}?${params}`, init: {} };
}

export function newTaskListRequest(title: string): GoogleCall {
  return { url: `${API}/users/@me/lists`, init: jsonInit('POST', { title }) };
}

export function taskChangeRequest(taskId: string, change: TaskChange): GoogleCall {
  const url = taskUrl(change.listId, taskId);
  if ('done' in change) return { url, init: jsonInit('PATCH', { status: 'completed' }) };
  return {
    url: `${url}/move?${new URLSearchParams({ destinationTasklist: change.moveTo })}`,
    init: { method: 'POST' },
  };
}
