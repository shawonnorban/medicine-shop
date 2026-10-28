import { useEffect, useState } from 'react';
import { api } from './api';
import { useT, type Key } from './i18n';
import { useErr } from './ui';

const FIELDS = ['store_name', 'tagline', 'phone', 'whatsapp', 'email', 'address', 'hours_text', 'drug_license', 'pharmacist_name', 'pharmacist_reg', 'facebook_url', 'announcement'] as const;

export function StoreSettings() {
  const { t } = useT();
  const errText = useErr();
  const [v, setV] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api<Record<string, string>>('GET', '/settings/store').then(setV).catch((e) => setErr(errText(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('PUT', '/settings/store', Object.fromEntries(FIELDS.map((k) => [k, v[k] ?? '']))); setFlash(t('common.saved')); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }
  return (
    <section>
      <header className="pagehead"><div><h1>{t('store.title')}</h1><p className="sub">{t('store.hint')}</p></div>
        <div className="tools"><button form="storeform" className="btn primary" disabled={busy}>{t('common.save')}</button></div></header>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && <div className="notice err" role="alert">{err}</div>}
      <form id="storeform" className="panel formgrid" onSubmit={save}>
        {FIELDS.map((k) => (
          <div className="frow" key={k}>
            <label htmlFor={k}>{t(`store.${k}` as Key)}</label>
            <input id={k} value={v[k] ?? ''} maxLength={300} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            {k === 'announcement' && <small>{t('store.announcement.hint')}</small>}
          </div>
        ))}
      </form>
    </section>
  );
}
