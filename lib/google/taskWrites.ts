const API = 'https://tasks.googleapis.com/tasks/v1';

export type TaskChange = { listId: string } & ({ done: true } | { moveTo: string });

type Request = { url: string; init: RequestInit };

const JSON_HEADERS = { 'content-type': 'application/json' };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function taskUrl(listId: string, taskId: string) {
  return `${API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`;
}

export function parseTaskChange(body: unknown): TaskChange | null {
  const { listId, done, moveTo } = (body ?? {}) as Record<string, unknown>;
  const list = text(listId);
  const destination = text(moveTo);
  if (!list || (done === true) === Boolean(destination)) return null;
  return done === true ? { listId: list, done: true } : { listId: list, moveTo: destination! };
}

export function newTaskRequest(title: string, listId: unknown): Request {
  const list = text(listId) ?? '@default';
  return {
    url: `${API}/lists/${encodeURIComponent(list)}/tasks`,
    init: { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ title }) },
  };
}

export function taskChangeRequest(taskId: string, change: TaskChange): Request {
  const url = taskUrl(change.listId, taskId);
  if ('done' in change) {
    return {
      url,
      init: { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ status: 'completed' }) },
    };
  }
  return {
    url: `${url}/move?${new URLSearchParams({ destinationTasklist: change.moveTo })}`,
    init: { method: 'POST' },
  };
}
