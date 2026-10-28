import { useEffect, useState } from 'react';
import { api, ApiError, type Staff } from './api';
import { Crud, type Field } from './Crud';
import { Orders } from './Orders';
import { StoreSettings } from './StoreSettings';

const ROLES: [string, string][] = [['admin', 'অ্যাডমিন'], ['pharmacist', 'ফার্মাসিস্ট'], ['cashier', 'ক্যাশিয়ার']];

const zoneFields: Field[] = [
  { key: 'code', label: 'কোড', required: true, createOnly: true, hint: 'ইংরেজি ছোট হাতের অক্ষর (যেমন dhaka)। পরে বদলানো যায় না', list: false },
  { key: 'nameBn', label: 'এলাকার নাম', required: true },
  { key: 'fee', label: 'ডেলিভারি চার্জ (৳)', type: 'number', required: true },
  { key: 'freeOver', label: 'ফ্রি ডেলিভারির সীমা (৳)', type: 'number', nullable: true, hint: 'এর বেশি অর্ডারে চার্জ লাগবে না। ফাঁকা রাখলে কখনো ফ্রি নয়' },
  { key: 'eta', label: 'সময়', nullable: true },
  { key: 'sortOrder', label: 'ক্রম', type: 'number' },
  { key: 'isActive', label: 'চালু', type: 'bool' },
];
const payFields: Field[] = [
  { key: 'nameBn', label: 'নাম', required: true },
  { key: 'instructions', label: 'নির্দেশনা (গ্রাহক দেখবে)', nullable: true },
  { key: 'isEnabled', label: 'চালু', type: 'bool', hint: 'bKash/Nagad এখনো চালু করা যায় না (গেটওয়ে যুক্ত হয়নি)' },
];
const catFields: Field[] = [
  { key: 'nameBn', label: 'বাংলা নাম', required: true }, { key: 'nameEn', label: 'ইংরেজি নাম', required: true },
  { key: 'slug', label: 'স্লাগ', createOnly: true, hint: 'খালি রাখলে ইংরেজি নাম থেকে তৈরি হবে', list: false },
  { key: 'icon', label: 'আইকন (ইমোজি)', nullable: true }, { key: 'sortOrder', label: 'ক্রম', type: 'number' },
  { key: 'productCount', label: 'পণ্য', render: (v) => String(v), },
];
const coFields: Field[] = [{ key: 'name', label: 'কোম্পানির নাম', required: true }, { key: 'productCount', label: 'পণ্য' }];
const staffFields: Field[] = [
  { key: 'email', label: 'ইমেইল', required: true, createOnly: true }, { key: 'name', label: 'নাম', required: true },
  { key: 'role', label: 'ভূমিকা', type: 'select', options: ROLES }, { key: 'password', label: 'পাসওয়ার্ড', type: 'password', required: true, hint: 'কমপক্ষে ১০ অক্ষর' },
  { key: 'isActive', label: 'সক্রিয়', type: 'bool' },
];

type Tab = { id: string; label: string; roles?: string[] };
const TABS: Tab[] = [
  { id: 'orders', label: 'অর্ডার', roles: ['admin', 'pharmacist', 'cashier'] },
  { id: 'store', label: 'দোকানের তথ্য' }, { id: 'delivery', label: 'ডেলিভারি' }, { id: 'payment', label: 'পেমেন্ট' },
  { id: 'categories', label: 'ক্যাটাগরি' }, { id: 'companies', label: 'কোম্পানি' }, { id: 'staff', label: 'ইউজার' }, { id: 'audit', label: 'অডিট লগ' },
];

