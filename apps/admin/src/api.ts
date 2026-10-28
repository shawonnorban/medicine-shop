export type Staff = { id: number; email: string; name: string; role: 'admin' | 'pharmacist' | 'cashier' };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'ইমেইল বা পাসওয়ার্ড ভুল',
  too_many_attempts: 'অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন',
  duplicate_code: 'এই কোড আগেই আছে', duplicate_slug: 'এই স্লাগ আগেই আছে', duplicate_name: 'এই নাম আগেই আছে', duplicate_email: 'এই ইমেইল আগেই আছে',
  forbidden: 'এই কাজের অনুমতি আপনার নেই', invalid_request: 'তথ্য সঠিক নয়', invalid_transition: 'এই অবস্থায় এখন যাওয়া যায় না',
};

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api/admin' + path, {
    method, credentials: 'include',
    headers: { 'x-requested-with': 'medshop-admin', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'error', j.message ?? (j.issues ? j.issues.join(', ') : MESSAGES[j.error]) ?? j.error);
  return j as T;
}
