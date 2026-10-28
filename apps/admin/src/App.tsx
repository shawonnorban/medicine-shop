import { useEffect, useState } from 'react';
import { api, type Staff } from './api';
import { Crud, type Field } from './Crud';
import { Dashboard } from './Dashboard';
import { useT, type Key } from './i18n';
import { Orders, useWhen } from './Orders';
import { StoreSettings } from './StoreSettings';
import { Icon, useErr, type IconName } from './ui';

const ROLES: [string, Key][] = [['admin', 'role.admin'], ['pharmacist', 'role.pharmacist'], ['cashier', 'role.cashier']];

const zoneFields: Field[] = [
  { key: 'code', label: 'delivery.code', required: true, createOnly: true, hint: 'delivery.code.hint', list: false },
  { key: 'nameBn', label: 'delivery.name', required: true },
  { key: 'fee', label: 'delivery.fee', type: 'number', required: true },
  { key: 'freeOver', label: 'delivery.freeOver', type: 'number', nullable: true, hint: 'delivery.freeOver.hint' },
  { key: 'eta', label: 'delivery.eta', nullable: true },
  { key: 'sortOrder', label: 'delivery.sort', type: 'number' },
  { key: 'isActive', label: 'common.active', type: 'bool' },
];
const payFields: Field[] = [
  { key: 'nameBn', label: 'pay.name', required: true },
  { key: 'instructions', label: 'pay.instructions', nullable: true },
  { key: 'isEnabled', label: 'pay.enabled', type: 'bool', hint: 'pay.hint' },
];
const catFields: Field[] = [
  { key: 'nameBn', label: 'cat.nameBn', required: true }, { key: 'nameEn', label: 'cat.nameEn', required: true },
  { key: 'slug', label: 'cat.slug', createOnly: true, hint: 'cat.slug.hint', list: false, mono: true },
  { key: 'icon', label: 'cat.icon', nullable: true }, { key: 'sortOrder', label: 'cat.sort', type: 'number' },
  { key: 'productCount', label: 'cat.products', type: 'number' },
];
const coFields: Field[] = [{ key: 'name', label: 'co.name', required: true }, { key: 'productCount', label: 'co.products', type: 'number' }];
const staffFields: Field[] = [
  { key: 'email', label: 'staff.email', required: true, createOnly: true }, { key: 'name', label: 'staff.name', required: true },
  { key: 'role', label: 'staff.role', type: 'select', options: ROLES }, { key: 'password', label: 'staff.password', type: 'password', required: true, hint: 'staff.password.hint' },
  { key: 'isActive', label: 'staff.active', type: 'bool' },
];

type Tab = { id: string; label: Key; icon: IconName; group: Key; roles?: string[] };
const ALL = ['admin', 'pharmacist', 'cashier'];
const TABS: Tab[] = [
  { id: 'dashboard', label: 'nav.dashboard', icon: 'dashboard', group: 'grp.sales', roles: ALL },
  { id: 'orders', label: 'nav.orders', icon: 'orders', group: 'grp.sales', roles: ALL },
  { id: 'categories', label: 'nav.categories', icon: 'tag', group: 'grp.catalog' },
  { id: 'companies', label: 'nav.companies', icon: 'building', group: 'grp.catalog' },
  { id: 'store', label: 'nav.store', icon: 'store', group: 'grp.settings' },
  { id: 'delivery', label: 'nav.delivery', icon: 'delivery', group: 'grp.settings' },
  { id: 'payment', label: 'nav.payment', icon: 'payment', group: 'grp.settings' },
  { id: 'staff', label: 'nav.staff', icon: 'users', group: 'grp.system' },
  { id: 'audit', label: 'nav.audit', icon: 'history', group: 'grp.system' },
];

function Audit() {
  const { t } = useT();
  const when = useWhen();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any[]>('GET', '/audit-logs?limit=100').then(setRows).catch(() => {}); }, []);
  return (
    <section><header className="pagehead"><h1>{t('audit.title')}</h1></header>
      <div className="panel"><table className="grid"><thead><tr><th>{t('audit.time')}</th><th>{t('audit.who')}</th><th>{t('audit.action')}</th><th>{t('audit.detail')}</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td className="dim nowrap">{when(r.createdAt)}</td><td>{r.staffName ?? '—'}</td><td className="num">{r.action}</td><td className="num dim clip">{r.entityId ?? ''} {r.detail ? JSON.stringify(r.detail) : ''}</td></tr>)}
        {!rows.length && <tr><td colSpan={4} className="empty">{t('common.empty')}</td></tr>}
      </tbody></table></div></section>
  );
}