function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any[]>('GET', '/audit-logs?limit=100').then(setRows); }, []);
  return (
    <section><div className="bar"><h2>অডিট লগ</h2></div>
      <div className="tablewrap"><table><thead><tr><th>সময়</th><th>কে</th><th>কাজ</th><th>বিস্তারিত</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td className="muted">{new Date(r.createdAt).toLocaleString('bn-BD')}</td><td>{r.staffName ?? '—'}</td><td className="mono">{r.action}</td><td className="mono small">{r.entityId ?? ''} {r.detail ? JSON.stringify(r.detail).slice(0, 120) : ''}</td></tr>)}
      </tbody></table></div></section>
  );
}

function Login({ onDone }: { onDone: (s: Staff) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { onDone((await api<{ staff: Staff }>('POST', '/auth/login', { email, password })).staff); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <main className="login"><form className="card" onSubmit={submit}>
      <h1>অ্যাডমিন লগইন</h1>
      <div className="field"><label htmlFor="em">ইমেইল</label><input id="em" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw">পাসওয়ার্ড</label><input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {err && <p className="errmsg" role="alert">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? '…' : 'লগইন'}</button>
    </form></main>
  );
}

export function App() {
  const [staff, setStaff] = useState<Staff | null | undefined>(undefined);
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'orders');

  useEffect(() => { api<{ staff: Staff }>('GET', '/auth/me').then((r) => setStaff(r.staff)).catch((e) => setStaff(e instanceof ApiError ? null : null)); }, []);
  useEffect(() => { const f = () => setTab(location.hash.slice(1) || 'orders'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  if (staff === undefined) return <p className="muted" style={{ padding: 24 }}>লোড হচ্ছে…</p>;
  if (!staff) return <Login onDone={setStaff} />;

  const tabs = TABS.filter((t) => (t.roles ?? ['admin']).includes(staff.role));
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="shell">
      <aside>
        <div className="brand">আপনার ফার্মেসি<small>অ্যাডমিন</small></div>
        <nav>{tabs.map((t) => <a key={t.id} href={`#${t.id}`} className={current.id === t.id ? 'on' : ''}>{t.label}</a>)}</nav>
        <div className="who">{staff.name}<small>{ROLES.find(([k]) => k === staff.role)?.[1]}</small>
          <button className="link" onClick={async () => { await api('POST', '/auth/logout'); setStaff(null); }}>লগআউট</button></div>
      </aside>
      <main className="content">
        {current.id === 'orders' && <Orders canEdit={staff.role !== 'cashier'} />}
        {current.id === 'store' && <StoreSettings />}
        {current.id === 'delivery' && <Crud title="ডেলিভারি এলাকা ও চার্জ" path="/delivery-zones" fields={zoneFields} defaults={{ isActive: true, sortOrder: 0, fee: 0 }} addLabel="এলাকা যোগ করুন"
          note="চেকআউটে গ্রাহক এখান থেকেই এলাকা বেছে নেন। অর্ডারে ব্যবহৃত এলাকা মোছা যায় না, বন্ধ করে দিন।" />}
        {current.id === 'payment' && <Crud title="পেমেন্ট পদ্ধতি" path="/payment-methods" idKey="code" fields={payFields} canCreate={false} canDelete={false} />}
        {current.id === 'categories' && <Crud title="ক্যাটাগরি" path="/categories" fields={catFields} defaults={{ sortOrder: 0 }} addLabel="ক্যাটাগরি যোগ করুন" note="পণ্য আছে এমন ক্যাটাগরি মোছা যায় না।" />}
        {current.id === 'companies' && <Crud title="কোম্পানি" path="/companies" fields={coFields} addLabel="কোম্পানি যোগ করুন" />}
        {current.id === 'staff' && <Crud title="ইউজার ও ভূমিকা" path="/staff" fields={staffFields} defaults={{ role: 'cashier', isActive: true }} addLabel="ইউজার যোগ করুন"
          note="অ্যাডমিন: সব কিছু · ফার্মাসিস্ট: অর্ডার দেখা ও আপডেট · ক্যাশিয়ার: অর্ডার দেখা" />}
        {current.id === 'audit' && <Audit />}
      </main>
    </div>
  );
}
