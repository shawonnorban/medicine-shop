import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Icon, useErr } from './ui';
import { taka } from './Orders';

type Sup = { id: number; name: string; isActive: boolean };
type Found = { id: number; name: string; strength: string | null; label: string; barcode: string | null; generic: string | null; company: string | null; stock: number };
type Line = { variantId: number; title: string; batchNo: string; expiryDate: string; qty: string; costPrice: string };
type Purchase = { id: number; invoiceNo: string | null; totalCost: number; createdAt: string; supplier: string | null; by: string | null; lines: number; units: number };

export function Purchases({ canEdit }: { canEdit: boolean }) {
  const errText = useErr();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [sups, setSups] = useState<Sup[]>([]);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(''); const [invoiceNo, setInvoiceNo] = useState(''); const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState(''); const [found, setFound] = useState<Found[]>([]);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState(''); const [busy, setBusy] = useState(false);
  const qRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => { api<{ items: Purchase[] }>('GET', '/purchases').then((r) => setRows(r.items)).catch((e) => setErr(errText(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); api<Sup[]>('GET', '/suppliers').then(setSups).catch(() => {}); }, [load]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const id = setTimeout(() => api<Found[]>('GET', `/variants/search?q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => {}), 150);
    return () => clearTimeout(id);
  }, [q]);

  function start() { setOpen(true); setErr(''); setLines([]); setSupplierId(''); setInvoiceNo(''); setNote(''); setQ(''); setTimeout(() => qRef.current?.focus(), 50); }
  function add(f: Found) {
    setLines((l) => [...l, { variantId: f.id, title: `${f.name} ${f.strength ?? ''} · ${f.label}`, batchNo: '', expiryDate: '', qty: '', costPrice: '' }]);
    setQ(''); setFound([]); qRef.current?.focus();
  }
  const upd = (i: number, k: keyof Line, v: string) => setLines((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.costPrice) || 0), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (!lines.length) return setErr('Add at least one medicine');
    setBusy(true);
    try {
      await api('POST', '/purchases', {
        supplierId: supplierId ? Number(supplierId) : null, invoiceNo: invoiceNo.trim() || null, note: note.trim() || null,
        items: lines.map((l) => ({ variantId: l.variantId, batchNo: l.batchNo.trim(), expiryDate: l.expiryDate, qty: Number(l.qty), costPrice: Number(l.costPrice) })),
      });
      setOpen(false); setFlash('Stock received'); load();
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }

  return (
    <section>
      <header className="pagehead"><div><h1>Purchases</h1><p className="sub">Record goods received from suppliers. Each line becomes a batch with its own expiry date; the medicine goes live on the website as soon as stock exists.</p></div>
        <div className="tools">{canEdit && <button className="btn primary" onClick={start}><Icon name="plus" size={13} />Receive stock</button>}</div></header>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && !open && <div className="notice err" role="alert">{err}</div>}
      <div className="panel"><table className="grid">
        <thead><tr><th>#</th><th>Date</th><th>Supplier</th><th>Invoice</th><th className="r">Lines</th><th className="r">Units</th><th className="r">Cost</th><th>By</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}><td className="num strong">{r.id}</td><td className="dim">{new Date(r.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
            <td>{r.supplier ?? <span className="dim">—</span>}</td><td className="num">{r.invoiceNo ?? <span className="dim">—</span>}</td><td className="num r">{r.lines}</td><td className="num r">{r.units}</td><td className="num r">{taka(r.totalCost)}</td><td className="dim">{r.by ?? '—'}</td></tr>)}
          {!rows.length && <tr><td colSpan={8} className="empty">No purchases yet</td></tr>}
        </tbody>
      </table><footer className="tfoot">{rows.length} purchases</footer></div>

      {open && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="dialog xwide" onSubmit={save}>
            <div className="dhead"><h2>Receive stock</h2><button type="button" className="icon" aria-label="Close" onClick={() => setOpen(false)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              <div className="cols3">
                <div className="frow"><label htmlFor="su">Supplier</label><select id="su" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">—</option>{sups.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="frow"><label htmlFor="inv">Invoice no.</label><input id="inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
                <div className="frow"><label htmlFor="nt">Note</label><input id="nt" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              </div>
              <div className="frow pickrow"><label htmlFor="pick">Add medicine</label>
                <input id="pick" ref={qRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan barcode or type brand / generic name" autoComplete="off" />
                {found.length > 0 && <ul className="picklist">{found.map((f) => <li key={f.id}><button type="button" onClick={() => add(f)}><b>{f.name} {f.strength}</b> <span>{f.label}</span><span className="dim">{[f.generic, f.company].filter(Boolean).join(' · ')}</span><span className="num dim">stock {f.stock}</span></button></li>)}</ul>}
              </div>
              <table className="grid flush vtable"><thead><tr><th>Medicine · pack</th><th>Batch no.</th><th>Expiry</th><th className="r">Qty</th><th className="r">Cost ৳ / unit</th><th className="r">Line</th><th className="act" /></tr></thead><tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="strong">{l.title}</td>
                    <td><input aria-label="Batch number" required className="mono" value={l.batchNo} onChange={(e) => upd(i, 'batchNo', e.target.value)} /></td>
                    <td><input aria-label="Expiry date" required type="date" value={l.expiryDate} onChange={(e) => upd(i, 'expiryDate', e.target.value)} /></td>
                    <td><input aria-label="Quantity" required type="number" min="1" step="1" className="r" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></td>
                    <td><input aria-label="Cost per unit" required type="number" min="0" step="any" className="r" value={l.costPrice} onChange={(e) => upd(i, 'costPrice', e.target.value)} /></td>
                    <td className="num r">{taka((Number(l.qty) || 0) * (Number(l.costPrice) || 0))}</td>
                    <td className="act"><button type="button" className="icon danger" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button></td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan={7} className="empty">Search above to add the medicines you received</td></tr>}
              </tbody></table>
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot"><span className="totalcost">Total cost <b className="num">{taka(total)}</b></span><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy || !lines.length}>Receive stock</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
