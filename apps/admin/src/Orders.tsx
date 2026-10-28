import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const STATUS: Record<string, string> = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', processing: 'প্রস্তুত হচ্ছে', shipped: 'পথে আছে', delivered: 'পৌঁছেছে', cancelled: 'বাতিল' };
const ACTION: Record<string, string> = { confirmed: 'নিশ্চিত করুন', processing: 'প্রস্তুত শুরু', shipped: 'কুরিয়ারে দিন', delivered: 'ডেলিভারি সম্পন্ন', cancelled: 'অর্ডার বাতিল' };
const taka = (n: number) => '৳' + Number(n).toLocaleString('en-US');
const when = (s: string) => new Date(s).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });

type Order = { orderNo: string; name: string; phone: string; zone: string; total: number; paymentStatus: string; status: string; createdAt: string };
type Detail = Order & { address: string; note: string | null; subtotal: number; deliveryFee: number; paymentMethod: string; items: { name: string; label: string; qty: number; unitPrice: number }[]; next: string[] };

export function Orders({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ items: Order[]; total: number; counts: Record<string, number> }>({ items: [], total: 0, counts: {} });
  const [sel, setSel] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) });
    api<typeof data>('GET', `/orders?${p}`).then(setData).catch((e) => setErr(e.message));
  }, [status, q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const open = (no: string) => api<Detail>('GET', `/orders/${no}`).then(setSel).catch((e) => setErr(e.message));
  async function act(body: unknown) {
    setErr('');
    try { await api('PUT', `/orders/${sel!.orderNo}/status`, body); await open(sel!.orderNo); load(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section>
      <div className="bar"><h2>অর্ডার</h2><input className="search" placeholder="নম্বর, ফোন বা নাম" aria-label="খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="tabs">
        <button className={!status ? 'on' : ''} onClick={() => setStatus('')}>সব</button>
        {Object.entries(STATUS).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l} <b>{data.counts[k] ?? 0}</b></button>)}
      </div>
      {err && <p className="errmsg" role="alert">{err}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>অর্ডার</th><th>গ্রাহক</th><th>মোট</th><th>পেমেন্ট</th><th>অবস্থা</th><th>সময়</th></tr></thead>
        <tbody>
          {data.items.map((o) => (
            <tr key={o.orderNo} className="click" onClick={() => open(o.orderNo)}>
              <td className="mono">{o.orderNo}</td><td>{o.name}<br /><small className="muted mono">{o.phone}</small></td><td className="mono">{taka(o.total)}</td>
              <td>{o.paymentStatus === 'paid' ? <span className="chip ok">পরিশোধিত</span> : <span className="chip off">বাকি</span>}</td>
              <td><span className={`chip st-${o.status}`}>{STATUS[o.status]}</span></td><td className="muted">{when(o.createdAt)}</td>
            </tr>
          ))}
          {!data.items.length && <tr><td colSpan={6} className="muted">কোনো অর্ডার নেই</td></tr>}
        </tbody>
      </table></div>

      {sel && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="card wide">
            <div className="bar"><h3 className="mono">{sel.orderNo}</h3><span className={`chip st-${sel.status}`}>{STATUS[sel.status]}</span></div>
            <p><b>{sel.name}</b> · <span className="mono">{sel.phone}</span><br />{sel.address}<br /><small className="muted">এলাকা: {sel.zone}{sel.note ? ` · নোট: ${sel.note}` : ''}</small></p>
            <table><tbody>
              {sel.items.map((i, k) => <tr key={k}><td>{i.name} <small className="muted">{i.label}</small></td><td className="mono">{i.qty} × {taka(i.unitPrice)}</td><td className="mono r">{taka(i.qty * i.unitPrice)}</td></tr>)}
              <tr><td colSpan={2}>ডেলিভারি চার্জ</td><td className="mono r">{taka(sel.deliveryFee)}</td></tr>
              <tr><td colSpan={2}><b>মোট ({sel.paymentMethod.toUpperCase()})</b></td><td className="mono r"><b>{taka(sel.total)}</b></td></tr>
            </tbody></table>
            {err && <p className="errmsg" role="alert">{err}</p>}
            {canEdit && (
              <div className="row">
                {sel.next.map((s) => <button key={s} className={`btn ${s === 'cancelled' ? 'dangerbtn' : ''}`} onClick={() => act({ status: s })}>{ACTION[s]}</button>)}
                {sel.paymentStatus !== 'paid' && sel.status !== 'cancelled' && <button className="btn ghost" onClick={() => act({ paymentStatus: 'paid' })}>পেমেন্ট পেয়েছি</button>}
              </div>
            )}
            <button className="btn ghost" onClick={() => setSel(null)} style={{ marginTop: 12 }}>বন্ধ করুন</button>
          </div>
        </div>
      )}
    </section>
  );
}
