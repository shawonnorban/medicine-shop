export type Staff = { id: number; email: string; name: string; role: 'admin' | 'pharmacist' | 'cashier' };

/** Carries the server's error code (and count for in_use); the UI translates it, so the server never needs to know the language. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, public count?: number, detail?: string) { super(detail ?? code); }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch('/api/admin' + path, {
      method, credentials: 'include',
      headers: { 'x-requested-with': 'medshop-admin', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError(0, 'network'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'error', j.count, Array.isArray(j.issues) ? j.issues.join(', ') : undefined);
  return j as T;
}
