import { useEffect, useState } from 'react';
import { api } from './api';

const FIELDS: [string, string, string?][] = [
  ['store_name', 'দোকানের নাম'], ['tagline', 'ট্যাগলাইন'], ['phone', 'ফোন নম্বর'], ['whatsapp', 'WhatsApp নম্বর'], ['email', 'ইমেইল'],
  ['address', 'ঠিকানা'], ['hours_text', 'সেবার সময়'], ['drug_license', 'ড্রাগ লাইসেন্স নম্বর'], ['pharmacist_name', 'ফার্মাসিস্টের নাম'],
  ['pharmacist_reg', 'ফার্মাসিস্ট রেজিস্ট্রেশন নম্বর'], ['facebook_url', 'Facebook পেজ লিংক'], ['announcement', 'টপ বারের ঘোষণা', 'ওয়েবসাইটের একদম উপরে দেখাবে'],
];

export function StoreSettings() {
  const [v, setV] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api<Record<string, string>>('GET', '/settings/store').then(setV).catch((e) => setErr(e.message)); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try { await api('PUT', '/settings/store', Object.fromEntries(FIELDS.map(([k]) => [k, v[k] ?? '']))); setMsg('সংরক্ষিত হয়েছে। ওয়েবসাইটে আসতে সর্বোচ্চ ১ মিনিট লাগতে পারে।'); }
    catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <section>
      <div className="bar"><h2>দোকানের তথ্য</h2></div>
      <form className="card wide" onSubmit={save}>
        <div className="grid2">
          {FIELDS.map(([k, label, hint]) => (
            <div className="field" key={k}>
              <label htmlFor={k}>{label}</label>
              <input id={k} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={300} />
              {hint && <small className="muted">{hint}</small>}
            </div>
          ))}
        </div>
        {msg && <p className="okmsg" role="status">{msg}</p>}{err && <p className="errmsg" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? '…' : 'সংরক্ষণ'}</button>
      </form>
    </section>
  );
}
