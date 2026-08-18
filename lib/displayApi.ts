export async function displayApi(action: string, payload: Record<string, any> = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') || '' : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api/store-display', {
    method: 'POST',
    headers,
    body: JSON.stringify({ _action: action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = typeof data.error === 'object'
      ? (data.error.message || data.error.detail || JSON.stringify(data.error))
      : (data.error || `Request failed (${res.status})`);
    throw new Error(errMsg);
  }
  return data;
}
