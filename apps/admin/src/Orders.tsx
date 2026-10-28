import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useT, type Key } from './i18n';
import { Icon, useErr } from './ui';

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export const taka = (n: number) => '৳' + Number(n).toLocaleString('en-US');

export type Order = { orderNo: string; name: string; phone: string; zone: string; total: number; paymentStatus: string; status: string; createdAt: string };
type Detail = Order & { address: string; note: string | null; subtotal: number; deliveryFee: number; paymentMethod: string; items: { name: string; label: string; qty: number; unitPrice: number }[]; next: string[] };

export function useWhen() {
  const { lang } = useT();
  return (s: string) => new Date(s).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

export const StatusPill = ({ s }: { s: string }) => { const { t } = useT(); return <span className={`pill st-${s}`}>{t(`status.${s}` as Key)}</span>; };

export function Orders({ canEdit }: { canEdit: boolean }) {
  const { t } = useT();
  const errText = useErr();
  const when = useWhen();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ items: Order[]; total: number; counts: Record<string, number> }>({ items: [], total: 0, counts: {} });
  const [sel, setSel] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), limit: '50' });
    api<typeof data>('GET', `/orders?${p}`).then(setData).catch((e) => setErr(errText(e)));
  }, [status, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);

  const open = (no: string) => api<Detail>('GET', `/orders/${no}`).then(setSel).catch((e) => setErr(errText(e)));
  async function act(body: unknown) {
    setErr('');
    try { await api('PUT', `/orders/${sel!.orderNo}/status`, body); await open(sel!.orderNo); load(); } catch (e) { setErr(errText(e)); }
  }
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);

  return (
    <section>
      <header className="pagehead"><h1>{t('orders.title')}</h1>
        <div className="tools"><label className="searchbox"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('orders.search')} aria-label={t('orders.search')} /></label></div></header>
      <div className="segs" role="tablist">
        <button role="tab" aria-selected={!status} onClick={() => setStatus('')}>{t('common.all')}<b>{all}</b></button>
        {STATUSES.map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}>{t(`status.${s}` as Key)}<b>{data.counts[s] ?? 0}</b></button>)}
      </div>
      {err && !sel && <div className="notice err" role="alert">{err}</div>}
      <div className="panel"><table className="grid">
        <thead><tr><th>{t('orders.order')}</th><th>{t('orders.customer')}</th><th className="r">{t('orders.total')}</th><th>{t('orders.payment')}</th><th>{t('orders.status')}</th><th>{t('orders.placed')}</th></tr></thead>
        <tbody>
          {data.items.map((o) => (
            <tr key={o.orderNo} className="click" tabIndex={0} onClick={() => open(o.orderNo)} onKeyDown={(e) => { if (e.key === 'Enter') open(o.orderNo); }}>
              <td className="num strong">{o.orderNo}</td><td>{o.name} <span className="dim num">{o.phone}</span></td><td className="num r">{taka(o.total)}</td>
              <td><span className={`pill ${o.paymentStatus === 'paid' ? 'ok' : 'warn'}`}>{o.paymentStatus === 'paid' ? t('orders.paid') : t('orders.unpaid')}</span></td>
              <td><StatusPill s={o.status} /></td><td className="dim">{when(o.createdAt)}</td>
            </tr>
          ))}
          {!data.items.length && <tr><td colSpan={6} className="empty">{t('orders.none')}</td></tr>}
        </tbody>
      </table><footer className="tfoot">{data.total} {t('common.rows')}</footer></div>

      {sel && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="dialog wide">
            <div className="dhead"><h2 className="num">{sel.orderNo} <StatusPill s={sel.status} /></h2><button className="icon" aria-label={t('common.close')} onClick={() => setSel(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              <p className="addr"><b>{sel.name}</b> <span className="num dim">{sel.phone}</span><br />{sel.address}<br /><span className="dim">{t('orders.zone')}: {sel.zone}{sel.note ? ` · ${t('orders.note')}: ${sel.note}` : ''}</span></p>
              <table className="grid flush"><tbody>
                {sel.items.map((i, k) => <tr key={k}><td>{i.name} <span className="dim">{i.label}</span></td><td className="num r">{i.qty} × {taka(i.unitPrice)}</td><td className="num r">{taka(i.qty * i.unitPrice)}</td></tr>)}
                <tr><td colSpan={2} className="dim">{t('orders.deliveryFee')}</td><td className="num r">{taka(sel.deliveryFee)}</td></tr>
                <tr className="sumrow"><td colSpan={2}>{t('orders.total')} · {sel.paymentMethod.toUpperCase()}</td><td className="num r">{taka(sel.total)}</td></tr>
              </tbody></table>
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot">
              {canEdit && sel.next.map((s) => <button key={s} className={`btn ${s === 'cancelled' ? 'danger' : 'primary'}`} onClick={() => act({ status: s })}>{t(`act.${s}` as Key)}</button>)}
              {canEdit && sel.paymentStatus !== 'paid' && sel.status !== 'cancelled' && <button className="btn" onClick={() => act({ paymentStatus: 'paid' })}>{t('orders.markPaid')}</button>}
              <button className="btn" onClick={() => setSel(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
