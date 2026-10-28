import { PUBLIC_API_URL } from './api';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; detail?: unknown };

export async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(PUBLIC_API_URL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: j as T } : { ok: false, error: j.error ?? 'error', detail: j.detail };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export const ERRORS: Record<string, string> = {
  invalid_phone: 'মোবাইল নম্বর সঠিক নয় (উদাহরণ: 01712345678)',
  invalid_code: 'কোডটি ভুল বা মেয়াদ শেষ',
  too_many_requests: 'অনেকবার চেষ্টা করেছেন। ১০ মিনিট পরে আবার চেষ্টা করুন',
  phone_not_verified: 'মোবাইল নম্বর ভেরিফাই করুন',
  insufficient_stock: 'দুঃখিত, একটি পণ্যের স্টক কম। কার্ট থেকে পরিমাণ কমিয়ে আবার চেষ্টা করুন',
  prescription_required: 'কার্টে প্রেসক্রিপশন-ঔষধ আছে। এগুলো এখনো অনলাইনে অর্ডার করা যায় না',
  product_unavailable: 'কার্টের একটি পণ্য এখন পাওয়া যাচ্ছে না',
  invalid_request: 'ফর্মের তথ্য সঠিক নয়। নাম, ঠিকানা ও নম্বর দেখে নিন',
  network: 'সার্ভারের সাথে সংযোগ হয়নি। আবার চেষ্টা করুন',
};
export const errText = (code: string) => ERRORS[code] ?? 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন';

export const STATUS_BN: Record<string, string> = {
  pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', processing: 'প্রস্তুত হচ্ছে', shipped: 'পথে আছে', delivered: 'পৌঁছেছে', cancelled: 'বাতিল',
};
