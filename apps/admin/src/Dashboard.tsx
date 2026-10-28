import { useEffect, useState } from 'react';
import { api } from './api';
import { useT } from './i18n';
import { StatusPill, taka, useWhen, type Order } from './Orders';
import { Icon, useErr } from './ui';

type Stats = { pending: number; ordersToday: number; salesToday: number; toShip: number; lowStock: number; expiringBatches: number; lowStockAt: number; expiryWarnDays: number };

export function Dashboard() {
  const { t } = useT();
  const errText = useErr();
  const when = useWhen();
  const [s, setS] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Stats>('GET', '/stats').then(setS).catch((e) => setErr(errText(e)));
    api<{ items: Order[] }>('GET', '/orders?limit=8').then((r) => setRecent(r.items)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles: { label: string; value: string; hint?: string; tone?: string; icon: 'orders' | 'payment' | 'clock' | 'delivery' | 'alert' }[] = s ? [
    { label: t('dash.salesToday'), value: taka(s.salesToday), icon: 'payment' },
    { label: t('dash.ordersToday'), value: String(s.ordersToday), icon: 'orders' },
    { label: t('dash.pending'), value: String(s.pending), icon: 'clock', tone: s.pending ? 'warn' : '' },
    { label: t('dash.toShip'), value: String(s.toShip), icon: 'delivery' },
    { label: t('dash.lowStock'), value: String(s.lowStock), hint: t('dash.lowStockHint', { n: s.lowStockAt }), icon: 'alert', tone: s.lowStock ? 'warn' : '' },
    { label: t('dash.expiring'), value: String(s.expiringBatches), hint: t('dash.expiringHint', { n: s.expiryWarnDays }), icon: 'alert', tone: s.expiringBatches ? 'bad' : '' },
  ] : [];

  return (
    <section>
      <header className="pagehead"><h1>{t('dash.title')}</h1></header>
      {err && <div className="notice err" role="alert">{err}</div>}
      <div className="kpis">
        {tiles.map((k) => (
          <div className={`kpi ${k.tone ?? ''}`} key={k.label}>
            <span className="kl"><Icon name={k.icon} size={13} />{k.label}</span>
            <b className="num">{k.value}</b>
            {k.hint && <small>{k.hint}</small>}
          </div>
        ))}
      </div>
      <header className="pagehead sub2"><h2>{t('dash.recent')}</h2><a className="link" href="#orders">{t('dash.viewAll')}</a></header>
      <div className="panel"><table className="grid">
        <tbody>
          {recent.map((o) => (
            <tr key={o.orderNo}><td className="num strong">{o.orderNo}</td><td>{o.name}</td><td className="num r">{taka(o.total)}</td><td><StatusPill s={o.status} /></td><td className="dim">{when(o.createdAt)}</td></tr>
          ))}
          {!recent.length && <tr><td className="empty">{t('orders.none')}</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}
