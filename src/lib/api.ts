let token: string | undefined;
export function clearCsrf() { token = undefined; }
async function csrf() {
  const response = await window.fetch('/api/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('לא ניתן להתחבר לשרת');
  token = (await response.json()).token;
  return token!;
}
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const write = !['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase());
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (write) headers.set('X-CSRF-TOKEN', token || await csrf());
  const send = () => window.fetch(url, { ...init, headers, credentials: 'same-origin' });
  let result = await send();
  // Laravel rejects a stale CSRF token before executing the controller.
  if (write && result.status === 419) {
    headers.set('X-CSRF-TOKEN', await csrf());
    result = await send();
  }
  return result;
}
export async function request<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiFetch(url, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const body = res.status === 204 ? {} : await res.json();
  if (!res.ok) {
    const messages = Object.values(body.errors || {}).flat().join(' ');
    throw new Error(messages || body.message || body.error || 'הבקשה נכשלה');
  }
  return body as T;
}
