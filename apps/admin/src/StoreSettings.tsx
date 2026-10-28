import { useEffect, useState } from 'react';
import { api } from './api';
import { useT, type Key } from './i18n';
import { useErr } from './ui';

const FIELDS = ['store_name', 'tagline', 'phone', 'whatsapp', 'email', 'address', 'hours_text', 'drug_license', 'pharmacist_name', 'pharmacist_reg', 'facebook_url', 'announcement'] as const;

export function StoreSettings() {
  const { t } = useT();
  const errText = useErr();
  const [v, setV] = useState<Record<string, any>>({});
  const [flash, setFlash] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api<Record<string, any>>('GET', '/settings/store').then(setV).catch((e) => setErr(errText(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('PUT', '/settings/store', { ...Object.fromEntries(FIELDS.map((k) => [k, v[k] ?? ''])), hide_out_of_stock: v.hide_out_of_stock !== false && v.hide_out_of_stock !== 'false', low_stock_at: Number(v.low_stock_at ?? 10), expiry_warn_days: Number(v.expiry_warn_days ?? 60) }); setFlash(t('common.saved')); } catch (x) { setErr(errText(x)); }
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
        <div className="frow span2 rule"><b>Stock rules</b></div>
        <label className="swl span2"><input className="switch" type="checkbox" role="switch" checked={v.hide_out_of_stock !== false && v.hide_out_of_stock !== 'false'} onChange={(e) => setV({ ...v, hide_out_of_stock: e.target.checked })} />{t('store.hide_out_of_stock')}</label>
        <div className="frow"><label htmlFor="lsa">{t('store.low_stock_at')}</label><input id="lsa" type="number" min="0" value={v.low_stock_at ?? 10} onChange={(e) => setV({ ...v, low_stock_at: e.target.value })} /></div>
        <div className="frow"><label htmlFor="ewd">{t('store.expiry_warn_days')}</label><input id="ewd" type="number" min="1" value={v.expiry_warn_days ?? 60} onChange={(e) => setV({ ...v, expiry_warn_days: e.target.value })} /></div>
      </form>
    </section>
  );
}
