import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { sql } from '../db/client.js';

const SECRET = process.env.APP_SECRET ?? 'dev-secret-change-me';
if (process.env.NODE_ENV === 'production' && SECRET === 'dev-secret-change-me') throw new Error('APP_SECRET must be set in production');
const OTP_TTL_MIN = 5;
const TOKEN_TTL_MIN = 30;
const MAX_REQUESTS_PER_10_MIN = 3;
const MAX_ATTEMPTS = 5;

const mac = (s: string) => createHmac('sha256', SECRET).update(s).digest('hex');
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Bangladeshi mobile: 01XXXXXXXXX, also accepts +880 / 880 prefixes. */
export function normalisePhone(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, '').replace(/^\+?880/, '0');
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

/** SMS delivery is a stub until a provider is chosen; in dev the code is logged and optionally returned. */
async function sendSms(phone: string, text: string) {
  console.log(`[sms:stub] to ${phone}: ${text}`);
}

export async function requestOtp(phone: string): Promise<{ devCode?: string }> {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM otp_codes WHERE phone = ${phone} AND created_at > now() - interval '10 minutes'`;
  if (n >= MAX_REQUESTS_PER_10_MIN) throw Object.assign(new Error('too_many_requests'), { statusCode: 429 });
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await sql`INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES (${phone}, ${mac(phone + ':' + code)}, now() + ${OTP_TTL_MIN + ' minutes'}::interval)`;
  await sendSms(phone, `আপনার ভেরিফিকেশন কোড: ${code} (${OTP_TTL_MIN} মিনিট বৈধ)`);
  return process.env.OTP_DEV === '1' ? { devCode: code } : {};
}

/** Returns a signed, short-lived token proving this phone was verified. */
export async function verifyOtp(phone: string, code: string): Promise<string | null> {
  const [row] = await sql`
    SELECT id, code_hash, attempts FROM otp_codes
    WHERE phone = ${phone} AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1`;
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;
  await sql`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
  if (!safeEq(row.code_hash, mac(phone + ':' + code))) return null;
  await sql`UPDATE otp_codes SET used_at = now() WHERE id = ${row.id}`;
  const exp = Date.now() + TOKEN_TTL_MIN * 60_000;
  const body = `${phone}.${exp}`;
  return `${body}.${mac('tok:' + body)}`;
}

export function checkToken(phone: string, token: string): boolean {
  const [p, exp, sig] = token.split('.');
  if (p !== phone || !exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, mac(`tok:${p}.${exp}`));
}