function LangSwitch() {
  const { lang, setLang } = useT();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      <button aria-pressed={lang === 'bn'} onClick={() => setLang('bn')}>বাং</button>
    </div>
  );
}

function Login({ onDone }: { onDone: (s: Staff) => void }) {
  const { t } = useT();
  const errText = useErr();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { onDone((await api<{ staff: Staff }>('POST', '/auth/login', { email, password })).staff); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }
  return (
    <main className="loginpage">
      <div className="loginside"><div className="mark">+</div><h1>{t('app.name')}</h1><p>{t('app.admin')}</p></div>
      <form className="loginform" onSubmit={submit}>
        <div className="lt"><h2>{t('login.title')}</h2><LangSwitch /></div>
        <p className="sub">{t('login.sub')}</p>
        <div className="frow"><label htmlFor="em">{t('login.email')}</label><input id="em" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="frow"><label htmlFor="pw">{t('login.password')}</label><input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {err && <div className="notice err" role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{t('login.submit')}</button>
      </form>
    </main>
  );
}

export function App() {
  const { t } = useT();
  const [staff, setStaff] = useState<Staff | null | undefined>(undefined);
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'dashboard');

  useEffect(() => { api<{ staff: Staff }>('GET', '/auth/me').then((r) => setStaff(r.staff)).catch(() => setStaff(null)); }, []);
  useEffect(() => { const f = () => setTab(location.hash.slice(1) || 'dashboard'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  if (staff === undefined) return <p className="dim" style={{ padding: 20 }}>{t('common.loading')}</p>;
  if (!staff) return <Login onDone={setStaff} />;

  const tabs = TABS.filter((x) => (x.roles ?? ['admin']).includes(staff.role));
  const current = tabs.find((x) => x.id === tab) ?? tabs[0];
  const groups = [...new Set(tabs.map((x) => x.group))];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="mark sm">+</span><div><b>{t('app.name')}</b><small>{t('app.admin')}</small></div></div>
        <nav>
          {groups.map((g) => (
            <div key={g} className="navgroup"><span>{t(g)}</span>
              {tabs.filter((x) => x.group === g).map((x) => <a key={x.id} href={`#${x.id}`} className={current.id === x.id ? 'on' : ''}><Icon name={x.icon} />{t(x.label)}</a>)}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <span className="crumb">{t(current.group)} <i>/</i> <b>{t(current.label)}</b></span>
          <div className="topright">
            <LangSwitch />
            <span className="user"><span className="avatar">{staff.name.slice(0, 1).toUpperCase()}</span><span className="uname">{staff.name}<small>{t(ROLES.find(([k]) => k === staff.role)![1])}</small></span></span>
            <button className="icon" title={t('common.logout')} aria-label={t('common.logout')} onClick={async () => { await api('POST', '/auth/logout'); setStaff(null); }}><Icon name="logout" size={14} /></button>
          </div>
        </div>
        <main className="content">
          {current.id === 'dashboard' && <Dashboard />}
          {current.id === 'orders' && <Orders canEdit={staff.role !== 'cashier'} />}
          {current.id === 'store' && <StoreSettings />}
          {current.id === 'delivery' && <Crud title="delivery.title" path="/delivery-zones" fields={zoneFields} defaults={{ isActive: true, sortOrder: 0, fee: 0 }} addLabel="delivery.add" note="delivery.note" />}
          {current.id === 'payment' && <Crud title="pay.title" path="/payment-methods" idKey="code" fields={payFields} canCreate={false} canDelete={false} />}
          {current.id === 'categories' && <Crud title="cat.title" path="/categories" fields={catFields} defaults={{ sortOrder: 0 }} addLabel="cat.add" note="cat.note" />}
          {current.id === 'companies' && <Crud title="co.title" path="/companies" fields={coFields} addLabel="co.add" />}
          {current.id === 'staff' && <Crud title="staff.title" path="/staff" fields={staffFields} defaults={{ role: 'cashier', isActive: true }} addLabel="staff.add" note="staff.note" />}
          {current.id === 'audit' && <Audit />}
        </main>
      </div>
    </div>
  );
}
